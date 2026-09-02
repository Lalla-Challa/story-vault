import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import {
  expressErrorMonitoringMiddleware,
  installProcessErrorHandlers,
  requestMonitoringMiddleware,
  scheduleMonitoringRetentionCleanup,
} from "./monitoring";
import apiRouter from "../api";
import { logSystem, normalizeError } from "../services/monitoringLogger";
import { seedEmailTemplates } from "../seedEmailTemplates";
import { registerAgentSseRoute } from "./agentSse";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Bootstraps the Express + tRPC server.
 * Returns the actual port the server is listening on.
 */
export async function startServer(options?: { port?: number }): Promise<number> {
  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  installProcessErrorHandlers();
  scheduleMonitoringRetentionCleanup(30);

  // Seed email templates on startup (non-blocking, on in-memory DB or sqlite). Idempotent.
  seedEmailTemplates();

  const app = express();
  const server = createServer(app);

  // Body parser with larger size limit for file uploads (.svp import)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(requestMonitoringMiddleware);

  // REST API
  app.use("/api/rest", apiRouter);

  // AI Agent SSE stream
  registerAgentSseRoute(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, ctx, req, path, type }) {
        const normalized = normalizeError(error);
        void logSystem({
          level: "error",
          message: normalized.message ?? "tRPC error",
          requestId: (req as any)?.requestId as string | undefined,
          method: req.method,
          path: path ? `/api/trpc/${path}` : "/api/trpc",
          status: 500,
          userId: ctx?.user?.id,
          context: { type, code: error.code },
          stack: normalized.stack,
        });
      },
    })
  );

  // Renderer serving:
  // - Development: the UI is served by electron-vite's renderer dev server
  //   (which proxies /api → this server). This Express server is API-only.
  // - Production: serve the built SPA from dist/client.
  if (process.env.NODE_ENV === "production") {
    const { serveStatic } = await import("../services/staticServer");
    serveStatic(app);
  }

  app.use(expressErrorMonitoringMiddleware);

  const preferredPort = options?.port ?? ENV.port;
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Main server running on http://localhost:${port}/`);
  });

  return port;
}