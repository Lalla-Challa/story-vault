import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { getDb } from "../db";
import { ideas } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createIdeaResearchThread } from "../agent/chatSessions";
import { trackEvent } from "../services/activityTracker";
import * as storageService from "../services/storageService";

const ideaSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  status: z.enum(["raw", "evaluating", "adopted", "discarded"]).optional(),
  linkedSceneId: z.number().int().nullable().optional(),
});

export type IdeaDto = {
  id: number;
  projectId: number;
  title: string;
  content: string;
  status: "raw" | "evaluating" | "adopted" | "discarded";
  linkedSceneId: number | null;
  linkedSceneTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toIdeaDto(idea: typeof ideas.$inferSelect): IdeaDto {
  const scene = idea.linkedSceneId != null ? db.getSceneById(idea.linkedSceneId) : undefined;
  return {
    id: idea.id,
    projectId: idea.projectId,
    title: idea.title,
    content: idea.content,
    status: idea.status,
    linkedSceneId: idea.linkedSceneId,
    linkedSceneTitle: scene?.title ?? null,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  };
}

/**
 * Idea Vault router. Completely isolated from the scene/project routers —
 * the Writing Studio never queries ideas, so the manuscript stays clean.
 */
export const ideasRouter = router({
  /**
   * Lists ideas for a project. Optionally filters by the scene they are
   * linked to (unidirectional: idea → scene).
   */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        linkedSceneId: z.number().int().nullable().optional(),
        status: z.enum(["raw", "evaluating", "adopted", "discarded"]).optional(),
      })
    )
    .query(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

      const dbInst = getDb();
      if (!dbInst) return [];

      const conditions = [eq(ideas.projectId, input.projectId)];
      if (input.linkedSceneId === null) {
        conditions.push(isNull(ideas.linkedSceneId));
      } else if (input.linkedSceneId !== undefined) {
        conditions.push(eq(ideas.linkedSceneId, input.linkedSceneId));
      }
      if (input.status !== undefined) {
        conditions.push(eq(ideas.status, input.status));
      }

      const rows =
        conditions.length === 1
          ? dbInst.select().from(ideas).where(conditions[0]).all()
          : dbInst.select().from(ideas).where(and(...conditions)).all();

      return rows.map(toIdeaDto);
    }),

  get: protectedProcedure
    .input(z.object({ ideaId: z.number().int() }))
    .query(({ ctx, input }) => {
      const dbInst = getDb();
      if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const idea = dbInst.select().from(ideas).where(eq(ideas.id, input.ideaId)).get();
      if (!idea) throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
      const project = db.getProjectById(idea.projectId);
      if (!project || project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      return toIdeaDto(idea);
    }),

  create: protectedProcedure
    .input(z.object({ projectId: z.number().int(), ...ideaSchema.shape }))
    .mutation(({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      if (input.linkedSceneId != null) {
        const scene = db.getSceneById(input.linkedSceneId);
        if (!scene || scene.projectId !== input.projectId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Linked scene does not exist in this project" });
        }
      }

      const dbInst = getDb();
      if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Ideas are part of the storage quota; enforce byte-accurate usage.
      const ideaSize = storageService.calculateBytes(input.title) + storageService.calculateBytes(input.content);
      storageService.enforceQuota(project.userId, ideaSize);
      const result = dbInst
        .insert(ideas)
        .values({
          projectId: input.projectId,
          title: input.title,
          content: input.content,
          status: input.status ?? "raw",
          linkedSceneId: input.linkedSceneId ?? null,
        })
        .run();
      storageService.recomputeUsage(project.userId);
      const idea = dbInst.select().from(ideas).where(eq(ideas.id, result.lastInsertRowid as number)).get()!;
      trackEvent(ctx.user.id, "world_model_created", { projectId: input.projectId, featureName: "ideas" });
      return toIdeaDto(idea);
    }),

  update: protectedProcedure
    .input(z.object({ ideaId: z.number().int(), ...ideaSchema.shape }))
    .mutation(({ ctx, input }) => {
      const dbInst = getDb();
      if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = dbInst.select().from(ideas).where(eq(ideas.id, input.ideaId)).get();
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
      const project = db.getProjectById(existing.projectId);
      if (!project || project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      if (input.linkedSceneId != null) {
        const scene = db.getSceneById(input.linkedSceneId);
        if (!scene || scene.projectId !== existing.projectId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Linked scene does not exist in this project" });
        }
      }

      const { ideaId, ...updates } = input;
      // Delta-based quota check on update.
      const oldSize = storageService.calculateBytes(existing.title) + storageService.calculateBytes(existing.content);
      const newSize = storageService.calculateBytes(updates.title) + storageService.calculateBytes(updates.content);
      storageService.enforceQuota(project.userId, newSize - oldSize);
      dbInst.update(ideas)
        .set({
          title: updates.title,
          content: updates.content,
          status: updates.status ?? existing.status,
          linkedSceneId: updates.linkedSceneId === undefined ? existing.linkedSceneId : updates.linkedSceneId,
          updatedAt: new Date(),
        })
        .where(eq(ideas.id, ideaId))
        .run();
      storageService.recomputeUsage(project.userId);
      const updated = dbInst.select().from(ideas).where(eq(ideas.id, ideaId)).get()!;
      return toIdeaDto(updated);
    }),

  delete: protectedProcedure
    .input(z.object({ ideaId: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const dbInst = getDb();
      if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = dbInst.select().from(ideas).where(eq(ideas.id, input.ideaId)).get();
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
      const project = db.getProjectById(existing.projectId);
      if (!project || project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      dbInst.delete(ideas).where(eq(ideas.id, input.ideaId)).run();
      storageService.recomputeUsage(ctx.user.id);
      return { success: true };
    }),

  /**
   * Bonus: open an isolated Research Thread seeded with the idea's content so
   * the AI can evaluate/refine it. Marks the idea as "evaluating".
   */
  evaluate: protectedProcedure
    .input(z.object({ ideaId: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const dbInst = getDb();
      if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const idea = dbInst.select().from(ideas).where(eq(ideas.id, input.ideaId)).get();
      if (!idea) throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
      const project = db.getProjectById(idea.projectId);
      if (!project || project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

      const thread = createIdeaResearchThread(idea.projectId, idea.title, idea.content);
      dbInst.update(ideas)
        .set({ status: "evaluating", updatedAt: new Date() })
        .where(eq(ideas.id, idea.id))
        .run();
      trackEvent(ctx.user.id, "ai_chat_message_sent", { projectId: idea.projectId, featureName: "ideas" });
      return { threadId: thread.id, ideaId: idea.id };
    }),
});