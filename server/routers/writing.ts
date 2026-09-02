import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { startWritingSession, updateWritingSession } from "../services/activityTracker";
import { getDb } from "../db";
import { activityEvents } from "../../drizzle/schema";
import { and, eq, gte, desc, sql } from "drizzle-orm";

// ============ WRITING ROUTER ============
export const writingRouter = router({
  /**
   * Heartbeat mutation called by the client-side writing hook at most every
   * 60 seconds while the Writing Studio is open and the user has typed since
   * the last heartbeat.
   */
  heartbeat: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        durationSeconds: z.number().int().optional(),
        diff: z.any().optional(),
        snapshot: z.string().optional(),
        wordCount: z.number().int().optional(),
        wordCountDelta: z.number().int().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      const { projectId, snapshot, wordCount, durationSeconds, diff, wordCountDelta } = input;
      const db = getDb();
      if (!db) return { success: false };

      // Heuristic: check for a recent writing_session_start within 5 min
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

      const recentStart = db
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.userId, ctx.user.id),
            eq(activityEvents.eventType, "writing_session_start"),
            eq(sql`json_extract(${activityEvents.metadata}, '$.projectId')`, projectId),
            gte(activityEvents.createdAt, fiveMinAgo)
          )
        )
        .orderBy(desc(activityEvents.createdAt))
        .limit(1)
        .get();

      if (!recentStart) {
        // No recent start, treat this as a new session
        startWritingSession(ctx.user.id, projectId, snapshot ?? "", wordCount ?? 0);
      } else {
        // Ongoing session, record heartbeat
        updateWritingSession(
          ctx.user.id,
          projectId,
          durationSeconds ?? 60,
          diff ?? null,
          wordCountDelta ?? 0
        );
      }

      return { success: true };
    }),
});