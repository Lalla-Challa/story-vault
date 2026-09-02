import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { getDb } from "../db";
import { agentProposals, projectMemory as projectMemoryTable } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getAgentSettings, saveAgentSettings, toPublicSettings } from "../agent/settings";
import { buildModel, normalizeBaseUrl, OLLAMA_DEFAULT_BASE_URL } from "../agent/provider";
import { generateText } from "ai";
import { listProposals, getProposal } from "../agent/tools";
import { trackEvent } from "../services/activityTracker";
import * as storageService from "../services/storageService";
import {
  getProjectMemory,
  addMemory,
  searchMemory,
  deleteMemory,
  formatMemoryBlock,
} from "../agent/projectMemory";
import {
  createSession,
  getSession,
  listSessions,
  updateSessionMessages,
  updateSessionTitle,
  deleteSession,
  branchSession,
  createResearchThread,
  updateSessionStatus,
  appendSessionMessage,
} from "../agent/chatSessions";
import { synthesizeThread } from "../agent/synthesize";
import { compileProjectBrief } from "../agent/ideation";
import type { ChatMessage } from "../../drizzle/schema";

export const agentRouter = router({
  settings: router({
    /**
     * Returns the public settings shape (API key is never returned — only
     * a `hasApiKey` boolean).
     */
    get: protectedProcedure.query(() => toPublicSettings(getAgentSettings())),
    /**
     * Updates the agent settings. Passing an empty / omitted `apiKey`
     * preserves the existing stored key.
     */
    update: protectedProcedure
      .input(
        z.object({
          provider: z.enum(["openai", "anthropic", "openai-compatible"]).optional(),
          baseUrl: z.string().optional(),
          model: z.string().optional(),
          apiKey: z.string().optional(),
          contextWindow: z.number().int().positive().nullable().optional(),
        })
      )
      .mutation(({ input }) => toPublicSettings(saveAgentSettings(input))),

    /**
     * Sends a tiny test prompt to the configured LLM and reports whether it
     * responded. The API key is read from the encrypted DB — never from the
     * request. Also returns the resolved request URL so misconfiguration is
     * visible.
     */
    test: protectedProcedure.mutation(async () => {
      const settings = getAgentSettings();
      if (!settings || !settings.apiKey || !settings.model) {
        return { ok: false, message: "Configure an API key and model first." };
      }
      const base =
        settings.baseUrl && settings.baseUrl.trim()
          ? normalizeBaseUrl(settings.baseUrl)
          : settings.provider === "openai-compatible"
          ? OLLAMA_DEFAULT_BASE_URL
          : "https://api.openai.com/v1";
      const resolvedUrl = `${base}/chat/completions`;
      // Log the exact stored config + resolved URL so misconfiguration is visible
      // (never log the API key).
      console.log(
        "[Agent test] provider=%s model=%j baseUrl=%j resolvedUrl=%s",
        settings.provider,
        settings.model,
        settings.baseUrl,
        resolvedUrl
      );
      try {
        const model = buildModel(settings);
        const { text } = await generateText({ model, prompt: "Reply with exactly: OK" });
        return { ok: true, message: (text ?? "").trim().slice(0, 200) || "Connected", url: resolvedUrl };
      } catch (error: any) {
        console.log(
          "[Agent test] FAILED resolvedUrl=%s statusCode=%s responseBody=%j",
          resolvedUrl,
          error?.statusCode ?? error?.cause?.status ?? "n/a",
          error?.responseBody ?? error?.cause?.responseBody ?? error?.message ?? ""
        );
        return { ok: false, message: error instanceof Error ? error.message : String(error), url: resolvedUrl };
      }
    }),
  }),

  /**
   * The agent's LLM integration mode for a project (CCM spec §two modes):
   * - `observer` (default): the LLM is layered ON TOP of the engine — it can
   *   read everything and render prose, but has no write tools. Canon stays
   *   untouched by the model.
   * - `baked_in`: the LLM is INSIDE the loop — it gains `propose_*` tools
   *   whose structured state changes are validated by the engine's 6-layer
   *   validation engine before being applied.
   * Stored in project_settings under `agent_mode`.
   */
  mode: router({
    get: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ ctx, input }) => {
        const project = db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        const setting = db.getProjectSettingByKey(input.projectId, "agent_mode");
        const mode = setting?.settingValue === "baked_in" ? "baked_in" : "observer";
        return { mode };
      }),

    set: protectedProcedure
      .input(z.object({ projectId: z.number(), mode: z.enum(["observer", "baked_in"]) }))
      .mutation(({ ctx, input }) => {
        const project = db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        db.upsertProjectSetting(input.projectId, "agent_mode", input.mode);
        return { mode: input.mode };
      }),
  }),

  proposals: router({
    /**
     * All proposals for the project (pending, accepted, rejected), newest
     * first. The client can rebuild the diff from `originalContent` and
     * `content` fields.
     */
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ ctx, input }) => {
        const project = db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        return listProposals(input.projectId);
      }),

    /**
     * Accepts a pending proposal: creates a new "revised" scene version
     * through the normal pipeline (quota, word count, size tracking) and
     * marks the proposal as accepted.
     */
    accept: protectedProcedure
      .input(z.object({ proposalId: z.number() }))
      .mutation(({ ctx, input }) => {
        const proposal = getProposal(input.proposalId);
        if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
        const project = db.getProjectById(proposal.projectId);
        if (!project || project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        if (proposal.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "This proposal has already been resolved" });

        const version = db.createSceneVersion(proposal.sceneId, proposal.content, "draft");
        const db2 = getDb()!;
        db2.update(agentProposals).set({ status: "accepted" }).where(eq(agentProposals.id, proposal.id)).run();
        trackEvent(ctx.user.id, "scene_version_saved", { sceneId: proposal.sceneId, featureName: "agent" });
        return { success: true, versionId: version?.id };
      }),

    /**
     * Rejects a pending proposal without creating a version.
     */
    reject: protectedProcedure
      .input(z.object({ proposalId: z.number() }))
      .mutation(({ ctx, input }) => {
        const proposal = getProposal(input.proposalId);
        if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
        const project = db.getProjectById(proposal.projectId);
        if (!project || project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        if (proposal.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "This proposal has already been resolved" });
        const db2 = getDb()!;
        db2.update(agentProposals).set({ status: "rejected" }).where(eq(agentProposals.id, proposal.id)).run();
        return { success: true };
      }),
  }),

  sessions: router({
    /** All chat sessions for the project, newest first. */
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ ctx, input }) => {
        const project = db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        return listSessions(input.projectId);
      }),

    /** Get a single session including its full message history. */
    get: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(({ ctx, input }) => {
        const session = getSession(input.sessionId);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
        const project = db.getProjectById(session.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return session;
      }),

    /** Create a new chat session. */
    create: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          title: z.string().optional(),
          type: z.enum(["main", "research", "ideation"]).optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const project = db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        const session = createSession({
          projectId: input.projectId,
          title: input.title ?? "New chat",
          type: input.type ?? "main",
          messages: [],
        });
        return session;
      }),

    /**
     * Branch from a message in a session: creates a new session whose history
     * is the parent's messages up to and including the given message index.
     */
    branch: protectedProcedure
      .input(
        z.object({
          parentSessionId: z.number(),
          parentMessageId: z.number().int().min(0),
        })
      )
      .mutation(({ ctx, input }) => {
        const parent = getSession(input.parentSessionId);
        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Parent session not found" });
        const project = db.getProjectById(parent.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const branch = branchSession(parent.projectId, input.parentSessionId, input.parentMessageId);
        return branch;
      }),

    /** Persist updated messages for a session (called by the client after each run). */
    updateMessages: protectedProcedure
      .input(
        z.object({
          sessionId: z.number(),
          messages: z.array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
              toolCalls: z
                .array(
                  z.object({
                    name: z.string(),
                    args: z.record(z.string(), z.unknown()).optional(),
                    summary: z.string().optional(),
                  })
                )
                .optional(),
              createdAt: z.string().optional(),
            })
          ),
        })
      )
      .mutation(({ ctx, input }) => {
        const session = getSession(input.sessionId);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
        const project = db.getProjectById(session.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        updateSessionMessages(input.sessionId, input.messages as any);
        return { success: true };
      }),

    /** Rename a session. */
    rename: protectedProcedure
      .input(z.object({ sessionId: z.number(), title: z.string().min(1) }))
      .mutation(({ ctx, input }) => {
        const session = getSession(input.sessionId);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
        const project = db.getProjectById(session.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        updateSessionTitle(input.sessionId, input.title);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(({ ctx, input }) => {
        const session = getSession(input.sessionId);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
        const project = db.getProjectById(session.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        deleteSession(input.sessionId);
        storageService.recomputeUsage(ctx.user.id);
        return { success: true };
      }),

    /**
     * Creates an isolated Research Thread branched from a message in a main
     * session. The thread only carries the parent's context up to the branch
     * point — the main chat's subsequent messages stay out of it.
     */
    createResearchThread: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          parentSessionId: z.number(),
          parentMessageId: z.number().int().min(0),
        })
      )
      .mutation(({ ctx, input }) => {
        const parent = getSession(input.parentSessionId);
        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Parent session not found" });
        const project = db.getProjectById(parent.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        if (parent.type !== "main") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Research threads must branch from a main chat" });
        }
        const thread = createResearchThread(parent.projectId, input.parentSessionId, input.parentMessageId);
        return thread;
      }),

    /**
     * Synthesize & Merge: runs an LLM over the research thread's messages,
     * injects the condensed summary as a new assistant message into the main
     * chat, and marks the thread as merged.
     */
    synthesize: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const thread = getSession(input.sessionId);
        if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        const project = db.getProjectById(thread.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        if (thread.type !== "research") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only research threads can be synthesized" });
        }
        if (thread.status !== "active") {
          throw new TRPCError({ code: "CONFLICT", message: "This thread has already been resolved" });
        }
        if (!thread.parentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Research thread has no parent main chat" });
        }

        const threadMessages = (thread.messages as unknown as ChatMessage[]) ?? [];
        const summary = await synthesizeThread(threadMessages);

        const parent = getSession(thread.parentId);
        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Main chat not found" });
        appendSessionMessage(thread.parentId, {
          role: "assistant",
          content: `Research synthesis — "${thread.title}"\n\n${summary}`,
          toolCalls: [
            {
              name: "research_synthesis",
              args: { threadId: thread.id, threadTitle: thread.title },
              summary: "Merged research thread conclusions",
            },
          ],
          createdAt: new Date().toISOString(),
        });
        updateSessionStatus(input.sessionId, "merged");
        trackEvent(ctx.user.id, "ai_chat_message_sent", { featureName: "research_thread", projectId: thread.projectId });

        return { success: true, summary, mainSessionId: thread.parentId };
      }),

    /** Discard a research thread without touching the main chat. */
    discard: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(({ ctx, input }) => {
        const thread = getSession(input.sessionId);
        if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
        const project = db.getProjectById(thread.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        if (thread.type !== "research") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only research threads can be discarded" });
        }
        if (thread.status !== "active") {
          throw new TRPCError({ code: "CONFLICT", message: "This thread has already been resolved" });
        }
        updateSessionStatus(input.sessionId, "discarded");
        return { success: true };
      }),
  }),

  memory: router({
    /** All project memory entries, newest first. */
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ ctx, input }) => {
        const project = db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        return getProjectMemory(input.projectId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          category: z.enum(["rule", "fact", "hypothesis"]),
          content: z.string().min(1),
        })
      )
      .mutation(({ ctx, input }) => {
        const project = db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        return addMemory({ projectId: input.projectId, category: input.category, content: input.content });
      }),

    delete: protectedProcedure
      .input(z.object({ memoryId: z.number() }))
      .mutation(({ ctx, input }) => {
        const dbInst = getDb();
        if (!dbInst) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const mem = dbInst
          .select({ id: projectMemoryTable.id, projectId: projectMemoryTable.projectId })
          .from(projectMemoryTable)
          .where(eq(projectMemoryTable.id, input.memoryId))
          .get();
        if (!mem) throw new TRPCError({ code: "NOT_FOUND", message: "Memory entry not found" });
        const project = db.getProjectById(mem.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        deleteMemory(input.memoryId);
        storageService.recomputeUsage(ctx.user.id);
        return { success: true };
      }),

    search: protectedProcedure
      .input(z.object({ projectId: z.number(), query: z.string().min(1) }))
      .query(({ ctx, input }) => {
        const project = db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        return searchMemory(input.projectId, input.query);
      }),

    /** Returns the rendered memory block exactly as injected into prompts (for preview). */
    preview: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ ctx, input }) => {
        const project = db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        return { block: formatMemoryBlock(input.projectId) };
      }),
  }),

  ideation: router({
    /**
     * Promote pinned ideation concepts into the project:
     * 1. Optionally LLM-compiles them into a cohesive Project Brief.
     * 2. Saves the brief (category `project_brief`) and each pinned concept
     *    (category `core_directive`) into project_memory — which is injected
     *    into every future agent run, so the main working agent already knows
     *    the plan.
     * 3. Creates a working scene the user can open in the Writing Studio.
     */
    initialize: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int(),
          pinnedConcepts: z.array(z.string().min(1)).min(1, "Pin at least one core concept first"),
          sceneTitle: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const project = db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

        const brief = await compileProjectBrief(input.pinnedConcepts);

        const briefEntry = addMemory({
          projectId: input.projectId,
          category: "project_brief",
          content: brief,
        });
        const conceptMemoryIds = input.pinnedConcepts.map((p) =>
          addMemory({ projectId: input.projectId, category: "core_directive", content: p }).id
        );

        const fallbackTitle =
          brief
            .split("\n")
            .map((l) => l.replace(/^[-•*]\s*/, "").trim())
            .find((l) => l.length > 0)
            ?.slice(0, 60) ?? "New Scene";
        const title = input.sceneTitle?.trim() || `Draft: ${fallbackTitle}`;
        const scene = db.createScene(input.projectId, title, "Created from the Ideation workspace.");

        trackEvent(ctx.user.id, "scene_created", { projectId: input.projectId, sceneId: scene?.id, featureName: "ideation" });
        trackEvent(ctx.user.id, "world_model_created", { projectId: input.projectId, featureName: "ideation" });

        return {
          success: true,
          briefMemoryId: briefEntry.id,
          conceptMemoryIds,
          sceneId: scene?.id,
          sceneTitle: title,
        };
      }),
  }),
});