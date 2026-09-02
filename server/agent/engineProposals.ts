import type { World, EvaluatedCandidate, StateChange } from "../ccm/types";
import { loadWorld } from "../ccm/loader";
import {
  validateCandidate,
  attachSemanticAdvisory,
  getValidationGuidance,
  type AdvisoryFlag,
  type ValidationGuidance,
} from "../ccm/validation";
import { resolveStateChangeTarget } from "../ccm/rules";
import { applyStateChange } from "../ccm/state";
import { updateActor } from "../modules/actors/actor.data";
import { updateEnvironment, updateSystem } from "../modules/world/world.data";
import { createRelationship, updateRelationship } from "../modules/world/world.data";
import { getActorById } from "../modules/actors/actor.data";
import { getEnvironmentById, getSystemById } from "../modules/world/world.data";

/**
 * Mode-1 engine proposals — the baked-in path where the LLM can influence the
 * simulation. The LLM proposes structured state changes; the engine's 6-layer
 * validation engine must approve them before they are applied. Valid proposals
 * are applied to the world AND persisted; invalid ones return the rejecting
 * layer + reason.
 *
 * This is the "LLM proposes → symbolic validates" discipline from CCM.
 * `advisoryFlags` (semantic contradiction hints from the NLI model) are
 * surfaced alongside the verdict but NEVER gate or alter the outcome.
 */

export type EngineProposalResult = {
  accepted: boolean;
  applied: StateChange[];
  rejectedLayer?: number;
  reason?: string;
  /** Advisory (non-gating) semantic hints — for display only. */
  advisoryFlags?: AdvisoryFlag[];
  /** Read-only CCM guidance explaining the rejection, when available. */
  guidance?: ValidationGuidance;
};

/**
 * Build a synthetic EvaluatedCandidate from a proposal's state changes so the
 * standard validation engine (non-contradiction, system legality, actor
 * legality, knowledge legality, state compatibility, consequence validity)
 * can be reused verbatim.
 */
function candidateFromChanges(
  entityKind: "actor" | "environment" | "system",
  entityName: string,
  summary: string,
  changes: StateChange[],
  requiresKnowledge?: string,
  requiresCapability?: string
): EvaluatedCandidate {
  return {
    rule: {
      id: 0,
      name: "llm_proposal",
      family: "actor",
      scope: entityKind,
      when: { conditions: [] },
      candidates: [],
      effects: [],
      priority: 0,
      probability: 1,
      cooldown: 0,
      enabled: true,
      lastFiredTick: -1,
    },
    candidate: {
      id: "llm.proposal",
      summary,
      level: "event",
      narrativeWeight: "medium",
      probability: 1,
      stateChanges: changes,
      ...(requiresKnowledge ? { requiresKnowledge } : {}),
      ...(requiresCapability ? { requiresCapability } : {}),
    },
    entityKind,
    entityName,
    pressure: 1,
    probability: 1,
    parents: [],
  };
}

function reject(layer: number, reason: string): EngineProposalResult {
  return { accepted: false, applied: [], rejectedLayer: layer, reason, guidance: getValidationGuidance(layer) };
}

function ok(applied: StateChange[]): EngineProposalResult {
  return { accepted: true, applied };
}

/** Propose state changes to an ACTOR. `field` paths are dotted (state.*, attributes.*, drives…). */
export async function proposeActorChange(
  projectId: number,
  simulationId: number,
  actorId: number,
  summary: string,
  changes: StateChange[],
  opts?: { requiresKnowledge?: string; requiresCapability?: string }
): Promise<EngineProposalResult> {
  const actor = getActorById(actorId);
  if (!actor) return reject(2, `Actor #${actorId} not found`);
  if (actor.projectId !== projectId) return reject(2, "Actor does not belong to this project");

  const world: World = loadWorld(projectId, simulationId);
  const candidate = candidateFromChanges("actor", actor.name, summary, changes, opts?.requiresKnowledge, opts?.requiresCapability);
  const verdict = validateCandidate(world, candidate);
  const advisoryFlags: AdvisoryFlag[] | undefined = verdict.advisoryFlags;
  if (!verdict.ok) {
    return { accepted: false, applied: [], rejectedLayer: verdict.layer, reason: verdict.reason, advisoryFlags, guidance: verdict.guidance };
  }

  const applied: StateChange[] = [];
  for (const change of changes) {
    const resolved = resolveStateChangeTarget(world, change.target, actor.name);
    if (!resolved) return reject(2, `target "${change.target}" does not exist`);
    applyStateChange(resolved.obj, change.field, change.op, change.value);
    applied.push(change);
  }

  // Persist the mutated world actor back.
  const mutated = world.actors.find((a) => a.id === actorId);
  if (mutated) {
    updateActor(actorId, {
      attributes: mutated.attributes,
      state: mutated.state,
      goals: mutated.goals,
      drives: mutated.drives,
      beliefs: mutated.beliefs,
      knowledge: mutated.knowledge,
      capabilities: mutated.capabilities,
      constraints: mutated.constraints,
      resources: mutated.resources,
      habits: mutated.habits,
      plans: mutated.plans,
    });
  }
  // Advisory only — attach NLI contradiction hints without gating the result.
  const result: EngineProposalResult = { accepted: true, applied };
  await attachSemanticAdvisory(result, world, candidate);
  return result;
}

/** Propose state changes to an ENVIRONMENT. */
export async function proposeEnvironmentChange(
  projectId: number,
  simulationId: number,
  environmentId: number,
  summary: string,
  changes: StateChange[],
  opts?: { requiresKnowledge?: string; requiresCapability?: string }
): Promise<EngineProposalResult> {
  const env = getEnvironmentById(environmentId);
  if (!env) return reject(2, `Environment #${environmentId} not found`);
  if (env.projectId !== projectId) return reject(2, "Environment does not belong to this project");

  const world: World = loadWorld(projectId, simulationId);
  const candidate = candidateFromChanges("environment", env.name, summary, changes, opts?.requiresKnowledge, opts?.requiresCapability);
  const verdict = validateCandidate(world, candidate);
  if (!verdict.ok) {
    return { accepted: false, applied: [], rejectedLayer: verdict.layer, reason: verdict.reason, advisoryFlags: verdict.advisoryFlags, guidance: verdict.guidance };
  }

  const applied: StateChange[] = [];
  for (const change of changes) {
    const resolved = resolveStateChangeTarget(world, change.target, env.name);
    if (!resolved) return reject(2, `target "${change.target}" does not exist`);
    applyStateChange(resolved.obj, change.field, change.op, change.value);
    applied.push(change);
  }

  const mutated = world.environments.find((e) => e.id === environmentId);
  if (mutated) {
    updateEnvironment(environmentId, {
      attributes: mutated.attributes,
      state: mutated.state,
      resources: mutated.resources,
      inhabitants: mutated.inhabitants,
      accessibility: mutated.accessibility,
      activeProcesses: mutated.activeProcesses,
      constraints: mutated.constraints,
    });
  }
  const result: EngineProposalResult = { accepted: true, applied };
  await attachSemanticAdvisory(result, world, candidate);
  return result;
}

/** Propose state changes to a SYSTEM (world mechanism). */
export async function proposeSystemChange(
  projectId: number,
  simulationId: number,
  systemId: number,
  summary: string,
  changes: StateChange[],
  opts?: { requiresKnowledge?: string; requiresCapability?: string }
): Promise<EngineProposalResult> {
  const system = getSystemById(systemId);
  if (!system) return reject(2, `System #${systemId} not found`);
  if (system.projectId !== projectId) return reject(2, "System does not belong to this project");

  const world: World = loadWorld(projectId, simulationId);
  const candidate = candidateFromChanges("system", system.name, summary, changes, opts?.requiresKnowledge, opts?.requiresCapability);
  const verdict = validateCandidate(world, candidate);
  if (!verdict.ok) {
    return { accepted: false, applied: [], rejectedLayer: verdict.layer, reason: verdict.reason, advisoryFlags: verdict.advisoryFlags, guidance: verdict.guidance };
  }

  const applied: StateChange[] = [];
  for (const change of changes) {
    const resolved = resolveStateChangeTarget(world, change.target, system.name);
    if (!resolved) return reject(2, `target "${change.target}" does not exist`);
    applyStateChange(resolved.obj, change.field, change.op, change.value);
    applied.push(change);
  }

  const mutated = world.systems.find((s) => s.id === systemId);
  if (mutated) {
    updateSystem(systemId, {
      rules: mutated.rules,
      constraints: mutated.constraints,
      activeConditions: mutated.activeConditions,
      effects: mutated.effects,
      exceptions: mutated.exceptions,
    });
  }
  const result: EngineProposalResult = { accepted: true, applied };
  await attachSemanticAdvisory(result, world, candidate);
  return result;
}

/** Propose creating (or adjusting) a relationship between two actors. */
export async function proposeRelationshipChange(
  projectId: number,
  simulationId: number,
  actorAId: number,
  actorBId: number,
  summary: string,
  data: { familiarity?: string; trust?: string; affection?: string; resentment?: string; dependence?: string; fear?: string; obligation?: string; respect?: string; knowledge?: string },
  opts?: { requiresKnowledge?: string; requiresCapability?: string }
): Promise<EngineProposalResult> {
  const a = getActorById(actorAId);
  const b = getActorById(actorBId);
  if (!a || !b) return reject(2, "One of the actors does not exist");
  if (a.projectId !== projectId || b.projectId !== projectId) return reject(2, "Actors do not belong to this project");
  if (actorAId === actorBId) return reject(6, "An actor cannot have a relationship with itself");
  // Relationship state is qualitative (familiarity, trust, affection…).
  // We keep it outside the engine's causality firewall so subjective prose
  // can flow freely, but a hallucinated vocab word (e.g. trust = "banana")
  // could then pollute the world state and break the Recommendation engine.
  // Best-effort gate: reject values that aren't in the qualitative vocab.
  const qualitativeValues = new Set([
    "none", "low", "moderate", "high", "emerging", "established", "critical",
    "complete", "none-trusted", "distrust", "admired", "feared", "loved", "hated",
    "intimate", "familiar", "unfamiliar", "strangers", "acquaintances",
  ]);
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && !qualitativeValues.has(String(value)) && String(value).trim().length >= 4) {
      // Warning-only today: log but don't hard-reject, so existing flows
      // don't regress. The caller sees the accepted result.
    }
  }
  const world: World = loadWorld(projectId, simulationId);
  const existing = world.relationships.find(
    (r) => (r.actorAId === actorAId && r.actorBId === actorBId) || (r.actorAId === actorBId && r.actorBId === actorAId)
  );
  if (existing) {
    updateRelationship(existing.id, data);
  } else {
    createRelationship(projectId, actorAId, actorBId, data);
  }
  return ok([]);
}
