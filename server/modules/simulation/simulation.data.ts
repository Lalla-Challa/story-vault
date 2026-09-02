import { eq, and, desc, asc, gt, lt } from "drizzle-orm";
import { getDb } from "../../db";
import {
  ccmSimulations,
  ccmEvents,
  ccmEventCauses,
  ccmEventQueue,
  ccmEpisodes,
  ccmSceneSkeletons,
  ccmSnapshots,
  type InsertCcmSimulation,
  type InsertCcmEvent,
  type InsertCcmEventCause,
  type InsertCcmEventQueueItem,
  type InsertCcmEpisode,
  type InsertCcmSceneSkeleton,
  type InsertCcmSnapshot,
} from "../../../drizzle/schema";
import { getProjectById } from "../projects/project.data";

/**
 * Simulation data access — engine run config + generated history. A simulation
 * is a run of the CCE against a project's world model: it holds seeds,
 * settings and clock, plus the events / causal graph / episodes / skeletons /
 * snapshots that the run produced. World model tables (actors, environments,
 * systems, rules, relationships, constraints) are project-scoped and live in
 * the world module — the loader hydrates them into the engine's World.
 */

// ─── Simulations ────────────────────────────────────────────────────────────

export type SimulationSettings = {
  tickMinutes: number;
  maxEventsPerRun: number;
  granularity: "minute" | "hour" | "day";
};

export function listSimulations(projectId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmSimulations).where(eq(ccmSimulations.projectId, projectId)).all();
}

export function getSimulationById(simulationId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(ccmSimulations).where(eq(ccmSimulations.id, simulationId)).get();
}

export function createSimulation(
  projectId: number,
  name: string,
  description?: string | null,
  settings?: Partial<SimulationSettings>
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const project = getProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const values: InsertCcmSimulation = {
    projectId,
    name,
    description: description ?? null,
    status: "idle",
    worldSeed: 1,
    simulationSeed: 1,
    clock: { day: 0, minute: 6 * 60 }, // day 0, 06:00 by default
    settings: {
      tickMinutes: settings?.tickMinutes ?? 10,
      maxEventsPerRun: settings?.maxEventsPerRun ?? 40,
      granularity: settings?.granularity ?? "hour",
    },
  };
  const result = db.insert(ccmSimulations).values(values).run();
  return getSimulationById(result.lastInsertRowid as number);
}

export function updateSimulation(
  simulationId: number,
  data: {
    name?: string;
    description?: string | null;
    status?: "idle" | "running" | "paused" | "stopped";
    worldSeed?: number;
    simulationSeed?: number;
    clock?: { day: number; minute: number };
    settings?: Partial<SimulationSettings>;
  }
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getSimulationById(simulationId);
  const settings =
    data.settings !== undefined
      ? { ...((existing?.settings as SimulationSettings) ?? {}), ...data.settings }
      : undefined;
  db.update(ccmSimulations)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.worldSeed !== undefined ? { worldSeed: data.worldSeed } : {}),
      ...(data.simulationSeed !== undefined ? { simulationSeed: data.simulationSeed } : {}),
      ...(data.clock !== undefined ? { clock: data.clock } : {}),
      ...(data.settings !== undefined ? { settings: settings } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ccmSimulations.id, simulationId))
    .run();
  return getSimulationById(simulationId);
}

export function deleteSimulation(simulationId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.delete(ccmSimulations).where(eq(ccmSimulations.id, simulationId)).run();
}

// ─── Events ─────────────────────────────────────────────────────────────────

export function listEvents(simulationId: number, opts?: { limit?: number; level?: "micro" | "event"; from?: number; to?: number }) {
  const db = getDb();
  if (!db) return [];
  const conditions = [eq(ccmEvents.simulationId, simulationId)];
  if (opts?.level) conditions.push(eq(ccmEvents.level, opts.level));
  if (opts?.from !== undefined) conditions.push(gt(ccmEvents.timestamp, opts.from));
  if (opts?.to !== undefined) conditions.push(lt(ccmEvents.timestamp, opts.to));
  return db
    .select()
    .from(ccmEvents)
    .where(and(...conditions))
    .orderBy(desc(ccmEvents.timestamp))
    .limit(opts?.limit ?? 500)
    .all();
}

export function getEventById(eventId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(ccmEvents).where(eq(ccmEvents.id, eventId)).get();
}

/** Causal ancestry of an event: walk ccm_event_causes recursively (BFS). */
export function getEventAncestry(eventId: number, maxDepth = 5): number[] {
  const db = getDb();
  if (!db) return [];
  const seen = new Set<number>([eventId]);
  const result: number[] = [];
  let frontier = [eventId];
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    const next: number[] = [];
    for (const id of frontier) {
      const edges = db
        .select({ parentEventId: ccmEventCauses.parentEventId })
        .from(ccmEventCauses)
        .where(eq(ccmEventCauses.eventId, id))
        .all();
      for (const edge of edges) {
        if (!seen.has(edge.parentEventId)) {
          seen.add(edge.parentEventId);
          result.push(edge.parentEventId);
          next.push(edge.parentEventId);
        }
      }
    }
    frontier = next;
    depth++;
  }
  return result;
}

export function insertEventWithCauses(
  simulationId: number,
  event: Omit<InsertCcmEvent, "simulationId">,
  parentEventIds: number[]
): number {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const result = db.insert(ccmEvents).values({ ...event, simulationId }).run();
  const id = result.lastInsertRowid as number;
  if (parentEventIds.length > 0) {
    const rows: InsertCcmEventCause[] = parentEventIds
      .filter((pid) => pid > 0) // temp ids (negative) are same-run events already persisted in order
      .map((pid) => ({ eventId: id, parentEventId: pid }));
    if (rows.length > 0) db.insert(ccmEventCauses).values(rows).run();
  }
  return id;
}

// ─── Event queue ────────────────────────────────────────────────────────────

export function listQueueItems(simulationId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmEventQueue).where(eq(ccmEventQueue.simulationId, simulationId)).orderBy(asc(ccmEventQueue.scheduledAt)).all();
}

export function addQueueItem(simulationId: number, scheduledAt: number, type: string, payload: Record<string, unknown>) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const values: InsertCcmEventQueueItem = { simulationId, scheduledAt, type, payload, status: "pending" };
  const result = db.insert(ccmEventQueue).values(values).run();
  return result.lastInsertRowid as number;
}

export function updateQueueItemStatus(itemId: number, status: "pending" | "processed" | "cancelled") {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.update(ccmEventQueue).set({ status }).where(eq(ccmEventQueue.id, itemId)).run();
}

// ─── Episodes & skeletons ───────────────────────────────────────────────────

export function listEpisodes(simulationId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmEpisodes).where(eq(ccmEpisodes.simulationId, simulationId)).all();
}

export function insertEpisode(simulationId: number, title: string, theme: string | null, description: string, eventIds: number[]): number {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const values: InsertCcmEpisode = { simulationId, title, theme, description, eventIds };
  const result = db.insert(ccmEpisodes).values(values).run();
  return result.lastInsertRowid as number;
}

export function listSkeletons(simulationId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmSceneSkeletons).where(eq(ccmSceneSkeletons.simulationId, simulationId)).all();
}

export function getSkeletonById(skeletonId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(ccmSceneSkeletons).where(eq(ccmSceneSkeletons.id, skeletonId)).get();
}

export function insertSkeleton(simulationId: number, skeleton: Omit<InsertCcmSceneSkeleton, "simulationId">): number {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const result = db.insert(ccmSceneSkeletons).values({ ...skeleton, simulationId }).run();
  return result.lastInsertRowid as number;
}

export function updateSkeleton(skeletonId: number, data: Partial<InsertCcmSceneSkeleton>) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.update(ccmSceneSkeletons).set({ ...data, updatedAt: new Date() }).where(eq(ccmSceneSkeletons.id, skeletonId)).run();
  return getSkeletonById(skeletonId);
}

export function deleteSkeleton(skeletonId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.delete(ccmSceneSkeletons).where(eq(ccmSceneSkeletons.id, skeletonId)).run();
}

// ─── Snapshots ──────────────────────────────────────────────────────────────

export function insertSnapshot(simulationId: number, tick: number, clock: { day: number; minute: number }, world: unknown): number {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const values: InsertCcmSnapshot = { simulationId, tick, clock, world };
  const result = db.insert(ccmSnapshots).values(values).run();
  return result.lastInsertRowid as number;
}

export function listSnapshots(simulationId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmSnapshots).where(eq(ccmSnapshots.simulationId, simulationId)).orderBy(desc(ccmSnapshots.tick)).all();
}

export function getSnapshotById(snapshotId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(ccmSnapshots).where(eq(ccmSnapshots.id, snapshotId)).get();
}