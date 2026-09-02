import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import {
  listSimulations,
  getSimulationById,
  createSimulation,
  updateSimulation,
  deleteSimulation,
  listEvents,
  getEventById,
  getEventAncestry,
  listEpisodes,
  listSkeletons,
  getSkeletonById,
  deleteSkeleton,
  insertSnapshot,
  listSnapshots,
  getSnapshotById,
} from "../modules/simulation/simulation.data";
import { advanceSimulation, resetSimulation } from "../modules/simulation/run.service";
import { renderSkeletonToProposal } from "../modules/simulation/skeletonRenderer";
import { trackEvent } from "../services/activityTracker";

/**
 * CCE simulation router — engine runs against a project's world model.
 * World model entities (actors/environments/systems/rules/relationships/
 * constraints) are managed via the actor/world routers; this router manages
 * the runs: simulations, events, episodes, skeletons, snapshots.
 */

function assertProject(projectId: number, userId: number) {
  const project = db.getProjectById(projectId);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  if (project.userId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  return project;
}

function assertSimulation(simulationId: number, userId: number) {
  const sim = getSimulationById(simulationId);
  if (!sim) throw new TRPCError({ code: "NOT_FOUND", message: "Simulation not found" });
  const project = db.getProjectById(sim.projectId);
  if (!project || project.userId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  return sim;
}

const simulationSettingsSchema = z.object({
  tickMinutes: z.number().int().min(1).max(1440).optional(),
  maxEventsPerRun: z.number().int().min(1).max(1000).optional(),
  granularity: z.enum(["minute", "hour", "day"]).optional(),
});

export const simulationRouter = router({
  // ── Simulations ─────────────────────────────────────────────────────────
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    assertProject(input.projectId, ctx.user.id);
    return listSimulations(input.projectId);
  }),

  get: protectedProcedure.input(z.object({ simulationId: z.number() })).query(({ ctx, input }) => {
    return assertSimulation(input.simulationId, ctx.user.id);
  }),

  create: protectedProcedure
    .input(z.object({ projectId: z.number(), name: z.string().min(1), description: z.string().optional(), settings: simulationSettingsSchema.optional() }))
    .mutation(({ ctx, input }) => {
      assertProject(input.projectId, ctx.user.id);
      const sim = createSimulation(input.projectId, input.name, input.description ?? null, input.settings);
      trackEvent(ctx.user.id, "simulation_run", { projectId: input.projectId, featureName: "simulation" });
      return sim;
    }),

  update: protectedProcedure
    .input(z.object({
      simulationId: z.number(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      status: z.enum(["idle", "running", "paused", "stopped"]).optional(),
      worldSeed: z.number().int().optional(),
      simulationSeed: z.number().int().optional(),
      clock: z.object({ day: z.number().int(), minute: z.number().int().min(0).max(1439) }).optional(),
      settings: simulationSettingsSchema.optional(),
    }))
    .mutation(({ ctx, input }) => {
      const sim = assertSimulation(input.simulationId, ctx.user.id);
      const { simulationId, ...data } = input;
      return updateSimulation(simulationId, data as any);
    }),

  delete: protectedProcedure.input(z.object({ simulationId: z.number() })).mutation(({ ctx, input }) => {
    assertSimulation(input.simulationId, ctx.user.id);
    deleteSimulation(input.simulationId);
    return { success: true };
  }),

  // ── Run controls ────────────────────────────────────────────────────────
  advance: protectedProcedure
    .input(z.object({ simulationId: z.number(), ticks: z.number().int().min(1).max(500).default(12) }))
    .mutation(({ ctx, input }) => {
      assertSimulation(input.simulationId, ctx.user.id);
      const result = advanceSimulation(input.simulationId, input.ticks);
      trackEvent(ctx.user.id, "simulation_run", { featureName: "simulation", actionDetail: `ticks=${input.ticks} events=${result.eventsGenerated}` });
      return result;
    }),

  reset: protectedProcedure.input(z.object({ simulationId: z.number() })).mutation(({ ctx, input }) => {
    assertSimulation(input.simulationId, ctx.user.id);
    resetSimulation(input.simulationId);
    trackEvent(ctx.user.id, "simulation_reset", { featureName: "simulation" });
    return { success: true };
  }),

  snapshot: protectedProcedure.input(z.object({ simulationId: z.number() })).mutation(({ ctx, input }) => {
    assertSimulation(input.simulationId, ctx.user.id);
    const sim = getSimulationById(input.simulationId)!;
    const id = insertSnapshot(input.simulationId, 0, sim.clock as { day: number; minute: number }, sim);
    trackEvent(ctx.user.id, "simulation_snapshot", { featureName: "simulation" });
    return { snapshotId: id };
  }),

  snapshots: protectedProcedure.input(z.object({ simulationId: z.number() })).query(({ ctx, input }) => {
    assertSimulation(input.simulationId, ctx.user.id);
    return listSnapshots(input.simulationId);
  }),

  restoreSnapshot: protectedProcedure.input(z.object({ snapshotId: z.number() })).mutation(({ ctx, input }) => {
    const snap = getSnapshotById(input.snapshotId);
    if (!snap) throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot not found" });
    assertSimulation(snap.simulationId, ctx.user.id);
    const restored = snap.world as any;
    if (restored && typeof restored.clock === "object") {
      updateSimulation(snap.simulationId, { clock: restored.clock, status: "idle" });
    }
    return { success: true };
  }),

  // ── Events ──────────────────────────────────────────────────────────────
  events: protectedProcedure
    .input(z.object({ simulationId: z.number(), limit: z.number().int().min(1).max(1000).optional(), level: z.enum(["micro", "event"]).optional() }))
    .query(({ ctx, input }) => {
      assertSimulation(input.simulationId, ctx.user.id);
      return listEvents(input.simulationId, { limit: input.limit ?? 500, level: input.level });
    }),

  event: protectedProcedure.input(z.object({ eventId: z.number() })).query(({ ctx, input }) => {
    const event = getEventById(input.eventId);
    if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
    assertSimulation(event.simulationId, ctx.user.id);
    return event;
  }),

  ancestry: protectedProcedure.input(z.object({ eventId: z.number() })).query(({ ctx, input }) => {
    const event = getEventById(input.eventId);
    if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
    assertSimulation(event.simulationId, ctx.user.id);
    const ids = getEventAncestry(input.eventId);
    return ids.map((id) => getEventById(id)).filter((e): e is NonNullable<typeof e> => e !== undefined);
  }),

  // ── Episodes & skeletons ────────────────────────────────────────────────
  episodes: protectedProcedure.input(z.object({ simulationId: z.number() })).query(({ ctx, input }) => {
    assertSimulation(input.simulationId, ctx.user.id);
    return listEpisodes(input.simulationId);
  }),

  skeletons: protectedProcedure.input(z.object({ simulationId: z.number() })).query(({ ctx, input }) => {
    assertSimulation(input.simulationId, ctx.user.id);
    return listSkeletons(input.simulationId);
  }),

  skeleton: protectedProcedure.input(z.object({ skeletonId: z.number() })).query(({ ctx, input }) => {
    const skeleton = getSkeletonById(input.skeletonId);
    if (!skeleton) throw new TRPCError({ code: "NOT_FOUND", message: "Skeleton not found" });
    assertSimulation(skeleton.simulationId, ctx.user.id);
    return skeleton;
  }),

  deleteSkeleton: protectedProcedure.input(z.object({ skeletonId: z.number() })).mutation(({ ctx, input }) => {
    const skeleton = getSkeletonById(input.skeletonId);
    if (!skeleton) throw new TRPCError({ code: "NOT_FOUND", message: "Skeleton not found" });
    assertSimulation(skeleton.simulationId, ctx.user.id);
    deleteSkeleton(input.skeletonId);
    return { success: true };
  }),

  // ── Render skeleton (Mode 2: LLM renders prose → staged proposal) ──────
  renderSkeleton: protectedProcedure
    .input(z.object({ skeletonId: z.number(), sceneTitle: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await renderSkeletonToProposal(input.skeletonId, ctx.user.id, {
        sceneTitle: input.sceneTitle,
      });
      trackEvent(ctx.user.id, "simulation_render", { featureName: "simulation", actionDetail: `skeleton=${input.skeletonId}` });
      return result;
    }),
});