import { systemRouter } from "./_core/systemRouter";
import {
  protectedProcedure,
  publicProcedure,
  router,
  adminProcedure,
} from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { trackEvent, openSession, closeSession } from "./services/activityTracker";
import { getDb } from "./db";
import { betaRequests, users, feedback, messages, emailTemplates } from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { sendEmail } from "./services/emailService";
import { provisionTester } from "./services/betaService";
import * as storageService from "./services/storageService";
import { setupVault, unlockVault, lockVault, changePin, isConfigured, isUnlocked } from "./_core/localAuth";
import { startEmbeddedMcpServer, stopEmbeddedMcpServer } from "./_core/mcpServer";

// ============ VALIDATION SCHEMAS ============
const projectSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

const sceneSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(["draft", "revised", "final"]).optional(),
});

const sceneVersionSchema = z.object({
  content: z.string().min(1, "Content is required"),
  versionLabel: z.enum(["draft", "revised", "final"]).default("draft"),
});

// ============ PROJECT ROUTER ============
const projectRouter = router({
  list: protectedProcedure.query(({ ctx }) => db.getUserProjects(ctx.user.id)),

  get: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return project;
  }),

  create: protectedProcedure.input(projectSchema).mutation(({ ctx, input }) => {
    const result = db.createProject(ctx.user.id, input.title, input.description);
    trackEvent(ctx.user.id, "project_created", { projectId: result?.id, featureName: "projects" });
    return result;
  }),

  update: protectedProcedure
    .input(z.object({ projectId: z.number(), ...projectSchema.shape }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      db.updateProject(input.projectId, input.title, input.description);
      return db.getProjectById(input.projectId);
    }),

  delete: protectedProcedure.input(z.object({ projectId: z.number() })).mutation(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    db.deleteProject(input.projectId);
    storageService.recomputeUsage(ctx.user.id);
    trackEvent(ctx.user.id, "project_deleted", { projectId: input.projectId, featureName: "projects" });
    return { success: true };
  }),
});

// ============ PROJECT SETTINGS ROUTER ============
const projectSettingsRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return db.getProjectSettings(input.projectId);
  }),

  upsert: protectedProcedure
    .input(z.object({ projectId: z.number(), settingKey: z.string(), settingValue: z.any() }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      return db.upsertProjectSetting(input.projectId, input.settingKey, input.settingValue);
    }),
});

// ============ SCENE ROUTER ============
const sceneRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return db.getProjectScenes(input.projectId);
  }),

  get: protectedProcedure.input(z.object({ sceneId: z.number() })).query(({ ctx, input }) => {
    const scene = db.getSceneById(input.sceneId);
    if (!scene) throw new TRPCError({ code: "NOT_FOUND", message: "Scene not found" });
    const project = db.getProjectById(scene.projectId);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return scene;
  }),

  create: protectedProcedure
    .input(z.object({ projectId: z.number(), ...sceneSchema.shape }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const result = db.createScene(input.projectId, input.title, input.description);
      trackEvent(ctx.user.id, "scene_created", { projectId: input.projectId, sceneId: result?.id, featureName: "scenes" });
      return result;
    }),

  update: protectedProcedure
    .input(z.object({ sceneId: z.number(), ...sceneSchema.shape }))
    .mutation(({ ctx, input }) => {
      const scene = db.getSceneById(input.sceneId);
      if (!scene) throw new TRPCError({ code: "NOT_FOUND", message: "Scene not found" });
      const project = db.getProjectById(scene.projectId);
      if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      db.updateScene(input.sceneId, input.title, input.description, input.status);
      return db.getSceneById(input.sceneId);
    }),

  delete: protectedProcedure.input(z.object({ sceneId: z.number() })).mutation(({ ctx, input }) => {
    const scene = db.getSceneById(input.sceneId);
    if (!scene) throw new TRPCError({ code: "NOT_FOUND", message: "Scene not found" });
    const project = db.getProjectById(scene.projectId);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    db.deleteScene(input.sceneId);
    trackEvent(ctx.user.id, "scene_deleted", { projectId: scene.projectId, sceneId: input.sceneId, featureName: "scenes" });
    return { success: true };
  }),
});

// ============ SCENE VERSION ROUTER ============
const versionRouter = router({
  list: protectedProcedure.input(z.object({ sceneId: z.number() })).query(({ ctx, input }) => {
    const scene = db.getSceneById(input.sceneId);
    if (!scene) throw new TRPCError({ code: "NOT_FOUND", message: "Scene not found" });
    const project = db.getProjectById(scene.projectId);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return db.getSceneVersions(input.sceneId);
  }),

  get: protectedProcedure.input(z.object({ versionId: z.number() })).query(({ ctx, input }) => {
    const version = db.getVersionById(input.versionId);
    if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
    const scene = db.getSceneById(version.sceneId);
    const project = db.getProjectById(scene?.projectId || 0);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return version;
  }),

  create: protectedProcedure
    .input(z.object({ sceneId: z.number(), ...sceneVersionSchema.shape }))
    .mutation(({ ctx, input }) => {
      const scene = db.getSceneById(input.sceneId);
      if (!scene) throw new TRPCError({ code: "NOT_FOUND", message: "Scene not found" });
      const project = db.getProjectById(scene.projectId);
      if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const result = db.createSceneVersion(input.sceneId, input.content, input.versionLabel);
      trackEvent(ctx.user.id, "scene_version_saved", { sceneId: input.sceneId, featureName: "scenes" });
      return result;
    }),

  update: protectedProcedure
    .input(z.object({ versionId: z.number(), ...sceneVersionSchema.shape }))
    .mutation(({ ctx, input }) => {
      const version = db.getVersionById(input.versionId);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      const scene = db.getSceneById(version.sceneId);
      const project = db.getProjectById(scene?.projectId || 0);
      if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      db.updateSceneVersion(input.versionId, input.content, input.versionLabel);
      return db.getVersionById(input.versionId);
    }),

  delete: protectedProcedure.input(z.object({ versionId: z.number() })).mutation(({ ctx, input }) => {
    const version = db.getVersionById(input.versionId);
    if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
    const scene = db.getSceneById(version.sceneId);
    const project = db.getProjectById(scene?.projectId || 0);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    db.deleteSceneVersion(input.versionId);
    trackEvent(ctx.user.id, "scene_version_deleted", { sceneId: version.sceneId, featureName: "scenes" });
    return { success: true };
  }),
});

// ============ MAIN STORY ROUTER ============
const mainStoryRouter = router({
  get: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return db.getMainStory(input.projectId);
  }),

  addScene: protectedProcedure
    .input(z.object({ projectId: z.number(), sceneId: z.number(), versionId: z.number(), order: z.number() }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const result = db.addSceneToMainStory(input.projectId, input.sceneId, input.versionId, input.order);
      trackEvent(ctx.user.id, "main_story_scene_added", { projectId: input.projectId, sceneId: input.sceneId, featureName: "main_story" });
      return result;
    }),

  updateScene: protectedProcedure
    .input(z.object({ mainStorySceneId: z.number(), versionId: z.number(), order: z.number() }))
    .mutation(({ ctx, input }) => {
      db.updateMainStoryScene(input.mainStorySceneId, input.versionId, input.order);
      return { success: true };
    }),

  removeScene: protectedProcedure.input(z.object({ mainStorySceneId: z.number() })).mutation(({ ctx, input }) => {
    db.removeSceneFromMainStory(input.mainStorySceneId);
    trackEvent(ctx.user.id, "main_story_scene_removed", { featureName: "main_story" });
    return { success: true };
  }),
});

// ============ ACTOR ROUTER (CCM world model) ============
const actorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  attributes: z.any().optional(),
  state: z.any().optional(),
  goals: z.any().optional(),
  drives: z.array(z.string()).optional(),
  beliefs: z.any().optional(),
  knowledge: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  resources: z.any().optional(),
  habits: z.array(z.string()).optional(),
  plans: z.array(z.string()).optional(),
});

const actorRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return db.getProjectActors(input.projectId);
  }),

  get: protectedProcedure.input(z.object({ actorId: z.number() })).query(({ ctx, input }) => {
    const actor = db.getActorById(input.actorId);
    if (!actor) throw new TRPCError({ code: "NOT_FOUND", message: "Actor not found" });
    const project = db.getProjectById(actor.projectId);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return actor;
  }),

  create: protectedProcedure
    .input(z.object({ projectId: z.number(), ...actorSchema.shape }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const { projectId, ...actorData } = input;
      const result = db.createActor(projectId, input.name, actorData as any);
      trackEvent(ctx.user.id, "actor_created", { projectId: input.projectId, characterId: result?.id, featureName: "actors" });
      return result;
    }),

  update: protectedProcedure
    .input(z.object({ actorId: z.number(), ...actorSchema.shape }))
    .mutation(({ ctx, input }) => {
      const actor = db.getActorById(input.actorId);
      if (!actor) throw new TRPCError({ code: "NOT_FOUND", message: "Actor not found" });
      const project = db.getProjectById(actor.projectId);
      if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const { actorId, ...actorData } = input;
      db.updateActor(actorId, actorData as any);
      return db.getActorById(actorId);
    }),

  delete: protectedProcedure.input(z.object({ actorId: z.number() })).mutation(({ ctx, input }) => {
    const actor = db.getActorById(input.actorId);
    if (!actor) throw new TRPCError({ code: "NOT_FOUND", message: "Actor not found" });
    const project = db.getProjectById(actor.projectId);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    db.deleteActor(input.actorId);
    trackEvent(ctx.user.id, "actor_deleted", { projectId: actor.projectId, characterId: input.actorId, featureName: "actors" });
    return { success: true };
  }),
});

// ============ WORLD MODEL ROUTER (environments, systems, rules, relationships, constraints) ============
const environmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().optional(),
  attributes: z.any().optional(),
  state: z.any().optional(),
  resources: z.any().optional(),
  inhabitants: z.array(z.string()).optional(),
  accessibility: z.any().optional(),
  activeProcesses: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
});

const environmentRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return db.getProjectEnvironments(input.projectId);
  }),
  create: protectedProcedure
    .input(z.object({ projectId: z.number(), ...environmentSchema.shape }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const { projectId, ...data } = input;
      const result = db.createEnvironment(projectId, input.name, data as any);
      trackEvent(ctx.user.id, "world_model_created", { projectId, featureName: "world_building" });
      return result;
    }),
  update: protectedProcedure
    .input(z.object({ environmentId: z.number(), ...environmentSchema.shape }))
    .mutation(({ ctx, input }) => {
      const env = db.getEnvironmentById(input.environmentId);
      if (!env) throw new TRPCError({ code: "NOT_FOUND", message: "Environment not found" });
      const project = db.getProjectById(env.projectId);
      if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const { environmentId, ...data } = input;
      db.updateEnvironment(environmentId, data as any);
      return db.getEnvironmentById(environmentId);
    }),
  delete: protectedProcedure.input(z.object({ environmentId: z.number() })).mutation(({ ctx, input }) => {
    const env = db.getEnvironmentById(input.environmentId);
    if (!env) throw new TRPCError({ code: "NOT_FOUND", message: "Environment not found" });
    const project = db.getProjectById(env.projectId);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    db.deleteEnvironment(input.environmentId);
    return { success: true };
  }),
});

const systemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().optional(),
  rules: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  activeConditions: z.array(z.string()).optional(),
  effects: z.array(z.string()).optional(),
  exceptions: z.array(z.string()).optional(),
});

const worldSystemRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return db.getProjectSystems(input.projectId);
  }),
  create: protectedProcedure
    .input(z.object({ projectId: z.number(), ...systemSchema.shape }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const { projectId, ...data } = input;
      const result = db.createSystem(projectId, input.name, data as any);
      trackEvent(ctx.user.id, "world_model_created", { projectId, featureName: "world_building" });
      return result;
    }),
  update: protectedProcedure
    .input(z.object({ systemId: z.number(), ...systemSchema.shape }))
    .mutation(({ ctx, input }) => {
      const sys = db.getSystemById(input.systemId);
      if (!sys) throw new TRPCError({ code: "NOT_FOUND", message: "System not found" });
      const project = db.getProjectById(sys.projectId);
      if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const { systemId, ...data } = input;
      db.updateSystem(systemId, data as any);
      return db.getSystemById(systemId);
    }),
  delete: protectedProcedure.input(z.object({ systemId: z.number() })).mutation(({ ctx, input }) => {
    const sys = db.getSystemById(input.systemId);
    if (!sys) throw new TRPCError({ code: "NOT_FOUND", message: "System not found" });
    const project = db.getProjectById(sys.projectId);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    db.deleteSystem(input.systemId);
    return { success: true };
  }),
});

const ruleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  family: z.enum(["actor", "relationship", "environment", "biology", "physics", "social", "temporal", "narrative"]).optional(),
  when: z.any().optional(),
  candidateEvents: z.array(z.any()).optional(),
  effects: z.array(z.any()).optional(),
  priority: z.number().int().optional(),
  probability: z.number().min(0).max(1).optional(),
  cooldown: z.number().int().optional(),
  scope: z.string().optional(),
  enabled: z.boolean().optional(),
});

const ruleRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return db.getProjectRules(input.projectId);
  }),
  create: protectedProcedure
    .input(z.object({ projectId: z.number(), ...ruleSchema.shape }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const { projectId, ...data } = input;
      const result = db.createRule(projectId, input.name, data as any);
      return result;
    }),
  update: protectedProcedure
    .input(z.object({ ruleId: z.number(), ...ruleSchema.shape }))
    .mutation(({ ctx, input }) => {
      const rule = db.getRuleById(input.ruleId);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
      const project = db.getProjectById(rule.projectId);
      if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const { ruleId, ...data } = input;
      db.updateRule(ruleId, data as any);
      return db.getRuleById(ruleId);
    }),
  delete: protectedProcedure.input(z.object({ ruleId: z.number() })).mutation(({ ctx, input }) => {
    const rule = db.getRuleById(input.ruleId);
    if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
    const project = db.getProjectById(rule.projectId);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    db.deleteRule(input.ruleId);
    return { success: true };
  }),
});

const relationshipRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return db.getProjectRelationships(input.projectId);
  }),
  create: protectedProcedure
    .input(z.object({ projectId: z.number(), actorAId: z.number(), actorBId: z.number() }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const result = db.createRelationship(input.projectId, input.actorAId, input.actorBId);
      return result;
    }),
  delete: protectedProcedure.input(z.object({ relationshipId: z.number() })).mutation(({ ctx, input }) => {
    const rel = db.getRelationshipById(input.relationshipId);
    if (!rel) throw new TRPCError({ code: "NOT_FOUND" });
    const project = db.getProjectById(rel.projectId);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    db.deleteRelationship(input.relationshipId);
    return { success: true };
  }),
});

const constraintRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ ctx, input }) => {
    const project = db.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    return db.getProjectConstraints(input.projectId);
  }),
  create: protectedProcedure
    .input(z.object({ projectId: z.number(), name: z.string().min(1), class: z.enum(["hard", "soft", "forbidden", "range", "temporal"]).optional(), target: z.any().optional(), description: z.string().optional(), priority: z.number().int().optional() }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const { projectId, ...data } = input;
      const result = db.createConstraint(projectId, input.name, data as any);
      return result;
    }),

  update: protectedProcedure
    .input(z.object({ constraintId: z.number(), name: z.string().min(1).optional(), class: z.enum(["hard", "soft", "forbidden", "range", "temporal"]).optional(), target: z.any().optional(), description: z.string().optional(), priority: z.number().int().optional(), satisfied: z.boolean().optional(), satisfiedAt: z.number().int().optional() }))
    .mutation(({ ctx, input }) => {
      const constraint = db.getConstraintById(input.constraintId);
      if (!constraint) throw new TRPCError({ code: "NOT_FOUND" });
      const project = db.getProjectById(constraint.projectId);
      if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      const { constraintId, ...data } = input;
      db.updateConstraint(constraintId, data as any);
      return db.getConstraintById(constraintId);
    }),

  delete: protectedProcedure.input(z.object({ constraintId: z.number() })).mutation(({ ctx, input }) => {
    const constraint = db.getConstraintById(input.constraintId);
    if (!constraint) throw new TRPCError({ code: "NOT_FOUND" });
    const project = db.getProjectById(constraint.projectId);
    if (project?.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    db.deleteConstraint(input.constraintId);
    return { success: true };
  }),
});

// ============ AUTH ROUTER (Local PIN) ============
const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user ?? null),

  /** Returns the vault state so the client can decide which UI to show. */
  vaultState: publicProcedure.query(() => ({
    configured: isConfigured(),
    unlocked: isUnlocked(),
  })),

  /** First-time setup: create the PIN and initialize the encrypted vault. */
  setup: publicProcedure
    .input(z.object({ pin: z.string().min(4, "PIN must be at least 4 characters") }))
    .mutation(({ ctx, input }) => {
      setupVault(input.pin);
      startEmbeddedMcpServer();
      openSession(1);
      trackEvent(1, "user_signup", { featureName: "auth" });
      return { user: db.getLocalUser() };
    }),

  /** Unlock an already-configured vault. */
  unlock: publicProcedure
    .input(z.object({ pin: z.string().min(1, "PIN is required") }))
    .mutation(({ ctx, input }) => {
      unlockVault(input.pin);
      startEmbeddedMcpServer();
      openSession(1);
      trackEvent(1, "user_login", { featureName: "auth" });
      return { user: db.getLocalUser() };
    }),

  /** Lock the vault (closes the encrypted DB). */
  lock: publicProcedure.mutation(() => {
    closeSession(1);
    trackEvent(1, "user_logout", { featureName: "auth" });
    stopEmbeddedMcpServer();
    lockVault();
    return { success: true };
  }),

  /** Change the PIN (requires the vault to be unlocked). */
  changePin: protectedProcedure
    .input(z.object({ currentPin: z.string(), newPin: z.string().min(4, "PIN must be at least 4 characters") }))
    .mutation(({ ctx, input }) => {
      changePin(input.currentPin, input.newPin);
      return { success: true };
    }),
});

const userSettingsSchema = z.object({
  penName: z.string().optional(),
  bio: z.string().optional(),
  theme: z.enum(["light", "dark", "sepia"]).default("light"),
  defaultExportFormat: z.enum(["md", "docx", "pdf"]).default("pdf"),
  writingGoalDaily: z.number().int().min(0).default(500),
});

// ============ USER SETTINGS ROUTER ============
const userSettingsRouter = router({
  get: protectedProcedure.query(({ ctx }) => db.getUserSettings(ctx.user.id)),

  update: protectedProcedure
    .input(userSettingsSchema.partial())
    .mutation(({ ctx, input }) => db.upsertUserSettings(ctx.user.id, input)),
});

// ============ STORAGE ROUTER ============
const storageRouter = router({
  getUsage: protectedProcedure.query(({ ctx }) => db.getStorageUsage(ctx.user.id)),
});

// ============ BETA REQUEST ROUTER ============
const betaRequestRouter = router({
  submit: publicProcedure
    .input(z.object({ name: z.string().min(1), email: z.string().email(), reason: z.string().min(1) }))
    .mutation(({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Service unavailable. Please try again later." });
      try {
        db.insert(betaRequests).values(input).run();
        try {
          sendEmail(input.email, "beta_received", { name: input.name });
        } catch (e) {
          console.warn("[BetaSubmit] Automated reply failed:", e);
        }
        return { success: true };
      } catch (err: any) {
        if (err?.code === "SQLITE_CONSTRAINT_UNIQUE" || err?.message?.includes("UNIQUE")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email has already been submitted for beta access.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit your application. Please try again.",
        });
      }
    }),

  list: adminProcedure.query(() => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(betaRequests).orderBy(desc(betaRequests.createdAt)).all();
  }),

  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "approved", "denied", "invited"]),
        rejectionReason: z.string().optional(),
        waveName: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const request = db.select().from(betaRequests).where(eq(betaRequests.id, input.id)).limit(1).get();
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });

      db.update(betaRequests)
        .set({
          status: input.status,
          rejectionReason: input.rejectionReason,
          waveName: input.waveName,
        })
        .where(eq(betaRequests.id, input.id))
        .run();

      if (input.status === "approved") {
        provisionTester(ctx.user.id, request.name, request.email);
      }

      ctx.logAction("update_beta_status", "beta_request", input.id, { status: input.status });
      return { success: true };
    }),
});

// ============ FEEDBACK ROUTER ============
const feedbackRouter = router({
  submit: protectedProcedure
    .input(
      z.object({
        category: z.enum(["bug", "feature", "ux", "pricing", "other"]),
        responses: z.record(z.string(), z.string()),
      })
    )
    .mutation(({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      db.insert(feedback)
        .values({ userId: ctx.user.id, category: input.category, content: JSON.stringify(input.responses) })
        .run();
      return { success: true };
    }),

  list: adminProcedure.query(() => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(feedback).orderBy(desc(feedback.createdAt)).all();
  }),

  updateStatus: adminProcedure
    .input(z.object({ id: z.number(), status: z.enum(["new", "reviewed", "actioned", "dismissed"]) }))
    .mutation(({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      db.update(feedback).set({ status: input.status, updatedAt: new Date() }).where(eq(feedback.id, input.id)).run();
      ctx.logAction("update_feedback_status", "feedback", input.id, { status: input.status });
      return { success: true };
    }),
});

// ============ ADMIN USER PROVISIONING ROUTER ============
const adminUserRouter = router({
  provisionBetaAccount: adminProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string().email(),
        betaTier: z.enum(["none", "beta", "pro"]),
        daysToExpiry: z.number().int().min(1),
      })
    )
    .mutation(({ ctx, input }) => {
      return provisionTester(ctx.user.id, input.name, input.email, input.daysToExpiry);
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        role: z.enum(["user", "admin", "support", "viewer"]),
        isBeta: z.boolean().default(false),
      })
    )
    .mutation(({ ctx, input }) => {
      if (input.isBeta) {
        return provisionTester(ctx.user.id, input.name, input.email);
      }
      let finalEmail = input.email.toLowerCase().trim();
      let password = Math.random().toString(36).slice(-10);
      const dbInstance = getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      db.upsertUser({
        openId: `email:${finalEmail}`,
        name: input.name,
        email: finalEmail,
        contactEmail: null,
        loginMethod: "email",
        passwordHash: password,
        lastSignedIn: new Date(),
        role: input.role,
      } as any);

      const targetUser = db.getUserByEmail(finalEmail);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND" });

      ctx.logAction("admin_create_user", "user", targetUser.id, { email: finalEmail, role: input.role, isBeta: false });
      return { email: finalEmail, password };
    }),

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "admin", "support", "viewer"]) }))
    .mutation(({ ctx, input }) => {
      const dbInstance = getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      dbInstance.update(users).set({ role: input.role }).where(eq(users.id, input.userId)).run();
      ctx.logAction("update_user_role", "user", input.userId, { role: input.role });
      return { success: true };
    }),

  updateUserPassword: adminProcedure
    .input(z.object({ userId: z.number(), newPassword: z.string().min(8) }))
    .mutation(({ ctx, input }) => {
      const dbInstance = getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      dbInstance.update(users).set({ passwordHash: input.newPassword, forcePasswordChange: true }).where(eq(users.id, input.userId)).run();
      ctx.logAction("update_user_password", "user", input.userId);
      return { success: true };
    }),
});

// ============ COMMUNICATION ROUTER ============
const communicationRouter = router({
  send: adminProcedure
    .input(
      z.object({
        recipientId: z.number(),
        body: z.string().min(1),
        subject: z.string().optional(),
        type: z.enum(["email", "internal", "whatsapp", "messenger"]),
      })
    )
    .mutation(({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      db.insert(messages).values({ ...input, senderId: ctx.user.id }).run();
      ctx.logAction("send_message", "message", undefined, { recipientId: input.recipientId, type: input.type });
      return { success: true };
    }),

  list: adminProcedure.query(() => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(messages).orderBy(desc(messages.createdAt)).all();
  }),
});

// ============ EMAIL ROUTER ============
const emailRouter = router({
  listTemplates: adminProcedure.query(() => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(emailTemplates).all();
  }),

  createTemplate: adminProcedure
    .input(z.object({ name: z.string(), subject: z.string(), body: z.string(), variables: z.array(z.string()) }))
    .mutation(({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      db.insert(emailTemplates).values(input).run();
      ctx.logAction("create_email_template", "email_template", undefined, { name: input.name });
      return { success: true };
    }),
});

// ============ APP ROUTER ============
import { searchRouter } from "./routers/search";
import { versionComparisonRouter } from "./routers/versionComparison";
import { exportRouter } from "./routers/export";
import { adminRouter } from "./routers/admin";
import { writingRouter } from "./routers/writing";
import { agentRouter } from "./routers/agent";
import { ideasRouter } from "./routers/ideas";
import { simulationRouter } from "./routers/simulation";

export const appRouter = router({
  auth: authRouter,
  system: systemRouter,
  userSettings: userSettingsRouter,
  beta: betaRequestRouter,
  feedback: feedbackRouter,
  communication: communicationRouter,
  email: emailRouter,
  adminUser: adminUserRouter,
  storage: storageRouter,
  project: projectRouter,
  projectSettings: projectSettingsRouter,
  scene: sceneRouter,
  version: versionRouter,
  mainStory: mainStoryRouter,
  actor: actorRouter,
  environment: environmentRouter,
  worldSystem: worldSystemRouter,
  rule: ruleRouter,
  relationship: relationshipRouter,
  constraint: constraintRouter,
  simulation: simulationRouter,
  search: searchRouter,
  versionComparison: versionComparisonRouter,
  export: exportRouter,
  admin: adminRouter,
  writing: writingRouter,
  agent: agentRouter,
  ideas: ideasRouter,
});

export type AppRouter = typeof appRouter;