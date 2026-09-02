import { randomUUID } from "crypto";
import { mkdir, appendFile, readdir, stat, unlink } from "fs/promises";
import path from "node:path";
import { createRequire as createRequire_ } from "node:module";
import { lt } from "drizzle-orm";
import { getDb } from "../db";
import { requestLogs, systemLogs, activityEvents } from "../../drizzle/schema";
import { ENV } from "../_core/env";

export type SystemLogLevel = "info" | "warn" | "error";

export type RequestLogInput = {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId?: number;
  ip?: string;
  userAgent?: string;
};

export type SystemLogInput = {
  level: SystemLogLevel;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  userId?: number;
  stack?: string;
};

function getLogDir() {
  if (ENV.logDir) return path.resolve(ENV.logDir);
  try {
    const require_ = createRequire_(import.meta.url);
    const { app } = require_("electron") as typeof import("electron");
    return path.join(app.getPath("userData"), "logs");
  } catch {}
  return path.resolve(process.cwd(), "logs");
}

function dateStamp(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function appendJsonLine(fileBase: string, payload: Record<string, unknown>) {
  const dir = getLogDir();
  try {
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${fileBase}-${dateStamp(new Date())}.jsonl`);
    await appendFile(filePath, JSON.stringify(payload) + "\n", "utf8");
  } catch (error) {
    console.error("[Monitoring] Failed to write log file:", error);
  }
}

export function createRequestId() {
  return randomUUID();
}

export function logRequest(input: RequestLogInput) {
  const createdAt = new Date();
  void appendJsonLine("requests", { ...input, createdAt: createdAt.toISOString() });

  try {
    const db = getDb();
    if (!db) return;
    db.insert(requestLogs)
      .values({
        requestId: input.requestId,
        method: input.method,
        path: input.path,
        status: input.status,
        durationMs: input.durationMs,
        userId: input.userId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        createdAt,
      })
      .run();
  } catch (error) {
    console.error("[Monitoring] Failed to insert request log:", error);
  }
}

export function logSystem(input: SystemLogInput) {
  const createdAt = new Date();
  void appendJsonLine("system", { ...input, createdAt: createdAt.toISOString() });

  try {
    const db = getDb();
    if (!db) return;
    db.insert(systemLogs)
      .values({
        level: input.level,
        message: input.message,
        context: input.context ?? null,
        requestId: input.requestId ?? null,
        method: input.method ?? null,
        path: input.path ?? null,
        status: input.status ?? null,
        userId: input.userId ?? null,
        stack: input.stack ?? null,
        createdAt,
      })
      .run();
  } catch (error) {
    console.error("[Monitoring] Failed to insert system log:", error);
  }
}

export async function cleanupOldMonitoringLogs(retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  try {
    const db = getDb();
    if (db) {
      db.delete(requestLogs).where(lt(requestLogs.createdAt, cutoff)).run();
      db.delete(systemLogs).where(lt(systemLogs.createdAt, cutoff)).run();
      db.delete(activityEvents).where(lt(activityEvents.createdAt, cutoff)).run();
    }
  } catch (error) {
    console.error("[Monitoring] Failed to cleanup DB logs:", error);
  }

  const dir = getLogDir();
  try {
    const entries = await readdir(dir);
    const now = Date.now();
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
    await Promise.all(
      entries
        .filter((name) => name.endsWith(".jsonl"))
        .map(async (name) => {
          const p = path.join(dir, name);
          const st = await stat(p);
          if (now - st.mtimeMs > maxAgeMs) {
            await unlink(p);
          }
        })
    );
  } catch (error) {
    return;
  }
}

export type MonitoringErrorShape = {
  name?: string;
  message?: string;
  stack?: string;
};

export function normalizeError(err: unknown): MonitoringErrorShape {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}