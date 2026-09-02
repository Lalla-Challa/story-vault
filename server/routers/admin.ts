import {
  router,
  adminProcedure,
  supportProcedure,
  viewerProcedure,
} from "../_core/trpc";
import { getDb } from "../db";
import {
  users,
  projects,
  scenes,
  sceneVersions,
  ccmActors,
  ccmEnvironments,
  ccmSystems,
  activityEvents,
  userSessions,
  requestLogs,
  systemLogs,
  auditLogs,
  betaRequests,
  systemSettings,
} from "../../drizzle/schema";
import { sql, gte, lte, eq, or, like, and, inArray, desc } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

// ============ ADMIN USERS SUB-ROUTER ============

const usersRouter = router({
  /**
   * users.list query
   *
   * Returns a paginated, optionally searchable list of all users.
   * Search filters by name OR email, case-insensitively.
   * Each user row includes a projectCount derived from the projects table.
   */
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
      })
    )
    .query(({ input }) => {
      const db = getDb();
      if (!db) {
        return { users: [], total: 0, page: input.page, pageSize: input.pageSize };
      }

      const offset = (input.page - 1) * input.pageSize;
      const searchPattern = input.search ? `%${input.search}%` : null;
      const whereClause = searchPattern
        ? or(like(users.name, searchPattern), like(users.email, searchPattern))
        : undefined;

      const rows = db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          suspendedAt: users.suspendedAt,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
          projectCount: sql<number>`(SELECT COUNT(*) FROM ${projects} WHERE ${projects.userId} = ${users.id})`,
        })
        .from(users)
        .where(whereClause)
        .limit(input.pageSize)
        .offset(offset)
        .all();

      const countResult = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(whereClause)
        .get();

      return {
        users: rows,
        total: Number(countResult?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * users.suspend mutation
   *
   * Sets suspendedAt on the target user to the current UTC time.
   * Throws FORBIDDEN if the admin is targeting their own account.
   * Throws NOT_FOUND if the user does not exist.
   */
  suspend: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot suspend or delete your own account.",
        });
      }
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });
      const target = db.select().from(users).where(eq(users.id, input.userId)).limit(1).get();
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      db.update(users).set({ suspendedAt: new Date() }).where(eq(users.id, input.userId)).run();
      return { success: true };
    }),

  /**
   * users.unsuspend mutation
   *
   * Clears suspendedAt on the target user (sets it to null).
   */
  unsuspend: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot suspend or delete your own account.",
        });
      }
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });
      const target = db.select().from(users).where(eq(users.id, input.userId)).limit(1).get();
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      db.update(users).set({ suspendedAt: null }).where(eq(users.id, input.userId)).run();
      return { success: true };
    }),

  /**
   * users.delete mutation
   *
   * Permanently deletes the target user and all associated data via cascading
   * FK constraints. The server verifies that `confirmEmail` matches the target
   * user's email before executing the delete.
   */
  delete: adminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        confirmEmail: z.string().email(),
      })
    )
    .mutation(({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot suspend or delete your own account.",
        });
      }
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });
      const target = db.select().from(users).where(eq(users.id, input.userId)).limit(1).get();
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      if (!target.email || target.email.toLowerCase() !== input.confirmEmail.toLowerCase()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Email confirmation does not match." });
      }
      // Cascading delete via FK constraints.
      db.delete(users).where(eq(users.id, input.userId)).run();
      return { success: true };
    }),
});

// ============ ADMIN PROJECTS SUB-ROUTER ============

const projectsRouter = router({
  /**
   * projects.list query
   *
   * Returns a paginated, optionally searchable list of all projects across all users.
   * Each row includes owner name/email, scene count, character count, and total word count.
   */
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
      })
    )
    .query(({ input }) => {
      const db = getDb();
      if (!db) {
        return { projects: [], total: 0, page: input.page, pageSize: input.pageSize };
      }

      const offset = (input.page - 1) * input.pageSize;
      const searchPattern = input.search ? `%${input.search}%` : null;
      const whereClause = searchPattern
        ? or(
            like(projects.title, searchPattern),
            like(users.name, searchPattern),
            like(users.email, searchPattern)
          )
        : undefined;

      const rows = db
        .select({
          id: projects.id,
          title: projects.title,
          ownerName: users.name,
          ownerEmail: users.email,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
          sceneCount: sql<number>`(SELECT COUNT(*) FROM ${scenes} WHERE ${scenes.projectId} = ${projects.id})`,
          characterCount: sql<number>`(SELECT COUNT(*) FROM ${ccmActors} WHERE ${ccmActors.projectId} = ${projects.id})`,
          totalWordCount: sql<number>`(SELECT COALESCE(SUM(${scenes.wordCount}), 0) FROM ${scenes} WHERE ${scenes.projectId} = ${projects.id})`,
        })
        .from(projects)
        .innerJoin(users, eq(projects.userId, users.id))
        .where(whereClause)
        .orderBy(projects.updatedAt)
        .limit(input.pageSize)
        .offset(offset)
        .all();

      const countResult = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(projects)
        .innerJoin(users, eq(projects.userId, users.id))
        .where(whereClause)
        .get();

      return {
        projects: rows,
        total: Number(countResult?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * projects.inspect query
   *
   * Returns a project's scenes, characters, and world-building notes.
   * Throws NOT_FOUND if the project does not exist.
   */
  inspect: adminProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(({ input }) => {
      const db = getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });
      }

      const projectRow = db
        .select({
          id: projects.id,
          title: projects.title,
          description: projects.description,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
          ownerName: users.name,
          ownerEmail: users.email,
        })
        .from(projects)
        .innerJoin(users, eq(projects.userId, users.id))
        .where(eq(projects.id, input.projectId))
        .limit(1)
        .get();

      if (!projectRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      }

      const projectScenes = db
        .select({
          id: scenes.id,
          title: scenes.title,
          status: scenes.status,
          wordCount: scenes.wordCount,
        })
        .from(scenes)
        .where(eq(scenes.projectId, input.projectId))
        .orderBy(scenes.createdAt)
        .all();

      const projectActors = db
        .select({
          id: ccmActors.id,
          name: ccmActors.name,
          type: ccmActors.type,
        })
        .from(ccmActors)
        .where(eq(ccmActors.projectId, input.projectId))
        .orderBy(ccmActors.id)
        .all();

      const projectEnvironments = db
        .select({
          id: ccmEnvironments.id,
          name: ccmEnvironments.name,
          type: ccmEnvironments.type,
        })
        .from(ccmEnvironments)
        .where(eq(ccmEnvironments.projectId, input.projectId))
        .orderBy(ccmEnvironments.id)
        .all();

      const projectSystems = db
        .select({
          id: ccmSystems.id,
          name: ccmSystems.name,
          type: ccmSystems.type,
        })
        .from(ccmSystems)
        .where(eq(ccmSystems.projectId, input.projectId))
        .orderBy(ccmSystems.id)
        .all();

      return {
        project: projectRow,
        scenes: projectScenes,
        actors: projectActors,
        environments: projectEnvironments,
        systems: projectSystems,
      };
    }),
});

// ============ ADMIN ANALYTICS SUB-ROUTER ============

const analyticsRouter = router({
  /**
   * analytics.featureUsage query
   *
   * Returns event counts grouped by featureName and eventType for a selectable
   * time range (7d, 30d, 90d, all time) with an optional userId filter.
   */
  featureUsage: adminProcedure
    .input(
      z.object({
        timeRange: z.enum(["7d", "30d", "90d", "all"]),
        userId: z.number().int().optional(),
      })
    )
    .query(({ input }) => {
      const db = getDb();
      if (!db) return [];

      const now = new Date();
      const rangeStart: Date | null =
        input.timeRange === "7d"
          ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          : input.timeRange === "30d"
          ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          : input.timeRange === "90d"
          ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          : null;

      const conditions = [];
      if (rangeStart) conditions.push(gte(activityEvents.createdAt, rangeStart));
      if (input.userId !== undefined) conditions.push(eq(activityEvents.userId, input.userId));

      const whereClause =
        conditions.length === 0
          ? undefined
          : conditions.length === 1
          ? conditions[0]
          : and(...conditions);

      const rows = db
        .select({
          featureName: activityEvents.featureName,
          eventType: activityEvents.eventType,
          count: sql<number>`COUNT(*) as count`,
        })
        .from(activityEvents)
        .where(whereClause)
        .groupBy(activityEvents.featureName, activityEvents.eventType)
        .orderBy(sql`count DESC`)
        .all();

      return rows.map((r) => ({
        featureName: r.featureName ?? null,
        eventType: r.eventType,
        count: Number(r.count),
      }));
    }),

  /**
   * analytics.writingTime query
   *
   * Returns heartbeat-derived writing time per user.
   * Each `writing_session_heartbeat` event represents up to 60 seconds of
   * active writing.
   */
  writingTime: adminProcedure
    .input(z.object({ userId: z.number().int().optional() }))
    .query(({ input }) => {
      const db = getDb();
      if (!db) return [];

      const conditions = [eq(activityEvents.eventType, "writing_session_heartbeat")];
      if (input.userId !== undefined) conditions.push(eq(activityEvents.userId, input.userId));

      const rows = db
        .select({
          userId: activityEvents.userId,
          userName: users.name,
          userEmail: users.email,
          heartbeatCount: sql<number>`COUNT(*) as heartbeatCount`,
        })
        .from(activityEvents)
        .innerJoin(users, eq(activityEvents.userId, users.id))
        .where(and(...conditions))
        .groupBy(activityEvents.userId, users.name, users.email)
        .orderBy(sql`heartbeatCount DESC`)
        .all();

      return rows.map((r) => ({
        userId: r.userId,
        userName: r.userName ?? null,
        userEmail: r.userEmail ?? null,
        heartbeatCount: Number(r.heartbeatCount),
        // Each heartbeat = up to 60 seconds of active writing
        estimatedSeconds: Number(r.heartbeatCount) * 60,
      }));
    }),

  /**
   * analytics.heatmap query
   *
   * Returns daily event counts for the past 365 days with an optional userId
   * filter. Only days that have at least one event are returned — the client
   * is responsible for zero-filling missing days.
   */
  heatmap: adminProcedure
    .input(z.object({ userId: z.number().int().optional() }))
    .query(({ input }) => {
      const db = getDb();
      if (!db) return [];

      const now = new Date();
      const start365 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      const conditions = [gte(activityEvents.createdAt, start365)];
      if (input.userId !== undefined) conditions.push(eq(activityEvents.userId, input.userId));

      const rows = db
        .select({
          date: sql<string>`date(${activityEvents.createdAt}, 'unixepoch')`,
          count: sql<number>`COUNT(*) as count`,
        })
        .from(activityEvents)
        .where(and(...conditions))
        .groupBy(sql`date(${activityEvents.createdAt}, 'unixepoch')`)
        .orderBy(sql`date(${activityEvents.createdAt}, 'unixepoch') ASC`)
        .all();

      return rows.map((r) => ({
        date: r.date,
        count: Number(r.count),
      }));
    }),

  /**
   * analytics.writingAnalytics query
   *
   * Aggregates per-project, per-user writing time, word-count delta, and session count.
   */
  writingAnalytics: adminProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        projectId: z.number().int().optional(),
        userId: z.number().int().optional(),
      })
    )
    .query(({ input }) => {
      const db = getDb();
      if (!db) return [];

      const conditions = [
        or(
          eq(activityEvents.eventType, "writing_session_start"),
          eq(activityEvents.eventType, "writing_session_heartbeat")
        ),
      ];

      if (input.from) conditions.push(gte(activityEvents.createdAt, input.from));
      if (input.to) conditions.push(lte(activityEvents.createdAt, input.to));
      if (input.projectId) {
        conditions.push(
          eq(
            sql`CAST(json_extract(${activityEvents.metadata}, '$.projectId') AS INTEGER)`,
            input.projectId
          )
        );
      }
      if (input.userId) conditions.push(eq(activityEvents.userId, input.userId));

      const projectIdFromEvent = sql<number>`CAST(json_extract(${activityEvents.metadata}, '$.projectId') AS INTEGER)`;

      const rows = db
        .select({
          projectId: projectIdFromEvent,
          projectTitle: projects.title,
          userId: activityEvents.userId,
          userName: users.name,
          userEmail: users.email,
          totalSeconds: sql<number>`SUM(COALESCE(${activityEvents.durationSeconds}, 0))`,
          wordDelta: sql<number>`SUM(CAST(json_extract(${activityEvents.metadata}, '$.wordCountDelta') AS INTEGER))`,
          sessionCount: sql<number>`COUNT(DISTINCT CASE WHEN ${activityEvents.eventType} = 'writing_session_start' THEN ${activityEvents.id} END)`,
        })
        .from(activityEvents)
        .innerJoin(users, eq(activityEvents.userId, users.id))
        .leftJoin(projects, eq(projectIdFromEvent, projects.id))
        .where(and(...conditions))
        .groupBy(projectIdFromEvent, projects.title, activityEvents.userId, users.name, users.email)
        .all();

      return rows.map((r) => ({
        projectId: Number(r.projectId),
        projectTitle: r.projectTitle ?? "Unknown Project",
        userId: r.userId,
        userName: r.userName ?? null,
        userEmail: r.userEmail ?? null,
        totalSeconds: Number(r.totalSeconds ?? 0),
        wordDelta: Number(r.wordDelta ?? 0),
        sessionCount: Number(r.sessionCount ?? 0),
      }));
    }),
});

// ============ ADMIN FEED SUB-ROUTER ============

const feedRouter = router({
  /**
   * feed.list query
   *
   * Returns the 100 most recent activity_events rows in descending createdAt
   * order, joined to users for userName and userEmail.
   * Optional filters: userId, eventTypes, dateFrom, dateTo.
   */
  list: adminProcedure
    .input(
      z.object({
        userId: z.number().int().optional(),
        eventTypes: z.array(z.string()).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
    )
    .query(({ input }) => {
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.userId !== undefined) conditions.push(eq(activityEvents.userId, input.userId));
      if (input.eventTypes && input.eventTypes.length > 0) {
        conditions.push(inArray(activityEvents.eventType, input.eventTypes));
      }
      if (input.dateFrom) conditions.push(gte(activityEvents.createdAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(activityEvents.createdAt, new Date(input.dateTo)));

      const whereClause =
        conditions.length === 0
          ? undefined
          : conditions.length === 1
          ? conditions[0]
          : and(...conditions);

      const rows = db
        .select({
          id: activityEvents.id,
          userId: activityEvents.userId,
          userName: users.name,
          userEmail: users.email,
          eventType: activityEvents.eventType,
          featureName: activityEvents.featureName,
          metadata: activityEvents.metadata,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .innerJoin(users, eq(activityEvents.userId, users.id))
        .where(whereClause)
        .orderBy(sql`${activityEvents.createdAt} DESC`)
        .limit(100)
        .all();

      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.userName ?? null,
        userEmail: r.userEmail ?? null,
        eventType: r.eventType,
        featureName: r.featureName ?? null,
        metadata: r.metadata ?? null,
        createdAt: r.createdAt,
      }));
    }),
});

function timeRangeToStartDate(timeRange: "7d" | "30d" | "90d" | "all") {
  if (timeRange === "all") return new Date(0);
  const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function stripHtmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const monitoringRouter = router({
  health: adminProcedure.query(() => {
    const db = getDb();
    const now = new Date();
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000);

    const base = {
      ok: true,
      serverTime: now.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
    };

    if (!db) {
      return {
        ...base,
        dbAvailable: false,
        last5mRequests: 0,
        last5mErrors: 0,
        last5mP95Ms: 0,
        last5mActiveUsers: 0,
      };
    }

    const reqCountRes = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(requestLogs)
      .where(gte(requestLogs.createdAt, windowStart))
      .get();
    const errCountRes = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(systemLogs)
      .where(and(gte(systemLogs.createdAt, windowStart), eq(systemLogs.level, "error")))
      .get();
    const activeUsersRes = db
      .select({ count: sql<number>`COUNT(DISTINCT ${requestLogs.userId})` })
      .from(requestLogs)
      .where(and(gte(requestLogs.createdAt, windowStart), sql`${requestLogs.userId} IS NOT NULL`))
      .get();
    const durations = db
      .select({ durationMs: requestLogs.durationMs })
      .from(requestLogs)
      .where(gte(requestLogs.createdAt, windowStart))
      .limit(2000)
      .all();

    const sorted = durations.map((d) => d.durationMs).sort((a, b) => a - b);
    const idx = sorted.length === 0 ? -1 : Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const p95 = idx >= 0 ? sorted[idx] : 0;

    return {
      ...base,
      dbAvailable: true,
      last5mRequests: Number(reqCountRes?.count ?? 0),
      last5mErrors: Number(errCountRes?.count ?? 0),
      last5mP95Ms: p95,
      last5mActiveUsers: Number(activeUsersRes?.count ?? 0),
    };
  }),

  requests: router({
    list: adminProcedure
      .input(
        z.object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(50),
          requestId: z.string().optional(),
          userId: z.number().int().optional(),
          path: z.string().optional(),
          statusMin: z.number().int().optional(),
          statusMax: z.number().int().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        })
      )
      .query(({ input }) => {
        const db = getDb();
        if (!db) return { rows: [], total: 0, page: input.page, pageSize: input.pageSize };

        const offset = (input.page - 1) * input.pageSize;
        const conditions = [];
        if (input.requestId) conditions.push(eq(requestLogs.requestId, input.requestId));
        if (input.userId) conditions.push(eq(requestLogs.userId, input.userId));
        if (input.path) conditions.push(like(requestLogs.path, `%${input.path}%`));
        if (input.statusMin !== undefined) conditions.push(gte(requestLogs.status, input.statusMin));
        if (input.statusMax !== undefined) conditions.push(lte(requestLogs.status, input.statusMax));
        if (input.dateFrom) conditions.push(gte(requestLogs.createdAt, new Date(input.dateFrom)));
        if (input.dateTo) conditions.push(lte(requestLogs.createdAt, new Date(input.dateTo)));

        const whereClause =
          conditions.length === 0
            ? undefined
            : conditions.length === 1
            ? conditions[0]
            : and(...conditions);

        const rows = db
          .select({
            id: requestLogs.id,
            requestId: requestLogs.requestId,
            method: requestLogs.method,
            path: requestLogs.path,
            status: requestLogs.status,
            durationMs: requestLogs.durationMs,
            userId: requestLogs.userId,
            ip: requestLogs.ip,
            userAgent: requestLogs.userAgent,
            createdAt: requestLogs.createdAt,
          })
          .from(requestLogs)
          .where(whereClause)
          .orderBy(sql`${requestLogs.createdAt} DESC`)
          .limit(input.pageSize)
          .offset(offset)
          .all();

        const countRes = db
          .select({ count: sql<number>`COUNT(*)` })
          .from(requestLogs)
          .where(whereClause)
          .get();

        return {
          rows,
          total: Number(countRes?.count ?? 0),
          page: input.page,
          pageSize: input.pageSize,
        };
      }),
  }),

  system: router({
    list: adminProcedure
      .input(
        z.object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(50),
          level: z.enum(["info", "warn", "error"]).optional(),
          requestId: z.string().optional(),
          userId: z.number().int().optional(),
          path: z.string().optional(),
          message: z.string().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        })
      )
      .query(({ input }) => {
        const db = getDb();
        if (!db) return { rows: [], total: 0, page: input.page, pageSize: input.pageSize };

        const offset = (input.page - 1) * input.pageSize;
        const conditions = [];
        if (input.level) conditions.push(eq(systemLogs.level, input.level));
        if (input.requestId) conditions.push(eq(systemLogs.requestId, input.requestId));
        if (input.userId) conditions.push(eq(systemLogs.userId, input.userId));
        if (input.path) conditions.push(like(systemLogs.path, `%${input.path}%`));
        if (input.message) conditions.push(like(systemLogs.message, `%${input.message}%`));
        if (input.dateFrom) conditions.push(gte(systemLogs.createdAt, new Date(input.dateFrom)));
        if (input.dateTo) conditions.push(lte(systemLogs.createdAt, new Date(input.dateTo)));

        const whereClause =
          conditions.length === 0
            ? undefined
            : conditions.length === 1
            ? conditions[0]
            : and(...conditions);

        const rows = db
          .select({
            id: systemLogs.id,
            level: systemLogs.level,
            message: systemLogs.message,
            context: systemLogs.context,
            requestId: systemLogs.requestId,
            method: systemLogs.method,
            path: systemLogs.path,
            status: systemLogs.status,
            userId: systemLogs.userId,
            stack: systemLogs.stack,
            createdAt: systemLogs.createdAt,
          })
          .from(systemLogs)
          .where(whereClause)
          .orderBy(sql`${systemLogs.createdAt} DESC`)
          .limit(input.pageSize)
          .offset(offset)
          .all();

        const countRes = db
          .select({ count: sql<number>`COUNT(*)` })
          .from(systemLogs)
          .where(whereClause)
          .get();

        return {
          rows,
          total: Number(countRes?.count ?? 0),
          page: input.page,
          pageSize: input.pageSize,
        };
      }),
  }),

  userInsights: adminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        timeRange: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
      })
    )
    .query(({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });

      const start = timeRangeToStartDate(input.timeRange);

      const userRow = db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
          suspendedAt: users.suspendedAt,
        })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1)
        .get();

      if (!userRow) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });

      const projectIdFromEvent = sql<number>`CAST(json_extract(${activityEvents.metadata}, '$.projectId') AS INTEGER)`;
      const sceneIdFromEvent = sql<number>`CAST(json_extract(${activityEvents.metadata}, '$.sceneId') AS INTEGER)`;

      const sessionAgg = db
        .select({
          sessionCount: sql<number>`COUNT(*)`,
          totalSeconds: sql<number>`COALESCE(SUM(${userSessions.durationSeconds}), 0)`,
        })
        .from(userSessions)
        .where(
          and(
            eq(userSessions.userId, input.userId),
            gte(userSessions.startedAt, start),
            sql`${userSessions.durationSeconds} IS NOT NULL`,
            gte(userSessions.durationSeconds, 10)
          )
        )
        .get();

      const topFeatures = db
        .select({
          featureName: activityEvents.featureName,
          count: sql<number>`COUNT(*)`,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.userId, input.userId),
            gte(activityEvents.createdAt, start),
            sql`${activityEvents.featureName} IS NOT NULL`
          )
        )
        .groupBy(activityEvents.featureName)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(10)
        .all();

      const writingByProject = db
        .select({
          projectId: projectIdFromEvent,
          projectTitle: projects.title,
          heartbeatCount: sql<number>`COUNT(*)`,
        })
        .from(activityEvents)
        .leftJoin(projects, sql`${projects.id} = ${projectIdFromEvent}`)
        .where(
          and(
            eq(activityEvents.userId, input.userId),
            eq(activityEvents.eventType, "writing_session_heartbeat"),
            gte(activityEvents.createdAt, start),
            sql`${activityEvents.metadata} IS NOT NULL`,
            sql`json_extract(${activityEvents.metadata}, '$.projectId') IS NOT NULL`
          )
        )
        .groupBy(projectIdFromEvent, projects.title)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(50)
        .all();

      const recentSaves = db
        .select({
          id: activityEvents.id,
          createdAt: activityEvents.createdAt,
          sceneId: sceneIdFromEvent,
          sceneTitle: scenes.title,
          projectId: scenes.projectId,
          projectTitle: projects.title,
        })
        .from(activityEvents)
        .leftJoin(scenes, sql`${scenes.id} = ${sceneIdFromEvent}`)
        .leftJoin(projects, eq(projects.id, scenes.projectId))
        .where(
          and(
            eq(activityEvents.userId, input.userId),
            eq(activityEvents.eventType, "scene_version_saved"),
            gte(activityEvents.createdAt, start),
            sql`${activityEvents.metadata} IS NOT NULL`,
            sql`json_extract(${activityEvents.metadata}, '$.sceneId') IS NOT NULL`
          )
        )
        .orderBy(sql`${activityEvents.createdAt} DESC`)
        .limit(20)
        .all();

      const recentWriting = db
        .select({
          versionId: sceneVersions.id,
          versionLabel: sceneVersions.versionLabel,
          createdAt: sceneVersions.createdAt,
          sceneId: scenes.id,
          sceneTitle: scenes.title,
          projectId: projects.id,
          projectTitle: projects.title,
          content: sceneVersions.content,
        })
        .from(sceneVersions)
        .innerJoin(scenes, eq(sceneVersions.sceneId, scenes.id))
        .innerJoin(projects, eq(scenes.projectId, projects.id))
        .where(and(eq(projects.userId, input.userId), gte(sceneVersions.createdAt, start)))
        .orderBy(sql`${sceneVersions.createdAt} DESC`)
        .limit(20)
        .all();

      return {
        user: userRow,
        sessions: {
          count: Number(sessionAgg?.sessionCount ?? 0),
          totalSeconds: Number(sessionAgg?.totalSeconds ?? 0),
        },
        topFeatures: topFeatures.map((r) => ({
          featureName: r.featureName ?? "unknown",
          count: Number(r.count ?? 0),
        })),
        writingByProject: writingByProject.map((r) => ({
          projectId: Number(r.projectId),
          projectTitle: r.projectTitle ?? null,
          heartbeatCount: Number(r.heartbeatCount ?? 0),
          estimatedSeconds: Number(r.heartbeatCount ?? 0) * 60,
        })),
        recentSaves: recentSaves.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          sceneId: Number(r.sceneId),
          sceneTitle: r.sceneTitle ?? null,
          projectId: r.projectId ?? null,
          projectTitle: r.projectTitle ?? null,
        })),
        recentWriting: recentWriting.map((r) => {
          const text = stripHtmlToText(r.content ?? "");
          return {
            versionId: r.versionId,
            versionLabel: r.versionLabel,
            createdAt: r.createdAt,
            sceneId: r.sceneId,
            sceneTitle: r.sceneTitle,
            projectId: r.projectId,
            projectTitle: r.projectTitle,
            preview: text.slice(0, 280),
            charCount: text.length,
          };
        }),
      };
    }),
});

// ============ ADMIN SCENES SUB-ROUTER ============

const scenesRouter = router({
  list: supportProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
      })
    )
    .query(({ input }) => {
      const db = getDb();
      if (!db) return { scenes: [], total: 0 };

      const offset = (input.page - 1) * input.pageSize;
      const searchPattern = input.search ? `%${input.search}%` : null;
      const whereClause = searchPattern
        ? or(
            like(scenes.title, searchPattern),
            like(users.name, searchPattern),
            like(users.email, searchPattern)
          )
        : undefined;

      const rows = db
        .select({
          id: scenes.id,
          title: scenes.title,
          status: scenes.status,
          wordCount: scenes.wordCount,
          ownerName: users.name,
          ownerEmail: users.email,
          projectId: scenes.projectId,
          createdAt: scenes.createdAt,
        })
        .from(scenes)
        .innerJoin(projects, eq(scenes.projectId, projects.id))
        .innerJoin(users, eq(projects.userId, users.id))
        .where(whereClause)
        .limit(input.pageSize)
        .offset(offset)
        .all();

      const countRes = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(scenes)
        .innerJoin(projects, eq(scenes.projectId, projects.id))
        .innerJoin(users, eq(projects.userId, users.id))
        .where(whereClause)
        .get();

      return {
        scenes: rows,
        total: Number(countRes?.count ?? 0),
      };
    }),
});

// ============ ADMIN SYSTEM SETTINGS SUB-ROUTER ============
const systemSettingsRouter = router({
  get: viewerProcedure.query(() => {
    const db = getDb();
    if (!db) return [];
    return db.select().from(systemSettings).all();
  }),

  set: adminProcedure
    .input(z.object({ key: z.string(), value: z.any() }))
    .mutation(({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      db.insert(systemSettings)
        .values(input)
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: input.value } })
        .run();
      ctx.logAction("update_system_setting", "setting", undefined, { key: input.key, value: input.value });
      return { success: true };
    }),
});

// ============ ADMIN ROUTER ============
export const adminRouter = router({
  overview: viewerProcedure.query(() => {
    const db = getDb();
    if (!db) {
      return {
        totalUsers: 0,
        totalProjects: 0,
        events24h: 0,
        activeSessions: 0,
        waitlistFunnel: { submitted: 0, approved: 0, invited: 0 },
        betaHealth: { weeklyActive: 0, avgWritingTime: 0 },
      };
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const totalUsersRes = db.select({ count: sql<number>`COUNT(*)` }).from(users).get();
    const totalProjectsRes = db.select({ count: sql<number>`COUNT(*)` }).from(projects).get();
    const events24hRes = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(activityEvents)
      .where(gte(activityEvents.createdAt, twentyFourHoursAgo))
      .get();
    const activeSessionsRes = db
      .select({ count: sql<number>`COUNT(DISTINCT ${userSessions.userId})` })
      .from(userSessions)
      .where(
        sql`${userSessions.endedAt} IS NULL AND EXISTS (
          SELECT 1 FROM ${activityEvents}
          WHERE ${activityEvents.userId} = ${userSessions.userId}
            AND ${activityEvents.createdAt} >= ${thirtyMinutesAgo}
        )`
      )
      .get();
    const funnelRes = db
      .select({
        status: betaRequests.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(betaRequests)
      .groupBy(betaRequests.status)
      .all();
    const betaHealthRes = db
      .select({
        count: sql<number>`COUNT(DISTINCT ${activityEvents.userId})`,
      })
      .from(activityEvents)
      .where(
        and(
          gte(activityEvents.createdAt, sevenDaysAgo),
          eq(activityEvents.eventType, "writing_session_heartbeat")
        )
      )
      .get();

    const funnel = { submitted: 0, approved: 0, invited: 0 };
    funnelRes.forEach((r) => {
      if (r.status === "pending") funnel.submitted += r.count;
      if (r.status === "approved") funnel.approved += r.count;
      if (r.status === "invited") funnel.invited += r.count;
    });

    return {
      totalUsers: Number(totalUsersRes?.count ?? 0),
      totalProjects: Number(totalProjectsRes?.count ?? 0),
      events24h: Number(events24hRes?.count ?? 0),
      activeSessions: Number(activeSessionsRes?.count ?? 0),
      waitlistFunnel: funnel,
      betaHealth: {
        weeklyActive: Number(betaHealthRes?.count ?? 0),
        avgWritingTime: 0, // Placeholder
      },
    };
  }),
  users: usersRouter,
  projects: projectsRouter,
  scenes: scenesRouter,
  analytics: analyticsRouter,
  feed: feedRouter,
  monitoring: monitoringRouter,
  auditLogs: router({
    list: adminProcedure.query(() => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100).all();
    }),
  }),
  systemSettings: systemSettingsRouter,
});