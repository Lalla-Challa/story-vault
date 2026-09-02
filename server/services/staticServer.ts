import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createRequire } from "node:module";

function resolveClientDistPath(): string {
  // Try Electron packaged path first.
  try {
    const require_ = createRequire(import.meta.url);
    const { app } = require_("electron") as typeof import("electron");
    if (app.isPackaged) {
      const candidate = path.join(process.resourcesPath, "dist/client");
      if (fs.existsSync(candidate)) return candidate;
      // Fallback for extraResources layout.
      const appPath = path.dirname(app.getAppPath());
      const fallback = path.join(appPath, "dist/client");
      if (fs.existsSync(fallback)) return fallback;
    }
  } catch {}
  // Dev / plain-node production: cwd-relative dist.
  return path.resolve(process.cwd(), "dist/client");
}

export function serveStatic(app: Express) {
  const distPath = resolveClientDistPath();

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}