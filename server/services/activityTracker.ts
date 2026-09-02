import { eq, and, isNull, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  activityEvents,
  userSessions,
  ActivityEventType,
  ActivityEventMetadata,
} from "../../drizzle/schema";

/**
 * Records a single activity event for a user.
 * Fire-and-forget safe: on DB failure the error is logged and swallowed.
 */
export function trackEvent(
  userId: number,
  eventType: ActivityEventType,
  metadata?: ActivityEventMetadata & { featureName?: string },
  extras?: {
    durationSeconds?: number;
    contentSnapshot?: string;
    diff?: any;
    wordCountStart?: number;
    wordCountEnd?: number;
  }
): void {
  try {
    const db = getDb();
    if (!db) return;

    const { featureName, ...rest } = metadata ?? {};

    db.insert(activityEvents)
      .values({
        userId,
        eventType,
        featureName: featureName ?? null,
        metadata: Object.keys(rest).length > 0 ? rest : null,
        durationSeconds: extras?.durationSeconds,
        contentSnapshot: extras?.contentSnapshot,
        diff: extras?.diff,
      })
      .run();
  } catch (err) {
    console.error("[ActivityTracker] Failed to track event:", eventType, err);
  }
}

/** Start a new writing session – stores full snapshot and initial word count. */
export function startWritingSession(
  userId: number,
  projectId: number,
  snapshot: string,
  wordCount: number
): void {
  trackEvent(
    userId,
    "writing_session_start" as ActivityEventType,
    { featureName: "writing_studio", projectId, wordCountStart: wordCount },
    { contentSnapshot: snapshot, durationSeconds: 0, diff: null }
  );
}

/** Update ongoing session – stores diff and elapsed seconds. */
export function updateWritingSession(
  userId: number,
  projectId: number,
  durationSeconds: number,
  diff: any,
  wordCountDelta: number
): void {
  trackEvent(
    userId,
    "writing_session_heartbeat" as ActivityEventType,
    { featureName: "writing_studio", projectId, wordCountDelta },
    { durationSeconds, diff }
  );
}

/** Opens a new session record for the user (called on unlock). */
export function openSession(userId: number): void {
  try {
    const db = getDb();
    if (!db) return;
    db.insert(userSessions)
      .values({ userId, startedAt: new Date(), endedAt: null, durationSeconds: null })
      .run();
  } catch (err) {
    console.error("[ActivityTracker] Failed to open session for user:", userId, err);
  }
}

/** Closes the most recent open session for the user (called on lock). */
export function closeSession(userId: number): void {
  try {
    const db = getDb();
    if (!db) return;
    const row = db
      .select()
      .from(userSessions)
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.endedAt)))
      .orderBy(desc(userSessions.startedAt))
      .limit(1)
      .get();
    if (!row) return;

    const endedAt = new Date();
    const durationSeconds = Math.floor(
      (endedAt.getTime() - row.startedAt.getTime()) / 1000
    );
    db.update(userSessions)
      .set({ endedAt, durationSeconds })
      .where(eq(userSessions.id, row.id))
      .run();
  } catch (err) {
    console.error("[ActivityTracker] Failed to close session for user:", userId, err);
  }
}