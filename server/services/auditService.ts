import { getDb } from "../db";
import { auditLogs } from "../../drizzle/schema";

export function logAdminAction(
  userId: number,
  action: string,
  entityType?: string,
  entityId?: number,
  metadata?: Record<string, unknown>
): void {
  const db = getDb();
  if (!db) {
    console.warn("[Audit] Database not available, skipping log");
    return;
  }
  try {
    db.insert(auditLogs)
      .values({
        userId,
        action,
        entityType,
        entityId,
        metadata: metadata || null,
        createdAt: new Date(),
      })
      .run();
  } catch (error) {
    console.error("[Audit] Failed to log admin action:", error);
  }
}