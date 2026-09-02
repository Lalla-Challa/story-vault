import type { Request, Response, NextFunction } from "express";
import { cleanupOldMonitoringLogs, createRequestId, logRequest, logSystem, normalizeError } from "../services/monitoringLogger";

export const REQUEST_ID_HEADER = "x-request-id";

export function getRequestId(req: Request) {
  return (req as any).requestId as string | undefined;
}

export function requestMonitoringMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = createRequestId();
  (req as any).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const path = (req.originalUrl || req.url || "").split("?")[0] || "/";
    void logRequest({
      requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs,
      userId: (req as any).userId as number | undefined,
      ip: req.ip,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
    });
  });

  next();
}

export function expressErrorMonitoringMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = getRequestId(req);
  const path = (req.originalUrl || req.url || "").split("?")[0] || "/";
  const normalized = normalizeError(err);

  void logSystem({
    level: "error",
    message: normalized.message ?? "Unhandled server error",
    requestId,
    method: req.method,
    path,
    status: res.statusCode >= 400 ? res.statusCode : 500,
    userId: (req as any).userId as number | undefined,
    stack: normalized.stack,
  });

  next(err);
}

export function installProcessErrorHandlers() {
  process.on("unhandledRejection", (reason) => {
    const normalized = normalizeError(reason);
    void logSystem({
      level: "error",
      message: normalized.message ?? "Unhandled promise rejection",
      stack: normalized.stack,
      context: { name: normalized.name },
    });
  });

  process.on("uncaughtException", (error) => {
    const normalized = normalizeError(error);
    void logSystem({
      level: "error",
      message: normalized.message ?? "Uncaught exception",
      stack: normalized.stack,
      context: { name: normalized.name },
    });
  });
}

export function scheduleMonitoringRetentionCleanup(retentionDays: number) {
  const run = () => cleanupOldMonitoringLogs(retentionDays);
  void run();
  setInterval(run, 24 * 60 * 60 * 1000);
}
