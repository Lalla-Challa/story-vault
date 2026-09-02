import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { ccmActors, type InsertCcmActor } from "../../../drizzle/schema";
import * as storageService from "../../services/storageService";

/**
 * Actor data access — the CCM world model's character entity (project-scoped).
 * Replaces the legacy `characters` table. `attributes` hold stable traits
 * (age, condition, abilities, custom profile fields); `state` holds volatile
 * world state the engine mutates.
 */

/** Max actor name length (QA hardening). */
export const ACTOR_NAME_MAX_LENGTH = 255;

/**
 * Validate an actor name: must be a non-empty string (trimmed) and at most
 * 255 characters. Throws an Error (surfaced as a BAD_REQUEST to MCP/tRPC
 * callers) when invalid. Returns the trimmed name on success.
 */
export function assertValidActorName(name: string): string {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Actor name must be a non-empty string.");
  }
  if (name.trim().length > ACTOR_NAME_MAX_LENGTH) {
    throw new Error(`Actor name must be ${ACTOR_NAME_MAX_LENGTH} characters or fewer.`);
  }
  return name.trim();
}

/**
 * Enforce that no other actor in the project shares the given name.
 * `excludeActorId` lets update_actor skip its own row. Throws when a clash
 * exists (surfaced as a BAD_REQUEST to callers).
 */
export function assertUniqueActorName(projectId: number, name: string, excludeActorId?: number): void {
  const db = getDb();
  if (!db) return;
  const trimmed = name.trim();
  const clash = db
    .select()
    .from(ccmActors)
    .where(and(eq(ccmActors.projectId, projectId), eq(ccmActors.name, trimmed)))
    .all()
    .find((a) => a.id !== excludeActorId);
  if (clash) {
    throw new Error("An actor with this name already exists in this project.");
  }
}

export function getProjectActors(projectId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmActors).where(eq(ccmActors.projectId, projectId)).all();
}

export function getActorById(actorId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(ccmActors).where(eq(ccmActors.id, actorId)).get();
}

export type ActorProfileInput = {
  name?: string;
  type?: string;
  description?: string | null;
  notes?: string | null;
  attributes?: Record<string, unknown>;
  state?: Record<string, unknown>;
  goals?: Record<string, string[]>;
  drives?: string[];
  beliefs?: Record<string, string[]>;
  knowledge?: string[];
  capabilities?: string[];
  constraints?: string[];
  resources?: Record<string, unknown>;
  habits?: string[];
  plans?: string[];
};

/** Byte size of an actor's mutable content (for quota accounting). */
export function actorSizeBytes(actor: ActorProfileInput & { name: string }): number {
  const parts = [
    actor.name,
    actor.type ?? "",
    actor.description ?? "",
    actor.notes ?? "",
    JSON.stringify(actor.attributes ?? {}),
    JSON.stringify(actor.state ?? {}),
    JSON.stringify(actor.goals ?? {}),
    JSON.stringify(actor.drives ?? []),
    JSON.stringify(actor.beliefs ?? {}),
    JSON.stringify(actor.knowledge ?? []),
    JSON.stringify(actor.capabilities ?? []),
    JSON.stringify(actor.constraints ?? []),
    JSON.stringify(actor.resources ?? {}),
    JSON.stringify(actor.habits ?? []),
    JSON.stringify(actor.plans ?? []),
  ];
  return parts.reduce((sum, p) => sum + storageService.calculateBytes(p), 0);
}

export function createActor(projectId: number, name: string, data?: ActorProfileInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const project = getProjectById(projectId);
  if (!project) throw new Error("Project not found");

  // QA hardening: reject empty/whitespace names, over-long names, and
  // project-internal duplicates (the engine resolves actors by name).
  const safeName = assertValidActorName(name);
  assertUniqueActorName(projectId, safeName);

  const profile: ActorProfileInput & { name: string } = { name: safeName, ...(data ?? {}) };
  const sizeBytes = actorSizeBytes(profile);
  storageService.enforceQuota(project.userId, sizeBytes);

  const values: InsertCcmActor = {
    projectId,
    name: safeName,
    type: profile.type ?? "human",
    description: profile.description ?? null,
    notes: profile.notes ?? null,
    attributes: profile.attributes ?? {},
    state: profile.state ?? {},
    goals: profile.goals ?? { survival: [], functional: [], social: [], emotional: [], longTerm: [], narrative: [] },
    drives: profile.drives ?? [],
    beliefs: profile.beliefs ?? { known: [], believed: [], uncertain: [], misconceptions: [] },
    knowledge: profile.knowledge ?? [],
    capabilities: profile.capabilities ?? [],
    constraints: profile.constraints ?? [],
    resources: profile.resources ?? {},
    habits: profile.habits ?? [],
    plans: profile.plans ?? [],
  };

  const result = db.insert(ccmActors).values(values).run();
  const id = result.lastInsertRowid as number;

  storageService.recomputeUsage(project.userId);
  return getActorById(id);
}

export function updateActor(actorId: number, data: ActorProfileInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const existing = getActorById(actorId);
  if (!existing) throw new Error("Actor not found");
  const project = getProjectById(existing.projectId);
  if (!project) throw new Error("Project not found");

  // QA hardening: same name validation as create (only when renaming).
  let safeName = existing.name;
  if (data.name !== undefined) {
    safeName = assertValidActorName(data.name);
    assertUniqueActorName(existing.projectId, safeName, actorId);
  }

  const profile: ActorProfileInput & { name: string } = {
    name: safeName,
    type: data.type ?? existing.type,
    description: data.description !== undefined ? data.description : existing.description,
    notes: data.notes !== undefined ? data.notes : existing.notes,
    attributes: data.attributes ?? (existing.attributes as Record<string, unknown>),
    state: data.state ?? (existing.state as Record<string, unknown>),
    goals: data.goals ?? (existing.goals as Record<string, string[]>),
    drives: data.drives ?? (existing.drives as string[]),
    beliefs: data.beliefs ?? (existing.beliefs as Record<string, string[]>),
    knowledge: data.knowledge ?? (existing.knowledge as string[]),
    capabilities: data.capabilities ?? (existing.capabilities as string[]),
    constraints: data.constraints ?? (existing.constraints as string[]),
    resources: data.resources ?? (existing.resources as Record<string, unknown>),
    habits: data.habits ?? (existing.habits as string[]),
    plans: data.plans ?? (existing.plans as string[]),
  };
  const sizeBytes = actorSizeBytes(profile);
  // Delta vs. the stored row, so the check does not double-count the actor
  // whose old size is already included in usedBytes.
  const oldSizeBytes = actorSizeBytes(existing as unknown as ActorProfileInput & { name: string });
  storageService.enforceQuota(project.userId, sizeBytes - oldSizeBytes);

  db.update(ccmActors)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.attributes !== undefined ? { attributes: data.attributes } : {}),
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.goals !== undefined ? { goals: data.goals } : {}),
      ...(data.drives !== undefined ? { drives: data.drives } : {}),
      ...(data.beliefs !== undefined ? { beliefs: data.beliefs } : {}),
      ...(data.knowledge !== undefined ? { knowledge: data.knowledge } : {}),
      ...(data.capabilities !== undefined ? { capabilities: data.capabilities } : {}),
      ...(data.constraints !== undefined ? { constraints: data.constraints } : {}),
      ...(data.resources !== undefined ? { resources: data.resources } : {}),
      ...(data.habits !== undefined ? { habits: data.habits } : {}),
      ...(data.plans !== undefined ? { plans: data.plans } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ccmActors.id, actorId))
    .run();

  storageService.recomputeUsage(project.userId);
  return getActorById(actorId);
}

export function deleteActor(actorId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getActorById(actorId);
  db.delete(ccmActors).where(eq(ccmActors.id, actorId)).run();
  // Clean up dangling entity spans in all scene versions.
  void cleanupDanglingSpans(String(actorId), "actor");
  // Recalibrate the owner's quota after the deletion.
  if (existing) {
    const project = getProjectById(existing.projectId);
    if (project) storageService.recomputeUsage(project.userId);
  }
}

// Re-export project lookup for module-internal use (avoid circular imports).
import { getProjectById } from "../projects/project.data";
import { cleanupDanglingSpans } from "../../entities";