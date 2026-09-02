import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { and, eq, like, or } from "drizzle-orm";
import { scenes, sceneVersions, ccmActors, ccmEnvironments, ccmSystems, ccmRules } from "../../drizzle/schema";
import { trackEvent } from "../services/activityTracker";

/**
 * Simple LIKE‑based search across core entities.
 * Returns a heterogeneous array where each item includes a `type` field.
 */
export const searchRouter = router({
  searchAll: protectedProcedure
    .input(z.object({ projectId: z.number(), query: z.string().min(1) }))
    .query(({ ctx, input }) => {
      const { projectId, query } = input;
      const searchPattern = `%${query}%`;
      const dbInstance = db.getDb();
      if (!dbInstance) return [];

      // Scenes
      const sceneResults = dbInstance
        .select()
        .from(scenes)
        .where(
          and(
            eq(scenes.projectId, projectId),
            or(like(scenes.title, searchPattern), like(scenes.description, searchPattern))
          )
        )
        .all()
        .map((r) => ({ type: "scene" as const, id: r.id, title: r.title, snippet: r.description }));

      // Scene Versions (content)
      const versionResults = dbInstance
        .select({ id: sceneVersions.id, content: sceneVersions.content })
        .from(sceneVersions)
        .innerJoin(scenes, eq(sceneVersions.sceneId, scenes.id))
        .where(and(eq(scenes.projectId, projectId), like(sceneVersions.content, searchPattern)))
        .all()
        .map((r) => ({ type: "version" as const, id: r.id, title: "Version", snippet: r.content.slice(0, 200) }));

      // Actors (was characters)
      const actorResults = dbInstance
        .select()
        .from(ccmActors)
        .where(and(eq(ccmActors.projectId, projectId), like(ccmActors.name, searchPattern)))
        .all()
        .map((r) => ({ type: "actor" as const, id: r.id, title: r.name, snippet: r.description }));

      // Environments
      const environmentResults = dbInstance
        .select()
        .from(ccmEnvironments)
        .where(and(eq(ccmEnvironments.projectId, projectId), like(ccmEnvironments.name, searchPattern)))
        .all()
        .map((r) => ({ type: "environment" as const, id: r.id, title: r.name, snippet: null }));

      // Systems
      const systemResults = dbInstance
        .select()
        .from(ccmSystems)
        .where(and(eq(ccmSystems.projectId, projectId), like(ccmSystems.name, searchPattern)))
        .all()
        .map((r) => ({ type: "system" as const, id: r.id, title: r.name, snippet: null }));

      // Rules
      const ruleResults = dbInstance
        .select()
        .from(ccmRules)
        .where(and(eq(ccmRules.projectId, projectId), like(ccmRules.name, searchPattern)))
        .all()
        .map((r) => ({ type: "rule" as const, id: r.id, title: r.name, snippet: null }));

      const results = [
        ...sceneResults,
        ...versionResults,
        ...actorResults,
        ...environmentResults,
        ...systemResults,
        ...ruleResults,
      ];
      trackEvent(ctx.user.id, "search_performed", { projectId: input.projectId, featureName: "search" });
      return results;
    }),
});