import { eq, and, or } from "drizzle-orm";
import { getDb } from "../../db";
import {
  ccmEnvironments,
  ccmSystems,
  ccmRules,
  ccmRelationships,
  ccmNarrativeConstraints,
  type InsertCcmEnvironment,
  type InsertCcmSystem,
  type InsertCcmRule,
  type InsertCcmRelationship,
  type InsertCcmNarrativeConstraint,
} from "../../../drizzle/schema";
import * as storageService from "../../services/storageService";
import { cleanupDanglingSpans } from "../../entities";
import { getProjectById } from "../projects/project.data";

/**
 * World model data access — environments, systems, rules, relationships and
 * narrative constraints (all project-scoped). This replaces the legacy
 * `world_building_notes` table: location → environments, magic_system/faction
 * → systems, lore/other → project_memory.
 */

// ─── Environments ──────────────────────────────────────────────────────────

export type EnvironmentInput = {
  name?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  state?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  inhabitants?: string[];
  accessibility?: Record<string, unknown>;
  activeProcesses?: string[];
  constraints?: string[];
};

export function getProjectEnvironments(projectId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmEnvironments).where(eq(ccmEnvironments.projectId, projectId)).all();
}

export function getEnvironmentById(environmentId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(ccmEnvironments).where(eq(ccmEnvironments.id, environmentId)).get();
}

export function environmentSizeBytes(env: EnvironmentInput & { name: string }): number {
  return [
    env.name,
    env.type ?? "",
    JSON.stringify(env.attributes ?? {}),
    JSON.stringify(env.state ?? {}),
    JSON.stringify(env.resources ?? {}),
    JSON.stringify(env.inhabitants ?? []),
    JSON.stringify(env.accessibility ?? {}),
    JSON.stringify(env.activeProcesses ?? []),
    JSON.stringify(env.constraints ?? []),
  ].reduce((sum, p) => sum + storageService.calculateBytes(p), 0);
}

export function createEnvironment(projectId: number, name: string, data?: EnvironmentInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const project = getProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const profile: EnvironmentInput & { name: string } = { name, ...(data ?? {}) };
  storageService.enforceQuota(project.userId, environmentSizeBytes(profile));

  const values: InsertCcmEnvironment = {
    projectId,
    name,
    type: profile.type ?? "location",
    attributes: profile.attributes ?? {},
    state: profile.state ?? {},
    resources: profile.resources ?? {},
    inhabitants: profile.inhabitants ?? [],
    accessibility: profile.accessibility ?? {},
    activeProcesses: profile.activeProcesses ?? [],
    constraints: profile.constraints ?? [],
  };
  const result = db.insert(ccmEnvironments).values(values).run();
  storageService.recomputeUsage(project.userId);
  return getEnvironmentById(result.lastInsertRowid as number);
}

export function updateEnvironment(environmentId: number, data: EnvironmentInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getEnvironmentById(environmentId);
  if (!existing) throw new Error("Environment not found");
  const project = getProjectById(existing.projectId);
  if (!project) throw new Error("Project not found");

  const profile: EnvironmentInput & { name: string } = {
    name: data.name ?? existing.name,
    type: data.type ?? existing.type,
    attributes: data.attributes ?? (existing.attributes as Record<string, unknown>),
    state: data.state ?? (existing.state as Record<string, unknown>),
    resources: data.resources ?? (existing.resources as Record<string, unknown>),
    inhabitants: data.inhabitants ?? (existing.inhabitants as string[]),
    accessibility: data.accessibility ?? (existing.accessibility as Record<string, unknown>),
    activeProcesses: data.activeProcesses ?? (existing.activeProcesses as string[]),
    constraints: data.constraints ?? (existing.constraints as string[]),
  };
  storageService.enforceQuota(
    project.userId,
    environmentSizeBytes(profile) - environmentSizeBytes(existing as EnvironmentInput & { name: string })
  );

  db.update(ccmEnvironments)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.attributes !== undefined ? { attributes: data.attributes } : {}),
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.resources !== undefined ? { resources: data.resources } : {}),
      ...(data.inhabitants !== undefined ? { inhabitants: data.inhabitants } : {}),
      ...(data.accessibility !== undefined ? { accessibility: data.accessibility } : {}),
      ...(data.activeProcesses !== undefined ? { activeProcesses: data.activeProcesses } : {}),
      ...(data.constraints !== undefined ? { constraints: data.constraints } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ccmEnvironments.id, environmentId))
    .run();

  storageService.recomputeUsage(project.userId);
  return getEnvironmentById(environmentId);
}

export function deleteEnvironment(environmentId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getEnvironmentById(environmentId);
  db.delete(ccmEnvironments).where(eq(ccmEnvironments.id, environmentId)).run();
  void cleanupDanglingSpans(String(environmentId), "environment");
  if (existing) {
    const project = getProjectById(existing.projectId);
    if (project) storageService.recomputeUsage(project.userId);
  }
}

// ─── Systems ────────────────────────────────────────────────────────────────

export type SystemInput = {
  name?: string;
  type?: string;
  rules?: string[];
  constraints?: string[];
  activeConditions?: string[];
  effects?: string[];
  exceptions?: string[];
};

export function getProjectSystems(projectId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmSystems).where(eq(ccmSystems.projectId, projectId)).all();
}

export function getSystemById(systemId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(ccmSystems).where(eq(ccmSystems.id, systemId)).get();
}

export function systemSizeBytes(s: SystemInput & { name: string }): number {
  return [
    s.name,
    s.type ?? "",
    JSON.stringify(s.rules ?? []),
    JSON.stringify(s.constraints ?? []),
    JSON.stringify(s.activeConditions ?? []),
    JSON.stringify(s.effects ?? []),
    JSON.stringify(s.exceptions ?? []),
  ].reduce((sum, p) => sum + storageService.calculateBytes(p), 0);
}

export function createSystem(projectId: number, name: string, data?: SystemInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const project = getProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const profile: SystemInput & { name: string } = { name, ...(data ?? {}) };
  storageService.enforceQuota(project.userId, systemSizeBytes(profile));

  const values: InsertCcmSystem = {
    projectId,
    name,
    type: profile.type ?? "system",
    rules: profile.rules ?? [],
    constraints: profile.constraints ?? [],
    activeConditions: profile.activeConditions ?? [],
    effects: profile.effects ?? [],
    exceptions: profile.exceptions ?? [],
  };
  const result = db.insert(ccmSystems).values(values).run();
  storageService.recomputeUsage(project.userId);
  return getSystemById(result.lastInsertRowid as number);
}

export function updateSystem(systemId: number, data: SystemInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getSystemById(systemId);
  if (!existing) throw new Error("System not found");
  const project = getProjectById(existing.projectId);
  if (!project) throw new Error("Project not found");

  const profile: SystemInput & { name: string } = {
    name: data.name ?? existing.name,
    type: data.type ?? existing.type,
    rules: data.rules ?? (existing.rules as string[]),
    constraints: data.constraints ?? (existing.constraints as string[]),
    activeConditions: data.activeConditions ?? (existing.activeConditions as string[]),
    effects: data.effects ?? (existing.effects as string[]),
    exceptions: data.exceptions ?? (existing.exceptions as string[]),
  };
  const oldSizeBytes = systemSizeBytes(existing as SystemInput & { name: string });
  storageService.enforceQuota(project.userId, systemSizeBytes(profile) - oldSizeBytes);

  db.update(ccmSystems)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.rules !== undefined ? { rules: data.rules } : {}),
      ...(data.constraints !== undefined ? { constraints: data.constraints } : {}),
      ...(data.activeConditions !== undefined ? { activeConditions: data.activeConditions } : {}),
      ...(data.effects !== undefined ? { effects: data.effects } : {}),
      ...(data.exceptions !== undefined ? { exceptions: data.exceptions } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ccmSystems.id, systemId))
    .run();

  storageService.recomputeUsage(project.userId);
  return getSystemById(systemId);
}

export function deleteSystem(systemId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getSystemById(systemId);
  db.delete(ccmSystems).where(eq(ccmSystems.id, systemId)).run();
  void cleanupDanglingSpans(String(systemId), "system");
  if (existing) {
    const project = getProjectById(existing.projectId);
    if (project) storageService.recomputeUsage(project.userId);
  }
}

// ─── Rules ──────────────────────────────────────────────────────────────────

export type RuleInput = {
  name?: string;
  family?: "actor" | "relationship" | "environment" | "biology" | "physics" | "social" | "temporal" | "narrative";
  when?: Record<string, unknown>;
  candidateEvents?: Array<Record<string, unknown>>;
  effects?: Array<Record<string, unknown>>;
  priority?: number;
  probability?: number;
  cooldown?: number;
  scope?: string;
  enabled?: boolean;
};

export function getProjectRules(projectId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmRules).where(eq(ccmRules.projectId, projectId)).all();
}

export function getRuleById(ruleId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(ccmRules).where(eq(ccmRules.id, ruleId)).get();
}

export function createRule(projectId: number, name: string, data?: RuleInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const values: InsertCcmRule = {
    projectId,
    name,
    family: data?.family ?? "actor",
    when: data?.when ?? { conditions: [] },
    candidateEvents: data?.candidateEvents ?? [],
    effects: data?.effects ?? [],
    priority: data?.priority ?? 0,
    probability: data?.probability ?? 1,
    cooldown: data?.cooldown ?? 0,
    scope: data?.scope ?? "actor",
    enabled: data?.enabled ?? true,
  };
  const result = db.insert(ccmRules).values(values).run();
  return getRuleById(result.lastInsertRowid as number);
}

export function updateRule(ruleId: number, data: RuleInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.update(ccmRules)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.family !== undefined ? { family: data.family } : {}),
      ...(data.when !== undefined ? { when: data.when } : {}),
      ...(data.candidateEvents !== undefined ? { candidateEvents: data.candidateEvents } : {}),
      ...(data.effects !== undefined ? { effects: data.effects } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.probability !== undefined ? { probability: data.probability } : {}),
      ...(data.cooldown !== undefined ? { cooldown: data.cooldown } : {}),
      ...(data.scope !== undefined ? { scope: data.scope } : {}),
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ccmRules.id, ruleId))
    .run();
  return getRuleById(ruleId);
}

export function deleteRule(ruleId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getRuleById(ruleId);
  db.delete(ccmRules).where(eq(ccmRules.id, ruleId)).run();
  if (existing) {
    const project = getProjectById(existing.projectId);
    if (project) storageService.recomputeUsage(project.userId);
  }
}

// ─── Relationships ──────────────────────────────────────────────────────────

export type RelationshipInput = {
  actorAId?: number;
  actorBId?: number;
  familiarity?: string;
  trust?: string;
  affection?: string;
  resentment?: string;
  dependence?: string;
  fear?: string;
  obligation?: string;
  respect?: string;
  knowledge?: string;
  expectations?: Record<string, unknown>;
  history?: string[];
};

export function getProjectRelationships(projectId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmRelationships).where(eq(ccmRelationships.projectId, projectId)).all();
}

export function getRelationshipById(relationshipId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(ccmRelationships).where(eq(ccmRelationships.id, relationshipId)).get();
}

export function getRelationshipBetween(actorAId: number, actorBId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db
    .select()
    .from(ccmRelationships)
    .where(
      or(
        and(eq(ccmRelationships.actorAId, actorAId), eq(ccmRelationships.actorBId, actorBId)),
        and(eq(ccmRelationships.actorAId, actorBId), eq(ccmRelationships.actorBId, actorAId))
      )
    )
    .get();
}

export function relationshipSizeBytes(rel: RelationshipInput & { actorAId: number; actorBId: number }): number {
  const parts = [
    String(rel.actorAId),
    String(rel.actorBId),
    rel.familiarity ?? "",
    rel.trust ?? "",
    rel.affection ?? "",
    rel.resentment ?? "",
    rel.dependence ?? "",
    rel.fear ?? "",
    rel.obligation ?? "",
    rel.respect ?? "",
    rel.knowledge ?? "",
    JSON.stringify(rel.expectations ?? {}),
    JSON.stringify(rel.history ?? []),
  ];
  return parts.reduce((sum, p) => sum + storageService.calculateBytes(p), 0);
}

export function createRelationship(projectId: number, actorAId: number, actorBId: number, data?: RelationshipInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const project = getProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const profile: RelationshipInput & { actorAId: number; actorBId: number } = {
    actorAId, actorBId, ...(data ?? {}),
  };
  storageService.enforceQuota(project.userId, relationshipSizeBytes(profile));

  const values: InsertCcmRelationship = {
    projectId,
    actorAId,
    actorBId,
    familiarity: data?.familiarity ?? "none",
    trust: data?.trust ?? "none",
    affection: data?.affection ?? "none",
    resentment: data?.resentment ?? "none",
    dependence: data?.dependence ?? "none",
    fear: data?.fear ?? "none",
    obligation: data?.obligation ?? "none",
    respect: data?.respect ?? "none",
    knowledge: data?.knowledge ?? "none",
    expectations: data?.expectations ?? {},
    history: data?.history ?? [],
  };
  const result = db.insert(ccmRelationships).values(values).run();
  return getRelationshipById(result.lastInsertRowid as number);
}

export function updateRelationship(relationshipId: number, data: RelationshipInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.update(ccmRelationships)
    .set({
      ...(data.familiarity !== undefined ? { familiarity: data.familiarity } : {}),
      ...(data.trust !== undefined ? { trust: data.trust } : {}),
      ...(data.affection !== undefined ? { affection: data.affection } : {}),
      ...(data.resentment !== undefined ? { resentment: data.resentment } : {}),
      ...(data.dependence !== undefined ? { dependence: data.dependence } : {}),
      ...(data.fear !== undefined ? { fear: data.fear } : {}),
      ...(data.obligation !== undefined ? { obligation: data.obligation } : {}),
      ...(data.respect !== undefined ? { respect: data.respect } : {}),
      ...(data.knowledge !== undefined ? { knowledge: data.knowledge } : {}),
      ...(data.expectations !== undefined ? { expectations: data.expectations } : {}),
      ...(data.history !== undefined ? { history: data.history } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ccmRelationships.id, relationshipId))
    .run();
  return getRelationshipById(relationshipId);
}

export function deleteRelationship(relationshipId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getRelationshipById(relationshipId);
  db.delete(ccmRelationships).where(eq(ccmRelationships.id, relationshipId)).run();
  if (existing) {
    const project = getProjectById(existing.projectId);
    if (project) storageService.recomputeUsage(project.userId);
  }
}

// ─── Narrative Constraints ──────────────────────────────────────────────────

export type NarrativeConstraintInput = {
  name?: string;
  class?: "hard" | "soft" | "forbidden" | "range" | "temporal";
  target?: Record<string, unknown>;
  description?: string | null;
  deadline?: number | null;
  priority?: number;
  /** Optional manual satisfaction override (the engine sets this automatically). */
  satisfied?: boolean;
  satisfiedAt?: number | null;
};

export function getProjectConstraints(projectId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ccmNarrativeConstraints).where(eq(ccmNarrativeConstraints.projectId, projectId)).all();
}

export function getConstraintById(constraintId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(ccmNarrativeConstraints).where(eq(ccmNarrativeConstraints.id, constraintId)).get();
}

export function createConstraint(projectId: number, name: string, data?: NarrativeConstraintInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const values: InsertCcmNarrativeConstraint = {
    projectId,
    name,
    class: data?.class ?? "hard",
    target: data?.target ?? {},
    description: data?.description ?? null,
    deadline: data?.deadline ?? null,
    priority: data?.priority ?? 1,
  };
  const result = db.insert(ccmNarrativeConstraints).values(values).run();
  return getConstraintById(result.lastInsertRowid as number);
}

export function updateConstraint(constraintId: number, data: NarrativeConstraintInput) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.update(ccmNarrativeConstraints)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.class !== undefined ? { class: data.class } : {}),
      ...(data.target !== undefined ? { target: data.target } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.deadline !== undefined ? { deadline: data.deadline } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.satisfied !== undefined ? { satisfied: data.satisfied } : {}),
      ...(data.satisfiedAt !== undefined ? { satisfiedAt: data.satisfiedAt ? new Date(data.satisfiedAt * 1000) : null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ccmNarrativeConstraints.id, constraintId))
    .run();
  return getConstraintById(constraintId);
}

export function deleteConstraint(constraintId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getConstraintById(constraintId);
  db.delete(ccmNarrativeConstraints).where(eq(ccmNarrativeConstraints.id, constraintId)).run();
  if (existing) {
    const project = getProjectById(existing.projectId);
    if (project) storageService.recomputeUsage(project.userId);
  }
}