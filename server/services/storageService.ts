import { eq, and, isNull, desc, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import {
  activityEvents,
  userSessions,
  ActivityEventType,
  ActivityEventMetadata,
  sceneVersions,
  scenes,
  projects,
  userStorage,
  ccmActors,
  ccmEnvironments,
  ccmSystems,
  ccmRules,
  ccmRelationships,
  ccmNarrativeConstraints,
  ideas,
  projectMemory,
  chatSessions,
  agentProposals,
  ccmSimulations,
  ccmEvents,
  ccmEpisodes,
  ccmSceneSkeletons,
  ccmSnapshots,
  ccmEventQueue,
} from "../../drizzle/schema";
import { trackEvent } from "./activityTracker";

export function calculateBytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/**
 * Check whether the user has enough storage quota to accommodate `bytesToAdd`
 * (which may be positive, negative, or zero — a signed delta). Throws if the
 * new total would exceed the limit.
 *
 * This function reads the stored `usedBytes` value (kept current by
 * adjustUsage() / recomputeUsage()) and does NOT itself modify it — callers
 * must call adjustUsage() after a successful write, or recomputeUsage() to
 * recalibrate.
 */
export function enforceQuota(userId: number, bytesToAdd: number): void {
  const db = getDb();
  if (!db) return;
  let storage = db.select().from(userStorage).where(eq(userStorage.userId, userId)).get();
  if (!storage) {
    db.insert(userStorage).values({ userId, usedBytes: 0 }).run();
    storage = db.select().from(userStorage).where(eq(userStorage.userId, userId)).get();
  }
  if (!storage) return;
  if (storage.usedBytes + bytesToAdd > storage.limitBytes) {
    trackEvent(userId, "storage_limit_exceeded" as ActivityEventType, {
      featureName: "storage_enforcement",
      actionDetail: `Limit: ${storage.limitBytes}, Attempted total: ${storage.usedBytes + bytesToAdd}`,
    });
    throw new Error(
      `Storage limit exceeded. You have used ${Math.round(storage.usedBytes / 1024 / 1024)}MB of your ${Math.round(storage.limitBytes / 1024 / 1024)}MB limit.`
    );
  }
}

// ─── Byte-length query helpers ─────────────────────────────────────────────

/** SQL fragment: byte length of a column (LENGTH on TEXT counts chars, BLOB counts bytes). Nullable columns contribute 0 so a NULL never nullifies the SUM. */
function blobLen(col: unknown): SQL {
  return sql`COALESCE(LENGTH(CAST(${col as SQL} AS BLOB)), 0)`;
}

/** COALESCE(SUM(a + b + ...), 0) over the given column SQL fragments. */
function sumBlobLen(cols: unknown[]): SQL {
  return sql`COALESCE(SUM(${cols
    .map((c) => blobLen(c))
    .reduce((acc, cur) => sql`${acc} + ${cur}`)}), 0)`;
}

/**
 * Byte-accurate recompute of usedBytes for a user across ALL content-bearing
 * tables (prose spine, world model, ideas, memory, agent artifacts and
 * simulation runs). This is the authoritative calibration — call it after any
 * write (create / update / delete) to keep the quota accurate. Uses
 * `LENGTH(CAST(col AS BLOB))` everywhere for multi-byte correctness.
 */
export function recomputeUsage(userId: number): number {
  const db = getDb();
  if (!db) return 0;

  // ── Scene versions (sizeBytes pre-computed in JS as UTF-8 byte length) ───
  const versionsRes = db
    .select({ total: sql<number>`COALESCE(SUM(${sceneVersions.sizeBytes}), 0)` })
    .from(sceneVersions)
    .innerJoin(scenes, eq(sceneVersions.sceneId, scenes.id))
    .innerJoin(projects, eq(scenes.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  // ── Directly project-scoped tables ───────────────────────────────────────
  const scenesRes = db
    .select({ total: sumBlobLen([scenes.title, scenes.description]) })
    .from(scenes)
    .innerJoin(projects, eq(scenes.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const projectsRes = db
    .select({ total: sumBlobLen([projects.title, projects.description, projects.spec]) })
    .from(projects)
    .where(eq(projects.userId, userId))
    .get();

  const actorRes = db
    .select({
      total: sumBlobLen([
        ccmActors.name, ccmActors.type, ccmActors.description, ccmActors.notes,
        ccmActors.attributes, ccmActors.state, ccmActors.goals, ccmActors.drives,
        ccmActors.beliefs, ccmActors.knowledge, ccmActors.capabilities,
        ccmActors.constraints, ccmActors.resources, ccmActors.habits, ccmActors.plans,
      ]),
    })
    .from(ccmActors)
    .innerJoin(projects, eq(ccmActors.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const envRes = db
    .select({
      total: sumBlobLen([
        ccmEnvironments.name, ccmEnvironments.type, ccmEnvironments.attributes,
        ccmEnvironments.state, ccmEnvironments.resources, ccmEnvironments.inhabitants,
        ccmEnvironments.accessibility, ccmEnvironments.activeProcesses, ccmEnvironments.constraints,
      ]),
    })
    .from(ccmEnvironments)
    .innerJoin(projects, eq(ccmEnvironments.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const systemRes = db
    .select({
      total: sumBlobLen([
        ccmSystems.name, ccmSystems.type, ccmSystems.rules, ccmSystems.constraints,
        ccmSystems.activeConditions, ccmSystems.effects, ccmSystems.exceptions,
      ]),
    })
    .from(ccmSystems)
    .innerJoin(projects, eq(ccmSystems.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const ruleRes = db
    .select({
      total: sumBlobLen([
        ccmRules.name, ccmRules.when, ccmRules.candidateEvents, ccmRules.effects, ccmRules.scope,
      ]),
    })
    .from(ccmRules)
    .innerJoin(projects, eq(ccmRules.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const relationshipRes = db
    .select({
      total: sumBlobLen([ccmRelationships.expectations, ccmRelationships.history]),
    })
    .from(ccmRelationships)
    .innerJoin(projects, eq(ccmRelationships.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const constraintRes = db
    .select({
      total: sumBlobLen([ccmNarrativeConstraints.name, ccmNarrativeConstraints.target, ccmNarrativeConstraints.description]),
    })
    .from(ccmNarrativeConstraints)
    .innerJoin(projects, eq(ccmNarrativeConstraints.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const ideasRes = db
    .select({ total: sumBlobLen([ideas.title, ideas.content]) })
    .from(ideas)
    .innerJoin(projects, eq(ideas.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const memoryRes = db
    .select({ total: sumBlobLen([projectMemory.content]) })
    .from(projectMemory)
    .innerJoin(projects, eq(projectMemory.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const chatRes = db
    .select({
      total: sumBlobLen([chatSessions.messages, chatSessions.compressedContext]),
    })
    .from(chatSessions)
    .innerJoin(projects, eq(chatSessions.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const proposalRes = db
    .select({
      total: sumBlobLen([
        agentProposals.content, agentProposals.originalContent, agentProposals.findString,
        agentProposals.replaceString, agentProposals.summary,
      ]),
    })
    .from(agentProposals)
    .innerJoin(projects, eq(agentProposals.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  // ── Simulation-scoped tables (via ccm_simulations → projects) ───────────
  const simRes = db
    .select({
      total: sumBlobLen([
        ccmSimulations.name, ccmSimulations.description, ccmSimulations.clock, ccmSimulations.settings,
      ]),
    })
    .from(ccmSimulations)
    .innerJoin(projects, eq(ccmSimulations.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const eventsRes = db
    .select({
      total: sumBlobLen([
        ccmEvents.eventType, ccmEvents.participants, ccmEvents.location, ccmEvents.trigger,
        ccmEvents.preconditions, ccmEvents.action, ccmEvents.transition, ccmEvents.consequences,
        ccmEvents.causalLoad, ccmEvents.stateChanges,
      ]),
    })
    .from(ccmEvents)
    .innerJoin(ccmSimulations, eq(ccmEvents.simulationId, ccmSimulations.id))
    .innerJoin(projects, eq(ccmSimulations.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const episodesRes = db
    .select({
      total: sumBlobLen([ccmEpisodes.title, ccmEpisodes.theme, ccmEpisodes.description, ccmEpisodes.eventIds]),
    })
    .from(ccmEpisodes)
    .innerJoin(ccmSimulations, eq(ccmEpisodes.simulationId, ccmSimulations.id))
    .innerJoin(projects, eq(ccmSimulations.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const skeletonRes = db
    .select({
      total: sumBlobLen([
        ccmSceneSkeletons.title, ccmSceneSkeletons.purpose, ccmSceneSkeletons.location,
        ccmSceneSkeletons.time, ccmSceneSkeletons.participants, ccmSceneSkeletons.entryState,
        ccmSceneSkeletons.activePressures, ccmSceneSkeletons.beats, ccmSceneSkeletons.turningPoint,
        ccmSceneSkeletons.exitState, ccmSceneSkeletons.unresolvedThreads,
        ccmSceneSkeletons.importantInformation, ccmSceneSkeletons.continuityNotes,
      ]),
    })
    .from(ccmSceneSkeletons)
    .innerJoin(ccmSimulations, eq(ccmSceneSkeletons.simulationId, ccmSimulations.id))
    .innerJoin(projects, eq(ccmSimulations.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const snapshotRes = db
    .select({ total: sumBlobLen([ccmSnapshots.clock, ccmSnapshots.world]) })
    .from(ccmSnapshots)
    .innerJoin(ccmSimulations, eq(ccmSnapshots.simulationId, ccmSimulations.id))
    .innerJoin(projects, eq(ccmSimulations.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  const queueRes = db
    .select({ total: sumBlobLen([ccmEventQueue.payload]) })
    .from(ccmEventQueue)
    .innerJoin(ccmSimulations, eq(ccmEventQueue.simulationId, ccmSimulations.id))
    .innerJoin(projects, eq(ccmSimulations.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .get();

  // ── Total ────────────────────────────────────────────────────────────────
  const totalUsed =
    Number(versionsRes?.total ?? 0) +
    Number(scenesRes?.total ?? 0) +
    Number(projectsRes?.total ?? 0) +
    Number(actorRes?.total ?? 0) +
    Number(envRes?.total ?? 0) +
    Number(systemRes?.total ?? 0) +
    Number(ruleRes?.total ?? 0) +
    Number(relationshipRes?.total ?? 0) +
    Number(constraintRes?.total ?? 0) +
    Number(ideasRes?.total ?? 0) +
    Number(memoryRes?.total ?? 0) +
    Number(chatRes?.total ?? 0) +
    Number(proposalRes?.total ?? 0) +
    Number(simRes?.total ?? 0) +
    Number(eventsRes?.total ?? 0) +
    Number(episodesRes?.total ?? 0) +
    Number(skeletonRes?.total ?? 0) +
    Number(snapshotRes?.total ?? 0) +
    Number(queueRes?.total ?? 0);

  db.update(userStorage)
    .set({ usedBytes: totalUsed, lastRecomputedAt: new Date() })
    .where(eq(userStorage.userId, userId))
    .run();

  trackEvent(userId, "storage_recomputed" as ActivityEventType, {
    featureName: "storage_management",
    actionDetail: `New total: ${totalUsed} bytes`,
  });

  return totalUsed;
}