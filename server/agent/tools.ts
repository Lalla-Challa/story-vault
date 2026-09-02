import { tool, generateText, type ToolSet } from "ai";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import * as db from "../db";
import { getDb } from "../db";
import { agentProposals, ideas } from "../../drizzle/schema";
import type { AgentProposal } from "../../drizzle/schema";
import { getAgentSettings } from "./settings";
import { buildModel } from "./provider";
import { addMemory, searchMemory } from "./projectMemory";
import { proposeActorChange, proposeEnvironmentChange, proposeSystemChange, proposeRelationshipChange } from "./engineProposals";
import { renderSkeletonToProposal } from "../modules/simulation/skeletonRenderer";
import { listSimulations, createSimulation } from "../modules/simulation/simulation.data";
import { suggestTags, checkContradiction } from "../ccm/semantics";
import { CCM_SECTION_IDS, getSectionById, searchSections } from "../ccm/guidance";
import { escapeLlmText, fenceLlmContent } from "../entities";

const CCM_PROPOSAL_REMINDER =
  "CCM reminder: canon must follow the current world state and governing systems; accepted changes create the conditions for later events. Treat causal scrutiny as proportional to causal load.";

/**
 * SSE events the agent emits while running. `proposal` events are pushed by
 * the tool executions themselves as proposals are staged.
 */
export type AgentSseEvent =
  | { type: "start"; projectId: number }
  | { type: "thought"; text: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; summary: string }
  | { type: "proposal"; proposal: ProposalDto }
  | { type: "subtask_start"; id: string; description: string }
  | { type: "subtask_end"; id: string }
  | { type: "suggest_research_thread"; topic: string; reason: string }
  | { type: "done"; text: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }
  | { type: "error"; message: string };

export type ProposalDto = {
  id: number;
  projectId: number;
  sceneId: number;
  sceneTitle: string;
  kind: "draft" | "precise_edit";
  content: string;
  originalContent: string;
  findString: string | null;
  replaceString: string | null;
  summary: string | null;
  status: "pending" | "accepted" | "rejected";
  createdAt: Date;
};

export function toProposalDto(p: AgentProposal): ProposalDto {
  const scene = db.getSceneById(p.sceneId);
  return {
    id: p.id,
    projectId: p.projectId,
    sceneId: p.sceneId,
    sceneTitle: scene?.title ?? `Scene #${p.sceneId}`,
    kind: p.kind,
    content: p.content,
    originalContent: p.originalContent,
    findString: p.findString,
    replaceString: p.replaceString,
    summary: p.summary,
    status: p.status,
    createdAt: p.createdAt,
  };
}

export function listProposals(projectId: number): ProposalDto[] {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(agentProposals)
    .where(eq(agentProposals.projectId, projectId))
    .orderBy(desc(agentProposals.createdAt))
    .all()
    .map(toProposalDto);
}

export function getProposal(proposalId: number): AgentProposal | undefined {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(agentProposals).where(eq(agentProposals.id, proposalId)).get();
}

type AgentEmit = (event: AgentSseEvent) => void;

type ToolsContext = {
  projectId: number;
  emit: AgentEmit;
  /** 'main' exposes write/propose tools; 'research' exposes read-only tools; 'ideation' has none. */
  mode?: "main" | "research" | "ideation";
  /**
   * LLM integration mode (CCM two modes):
   * - `observer` (default): read-only + render_skeleton + delegation. The LLM
   *   is layered on top of the engine — it reads but never mutates canon.
   * - `baked_in`: observer + direct management tools + `propose_*` tools whose
   *   state changes are validated by the engine before being applied.
   */
  agentMode?: "observer" | "baked_in";
};

const SUB_AGENT_SYSTEM_PROMPT = `You are a focused research sub-agent working on behalf of the main writing assistant.

Your job is to complete the assigned task as thoroughly as needed, then return ONLY a concise, structured summary of your findings that the main agent can paste directly into the conversation. 

Guidelines:
- Work independently with your own context. Do not assume the main agent knows what you discovered.
- Keep the summary dense and factual: key conclusions, notable details, quotes (if relevant), and anything the main agent should verify.
- Use short sections with bold headings when the output is long.
- Do NOT greet, apologize, or add meta-commentary. Output the summary directly.`;

/**
 * Runs a sub-agent with a fresh context window to evaluate a hypothesis,
 * fact-check, or brainstorm. Returns only a compressed summary.
 */
async function runSubAgent(taskDescription: string, expectedOutput?: string): Promise<string> {
  const settings = getAgentSettings();
  if (!settings || !settings.apiKey || !settings.model) {
    throw new Error("AI is not configured — cannot delegate sub-task.");
  }
  const model = buildModel(settings);
  const prompt = expectedOutput
    ? `${taskDescription}\n\nExpected output: ${expectedOutput}`
    : taskDescription;

  const { text } = await generateText({
    model,
    system: SUB_AGENT_SYSTEM_PROMPT,
    prompt,
  });
  return text ?? "";
}

/** Light markdown-ish → HTML conversion for agent-generated prose. */
export function normalizeToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  // Already contains HTML tags → pass through untouched
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;

  const inline = (s: string) =>
    s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  for (const rawLine of trimmed.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (line.trim() === "") {
      flush();
    } else {
      para.push(line);
    }
  }
  flush();
  return out.join("");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    // Convert entity references to explicit markers so the agent sees who/what is referenced.
    // The label is escaped — a stored <script> or </Project Memory> becomes inert text.
    .replace(
      /<span[^>]*data-entity-id="(\d+)"[^>]*data-entity-type="([^"]*)"[^>]*>@([^<]*)<\/span>/gi,
      (_, id: string, type: string, label: string) =>
        `[${type === "character" ? "Character" : "Lore"}: ${escapeLlmText(label)} (ID: ${id})]`
    )
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Builds the tool set exposed to the agent for a specific project.
 * Propose-* tools only stage proposals — they never touch the manuscript.
 */
function buildBaseTools(ctx: ToolsContext): ToolSet {
  const { projectId, emit } = ctx;

  const assertSceneInProject = (sceneId: number): string => {
    const scene = db.getSceneById(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} does not exist.`);
    if (scene.projectId !== projectId) {
      throw new Error(`Scene ${sceneId} does not belong to the current project.`);
    }
    return scene.title;
  };

  const latestContent = (sceneId: number): string => {
    const versions = db.getSceneVersions(sceneId);
    return versions.length > 0 ? versions[versions.length - 1].content : "";
  };

  const stageProposal = (
    kind: "draft" | "precise_edit",
    sceneId: number,
    content: string,
    originalContent: string,
    findString: string | null,
    replaceString: string | null,
    summary: string | null
  ): { proposalId: number; summary: string | null } => {
    const db = getDb();
    if (!db) throw new Error("Database not available.");
    const result = db
      .insert(agentProposals)
      .values({
        projectId,
        sceneId,
        kind,
        content,
        originalContent,
        findString,
        replaceString,
        summary,
        status: "pending",
      })
      .run();
    const proposalId = result.lastInsertRowid as number;
    const proposal = getProposal(proposalId);
    if (proposal) {
      emit({ type: "proposal", proposal: toProposalDto(proposal) });
    }
    return { proposalId, summary };
  };

  const tools = {
    list_scenes: tool({
      description:
        "List every scene in the current project with its title, status (draft/revised/final), word count, and last-updated time. Use this to get an overview before reading or editing.",
      inputSchema: z.object({}),
      execute: async () => {
        const scenes = db.getProjectScenes(projectId);
        return scenes.map((s) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          wordCount: s.wordCount,
          updatedAt: s.updatedAt,
        }));
      },
    }),

    read_scene: tool({
      description:
        "Read the full content of a scene's latest version. Returns both the raw HTML and a plain-text rendering. Use the HTML when planning precise edits.",
      inputSchema: z.object({ sceneId: z.number().int() }),
      execute: async ({ sceneId }) => {
        const title = assertSceneInProject(sceneId);
        const html = latestContent(sceneId);
        if (!html) {
          return { found: false, sceneId, title: escapeLlmText(title), error: "This scene has no saved content yet." };
        }
        return {
          found: true,
          sceneId,
          title: escapeLlmText(title),
          html: fenceLlmContent(html.replace(/<\/scene>/gi, "&lt;/scene&gt;")),
          text: fenceLlmContent(stripHtml(html)),
          wordCount: html.split(/\s+/).filter(Boolean).length,
        };
      },
    }),

    get_actor_info: tool({
      description:
        "Get the full profile of an actor in this project: type, description, notes, stable attributes, current state, goals (survival/functional/social/emotional/long-term/narrative), drives, beliefs, knowledge, capabilities, constraints, resources, habits, and plans.",
      inputSchema: z.object({ actorId: z.number().int() }),
      execute: async ({ actorId }) => {
        const actor = db.getActorById(actorId);
        if (!actor) throw new Error(`Actor ${actorId} does not exist.`);
        if (actor.projectId !== projectId) {
          throw new Error(`Actor ${actorId} does not belong to the current project.`);
        }
        return {
          id: actor.id,
          name: escapeLlmText(actor.name),
          type: escapeLlmText(actor.type),
          description: escapeLlmText(actor.description ?? ""),
          notes: escapeLlmText(actor.notes ?? ""),
          attributes: actor.attributes,
          state: actor.state,
          goals: actor.goals,
          drives: actor.drives,
          beliefs: actor.beliefs,
          knowledge: actor.knowledge,
          capabilities: actor.capabilities,
          constraints: actor.constraints,
          resources: actor.resources,
          habits: actor.habits,
          plans: actor.plans,
        };
      },
    }),

    get_ccm_guidance: tool({
      description:
        `Use this to look up specific CCM framework guidance instead of assuming or guessing the rule. Prefer \`topic\` with a known section id (${CCM_SECTION_IDS.join(", ")}) when you know what you're looking for; use \`query\` only for vague/exploratory questions.`,
      inputSchema: z.object({
        topic: z.string().optional().describe("Exact CCM section id (see description for the valid list)"),
        query: z.string().min(1).optional().describe("Free-text CCM question for semantic retrieval"),
      }),
      execute: async ({ topic, query }) => {
        if (topic) {
          const section = getSectionById(topic);
          if (!section) {
            throw new Error(`Unknown CCM topic "${topic}". Valid section ids: ${CCM_SECTION_IDS.join(", ")}`);
          }
          return { sections: [section], matchType: "direct" as const };
        }
        if (query) {
          return { sections: await searchSections(query), matchType: "semantic" as const };
        }
        throw new Error("Provide either a CCM topic or a free-text query.");
      },
    }),

    propose_draft: tool({
      description:
        "Propose a full rewrite of a scene. Provide the complete new prose in `content` (plain paragraphs; headings with #). The proposal is staged and is NOT saved to the manuscript until the user accepts it.",
      inputSchema: z.object({
        sceneId: z.number().int(),
        content: z.string().min(1),
        summary: z.string().optional().describe("A one-line summary of what changed, e.g. 'Rewrite the opening paragraph'"),
      }),
      execute: async ({ sceneId, content, summary }) => {
        const title = assertSceneInProject(sceneId);
        const originalContent = latestContent(sceneId);
        const html = normalizeToHtml(content);
        const staged = stageProposal("draft", sceneId, html, originalContent, null, null, summary ?? null);
        return {
          proposalId: staged.proposalId,
          sceneId,
          sceneTitle: title,
          summary: staged.summary,
          wordCount: stripHtml(html).split(/\s+/).filter(Boolean).length,
          note: "Awaiting user acceptance. Do not claim this was saved.",
        };
      },
    }),

    propose_precise_edit: tool({
      description:
        "Propose a targeted find-and-replace edit on a scene's latest version. `findString` must match the raw HTML content exactly (use read_scene to inspect it). The edit is staged and is NOT saved until the user accepts it.",
      inputSchema: z.object({
        sceneId: z.number().int(),
        findString: z.string().min(1),
        replaceString: z.string(),
        summary: z.string().optional().describe("A one-line summary of the edit"),
      }),
      execute: async ({ sceneId, findString, replaceString, summary }) => {
        const title = assertSceneInProject(sceneId);
        const originalContent = latestContent(sceneId);
        if (!originalContent) {
          return { matched: false, sceneId, sceneTitle: title, error: "This scene has no saved content to edit." };
        }
        const index = originalContent.indexOf(findString);
        if (index === -1) {
          return {
            matched: false,
            sceneId,
            sceneTitle: title,
            error:
              "findString was not found in the scene's HTML content. Use read_scene to get the exact text (including markup) and try again, or use propose_draft instead.",
          };
        }
        const content =
          originalContent.slice(0, index) + replaceString + originalContent.slice(index + findString.length);
        const staged = stageProposal(
          "precise_edit",
          sceneId,
          content,
          originalContent,
          findString,
          replaceString,
          summary ?? null
        );
        return {
          matched: true,
          proposalId: staged.proposalId,
          sceneId,
          sceneTitle: title,
          summary: staged.summary,
          occurrences: countOccurrences(originalContent, findString),
          note: "Awaiting user acceptance. Do not claim this was saved.",
        };
      },
    }),

    delegate_task: tool({
      description:
        "Offload a self-contained research/brainstorming task to a background sub-agent with its own fresh context window. Use this for long fact-checks, continuity checks, brainstorming alternatives, or evaluating a hypothesis WITHOUT bloating the main conversation. Provide a self-contained task_description and an optional expected_output. The sub-agent returns a compressed, structured summary.",
      inputSchema: z.object({
        task_description: z.string().describe("A fully self-contained description of the task"),
        expected_output: z.string().optional().describe("Optional description of the expected output format"),
      }),
      execute: async ({ task_description, expected_output }) => {
        const id = `sub_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        emit({ type: "subtask_start", id, description: task_description.slice(0, 200) });
        try {
          const summary = await runSubAgent(task_description, expected_output);
          emit({ type: "subtask_end", id });
          return { summary, note: "This is the sub-agent's compressed summary. Integrate it into your response." };
        } catch (error) {
          emit({ type: "subtask_end", id });
          throw error;
        }
      },
    }),

    add_to_memory: tool({
      description:
        "Store a verified fact, writing rule, or hypothesis in the project's persistent memory. The memory is injected into every future chat's system prompt, so it persists across sessions. Use sparingly for durable, canonical information (character rules, world-building constraints, confirmed plot facts).",
      inputSchema: z.object({
        category: z.enum(["rule", "fact", "hypothesis"]),
        content: z.string().min(1).describe("The fact/rule/hypothesis to remember (1-3 sentences)"),
      }),
      execute: async ({ category, content }) => {
        const entry = addMemory({ projectId, category, content });
        return { memoryId: entry.id, category: entry.category, content: entry.content };
      },
    }),

    search_memory: tool({
      description:
        "Search the project's persistent memory for a fact, rule, or hypothesis matching a query. Use this to recall established details instead of guessing.",
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async ({ query }) => {
        const results = searchMemory(projectId, query);
        if (results.length === 0) {
          return { found: false, matches: [], note: "No memory entries matched. Consider add_to_memory if this is established." };
        }
        return {
          found: true,
          matches: results.map((r) => ({
            memoryId: r.id,
            category: r.category,
            content: r.content,
            createdAt: r.createdAt,
          })),
        };
      },
    }),

    suggest_research_thread: tool({
      description:
        "Suggest opening a separate Research Thread when the author is going down a tangent, exploring a hypothesis, or asking a side-question that would bloat the main conversation. The author decides whether to open it; you never open it yourself.",
      inputSchema: z.object({
        topic: z.string().min(1).describe("A short label for the tangent, e.g. 'Was the antagonist in chapter 3 actually lying?'"),
        reason: z.string().min(1).describe("One sentence explaining why this should be explored outside the main chat"),
      }),
      execute: async ({ topic, reason }) => {
        emit({ type: "suggest_research_thread", topic, reason });
        return {
          suggested: true,
          note: "The author has been shown your suggestion and will decide whether to open a research thread.",
        };
      },
    }),
  };

  if (ctx.mode === "research") {
    // Research threads are read-only: no proposals, no delegation, no thread suggestions.
    const { propose_draft: _p, propose_precise_edit: _e, delegate_task: _d, suggest_research_thread: _s, ...readOnly } = tools;
    return readOnly;
  }
  return tools;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}
/**
 * Project-management tools: direct operations on the manuscript structure
 * (scenes, characters, world notes, ideas, main-story assembly, project meta).
 * Prose edits still go through propose_draft / propose_precise_edit so the
 * author can review them, but everything structural is directly actionable.
 */
function buildManagementTools(ctx: ToolsContext): ToolSet {
  const { projectId } = ctx;

  const assertScene = (sceneId: number): string => {
    const scene = db.getSceneById(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} does not exist.`);
    if (scene.projectId !== projectId) throw new Error(`Scene ${sceneId} does not belong to the current project.`);
    return scene.title;
  };

  const assertActor = (actorId: number): string => {
    const actor = db.getActorById(actorId);
    if (!actor) throw new Error(`Actor ${actorId} does not exist.`);
    if (actor.projectId !== projectId) throw new Error(`Actor ${actorId} does not belong to the current project.`);
    return actor.name;
  };

  const assertEnvironment = (environmentId: number): string => {
    const env = db.getEnvironmentById(environmentId);
    if (!env) throw new Error(`Environment ${environmentId} does not exist.`);
    if (env.projectId !== projectId) throw new Error(`Environment ${environmentId} does not belong to the current project.`);
    return env.name;
  };

  const assertSystem = (systemId: number): string => {
    const system = db.getSystemById(systemId);
    if (!system) throw new Error(`System ${systemId} does not exist.`);
    if (system.projectId !== projectId) throw new Error(`System ${systemId} does not belong to the current project.`);
    return system.name;
  };

  const assertIdea = (ideaId: number) => {
    const dbInst = getDb();
    if (!dbInst) throw new Error("Database not available.");
    const idea = dbInst.select().from(ideas).where(eq(ideas.id, ideaId)).get();
    if (!idea) throw new Error(`Idea ${ideaId} does not exist.`);
    if (idea.projectId !== projectId) throw new Error(`Idea ${ideaId} does not belong to the current project.`);
    return idea;
  };

  const assertVersion = (versionId: number) => {
    const version = db.getVersionById(versionId);
    if (!version) throw new Error(`Version ${versionId} does not exist.`);
    const scene = db.getSceneById(version.sceneId);
    if (!scene || scene.projectId !== projectId) {
      throw new Error(`Version ${versionId} does not belong to the current project.`);
    }
    return version;
  };

  const latestVersionId = (sceneId: number): number | null => {
    const versions = db.getSceneVersions(sceneId);
    return versions.length > 0 ? versions[versions.length - 1].id : null;
  };

  const nextStoryOrder = (): number => {
    const story = db.getMainStory(projectId);
    return story.length === 0 ? 1 : Math.max(...story.map((s) => s.order)) + 1;
  };

  return {
    // ── Actors (CCM world model) ───────────────────────────────────────────
    list_actors: tool({
      description: "List every actor in the current project with their type, description, and stable attributes. Actors are the world model's characters. Use this before referencing or editing actors.",
      inputSchema: z.object({}),
      execute: async () => {
        return db.getProjectActors(projectId).map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          description: c.description?.slice(0, 200) ?? null,
          attributes: c.attributes,
        }));
      },
    }),

    create_actor: tool({
      description: "Create a new actor profile in the current project (the world model's character entity). `attributes` are stable traits (age, condition, abilities); `state` is the current world state (location, fatigue, emotions). All fields except name are optional.",
      inputSchema: z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        attributes: z.record(z.string(), z.any()).optional(),
        state: z.record(z.string(), z.any()).optional(),
        goals: z.record(z.string(), z.array(z.string())).optional(),
        drives: z.array(z.string()).optional(),
        beliefs: z.record(z.string(), z.array(z.string())).optional(),
        knowledge: z.array(z.string()).optional(),
        capabilities: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
        resources: z.record(z.string(), z.any()).optional(),
        habits: z.array(z.string()).optional(),
        plans: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        const created = db.createActor(projectId, input.name, input);
        return { id: created?.id, name: created?.name, note: "Actor created directly (not staged)." };
      },
    }),

    update_actor: tool({
      description: "Update an existing actor's profile. Only the fields you provide are changed. Keep stable traits in `attributes` and volatile state in `state`.",
      inputSchema: z.object({
        actorId: z.number().int(),
        name: z.string().optional(),
        type: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        attributes: z.record(z.string(), z.any()).optional(),
        state: z.record(z.string(), z.any()).optional(),
        goals: z.record(z.string(), z.array(z.string())).optional(),
        drives: z.array(z.string()).optional(),
        beliefs: z.record(z.string(), z.array(z.string())).optional(),
        knowledge: z.array(z.string()).optional(),
        capabilities: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
        resources: z.record(z.string(), z.any()).optional(),
        habits: z.array(z.string()).optional(),
        plans: z.array(z.string()).optional(),
      }),
      execute: async ({ actorId, ...data }) => {
        assertActor(actorId);
        const updated = db.updateActor(actorId, data as any);
        return { id: actorId, name: updated?.name, note: "Actor updated directly." };
      },
    }),

    delete_actor: tool({
      description: "Permanently delete an actor from the current project.",
      inputSchema: z.object({ actorId: z.number().int() }),
      execute: async ({ actorId }) => {
        const name = assertActor(actorId);
        db.deleteActor(actorId);
        return { success: true, deleted: name };
      },
    }),

    // ── Environments (world model) ─────────────────────────────────────────
    list_environments: tool({
      description: "List every environment in the current project (locations with their own state, resources, and active processes).",
      inputSchema: z.object({}),
      execute: async () => {
        return db.getProjectEnvironments(projectId).map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          state: e.state,
          activeProcesses: e.activeProcesses,
        }));
      },
    }),

    read_environment: tool({
      description: "Read the full definition of an environment in the current project.",
      inputSchema: z.object({ environmentId: z.number().int() }),
      execute: async ({ environmentId }) => {
        const title = assertEnvironment(environmentId);
        const env = db.getEnvironmentById(environmentId)!;
        return {
          id: env.id,
          name: title,
          type: env.type,
          attributes: env.attributes,
          state: env.state,
          resources: env.resources,
          inhabitants: env.inhabitants,
          accessibility: env.accessibility,
          activeProcesses: env.activeProcesses,
          constraints: env.constraints,
        };
      },
    }),

    create_environment: tool({
      description: "Create a new environment in the current project (a location with state, resources, inhabitants, accessibility, and active processes).",
      inputSchema: z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        attributes: z.record(z.string(), z.any()).optional(),
        state: z.record(z.string(), z.any()).optional(),
        resources: z.record(z.string(), z.any()).optional(),
        inhabitants: z.array(z.string()).optional(),
        accessibility: z.record(z.string(), z.any()).optional(),
        activeProcesses: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        const created = db.createEnvironment(projectId, input.name, input);
        return { id: created?.id, name: created?.name, note: "Environment created directly." };
      },
    }),

    update_environment: tool({
      description: "Update an environment's definition (state, resources, inhabitants, active processes, etc.).",
      inputSchema: z.object({
        environmentId: z.number().int(),
        name: z.string().optional(),
        type: z.string().optional(),
        attributes: z.record(z.string(), z.any()).optional(),
        state: z.record(z.string(), z.any()).optional(),
        resources: z.record(z.string(), z.any()).optional(),
        inhabitants: z.array(z.string()).optional(),
        accessibility: z.record(z.string(), z.any()).optional(),
        activeProcesses: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
      }),
      execute: async ({ environmentId, ...data }) => {
        assertEnvironment(environmentId);
        const updated = db.updateEnvironment(environmentId, data as any);
        return { id: environmentId, name: updated?.name, note: "Environment updated directly." };
      },
    }),

    delete_environment: tool({
      description: "Permanently delete an environment from the current project.",
      inputSchema: z.object({ environmentId: z.number().int() }),
      execute: async ({ environmentId }) => {
        const title = assertEnvironment(environmentId);
        db.deleteEnvironment(environmentId);
        return { success: true, deleted: title };
      },
    }),

    // ── Systems (world model) ──────────────────────────────────────────────
    list_systems: tool({
      description: "List every system in the current project (world mechanics: magic, weather, economy, biology, etc.).",
      inputSchema: z.object({}),
      execute: async () => {
        return db.getProjectSystems(projectId).map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          rules: s.rules,
        }));
      },
    }),

    read_system: tool({
      description: "Read the full definition of a system in the current project.",
      inputSchema: z.object({ systemId: z.number().int() }),
      execute: async ({ systemId }) => {
        const title = assertSystem(systemId);
        const system = db.getSystemById(systemId)!;
        return {
          id: system.id,
          name: title,
          type: system.type,
          rules: system.rules,
          constraints: system.constraints,
          activeConditions: system.activeConditions,
          effects: system.effects,
          exceptions: system.exceptions,
        };
      },
    }),

    create_system: tool({
      description: "Create a new system in the current project (a world mechanism with rules, constraints, active conditions, effects, and exceptions).",
      inputSchema: z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        rules: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
        activeConditions: z.array(z.string()).optional(),
        effects: z.array(z.string()).optional(),
        exceptions: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        const created = db.createSystem(projectId, input.name, input);
        return { id: created?.id, name: created?.name, note: "System created directly." };
      },
    }),

    update_system: tool({
      description: "Update a system's definition (rules, constraints, active conditions, effects, exceptions).",
      inputSchema: z.object({
        systemId: z.number().int(),
        name: z.string().optional(),
        type: z.string().optional(),
        rules: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
        activeConditions: z.array(z.string()).optional(),
        effects: z.array(z.string()).optional(),
        exceptions: z.array(z.string()).optional(),
      }),
      execute: async ({ systemId, ...data }) => {
        assertSystem(systemId);
        const updated = db.updateSystem(systemId, data as any);
        return { id: systemId, name: updated?.name, note: "System updated directly." };
      },
    }),

    delete_system: tool({
      description: "Permanently delete a system from the current project.",
      inputSchema: z.object({ systemId: z.number().int() }),
      execute: async ({ systemId }) => {
        const title = assertSystem(systemId);
        db.deleteSystem(systemId);
        return { success: true, deleted: title };
      },
    }),

    // ── Ideas ───────────────────────────────────────────────────────────────
    list_ideas: tool({
      description: "List ideas from the project's Idea Vault with their status and linked scene (if any). Ideas are a sandbox — they never affect the manuscript.",
      inputSchema: z.object({}),
      execute: async () => {
        const dbInst = getDb();
        if (!dbInst) return [];
        return dbInst
          .select()
          .from(ideas)
          .where(eq(ideas.projectId, projectId))
          .orderBy(desc(ideas.createdAt))
          .all()
          .map((i) => {
            const scene = i.linkedSceneId != null ? db.getSceneById(i.linkedSceneId) : undefined;
            return {
              id: i.id,
              title: i.title,
              status: i.status,
              linkedSceneId: i.linkedSceneId,
              linkedSceneTitle: scene?.title ?? null,
              snippet: i.content.slice(0, 200),
            };
          });
      },
    }),

    create_idea: tool({
      description: "Create a new idea in the project's Idea Vault. Optionally link it to a scene (unidirectional — scenes never show ideas back).",
      inputSchema: z.object({
        title: z.string().min(1),
        content: z.string().min(1),
        status: z.enum(["raw", "evaluating", "adopted", "discarded"]).optional(),
        linkedSceneId: z.number().int().nullable().optional(),
      }),
      execute: async ({ title, content, status, linkedSceneId }) => {
        if (linkedSceneId != null) assertScene(linkedSceneId);
        const dbInst = getDb();
        if (!dbInst) throw new Error("Database not available.");
        const result = dbInst
          .insert(ideas)
          .values({ projectId, title, content, status: status ?? "raw", linkedSceneId: linkedSceneId ?? null })
          .run();
        return { id: result.lastInsertRowid as number, title, note: "Idea created in the Idea Vault." };
      },
    }),

    update_idea: tool({
      description: "Update an idea in the Idea Vault (title, content, status, or the scene it links to).",
      inputSchema: z.object({
        ideaId: z.number().int(),
        title: z.string().optional(),
        content: z.string().optional(),
        status: z.enum(["raw", "evaluating", "adopted", "discarded"]).optional(),
        linkedSceneId: z.number().int().nullable().optional(),
      }),
      execute: async ({ ideaId, ...data }) => {
        const idea = assertIdea(ideaId);
        if (data.linkedSceneId != null) assertScene(data.linkedSceneId);
        const dbInst = getDb();
        if (!dbInst) throw new Error("Database not available.");
        dbInst
          .update(ideas)
          .set({
            title: data.title ?? idea.title,
            content: data.content ?? idea.content,
            status: data.status ?? idea.status,
            linkedSceneId: data.linkedSceneId === undefined ? idea.linkedSceneId : data.linkedSceneId,
            updatedAt: new Date(),
          })
          .where(eq(ideas.id, ideaId))
          .run();
        return { id: ideaId, title: data.title ?? idea.title, note: "Idea updated." };
      },
    }),

    delete_idea: tool({
      description: "Permanently delete an idea from the Idea Vault.",
      inputSchema: z.object({ ideaId: z.number().int() }),
      execute: async ({ ideaId }) => {
        const idea = assertIdea(ideaId);
        const dbInst = getDb();
        if (!dbInst) throw new Error("Database not available.");
        dbInst.delete(ideas).where(eq(ideas.id, ideaId)).run();
        return { success: true, deleted: idea.title };
      },
    }),

    // ── Scenes ──────────────────────────────────────────────────────────────
    create_scene: tool({
      description: "Create a new scene in the current project. You can then propose drafts for it or open it for writing.",
      inputSchema: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["draft", "revised", "final"]).optional(),
      }),
      execute: async ({ title, description, status }) => {
        const created = db.createScene(projectId, title, description, status);
        return { id: created?.id, title: created?.title, note: "Scene created directly." };
      },
    }),

    update_scene: tool({
      description: "Update a scene's title, description, or status (draft/revised/final).",
      inputSchema: z.object({
        sceneId: z.number().int(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        status: z.enum(["draft", "revised", "final"]).optional(),
      }),
      execute: async ({ sceneId, ...data }) => {
        assertScene(sceneId);
        const scene = db.getSceneById(sceneId)!;
        const description =
          data.description === undefined ? scene.description ?? undefined : data.description ?? undefined;
        db.updateScene(sceneId, data.title ?? scene.title, description, data.status ?? scene.status);
        return { id: sceneId, title: data.title ?? scene.title, note: "Scene updated directly." };
      },
    }),

    delete_scene: tool({
      description: "Permanently delete a scene, all its versions, and remove it from the main story. Use with care.",
      inputSchema: z.object({ sceneId: z.number().int() }),
      execute: async ({ sceneId }) => {
        const title = assertScene(sceneId);
        db.deleteScene(sceneId); // cascades versions + main-story entries
        return { success: true, deleted: title, note: "Scene and its versions deleted." };
      },
    }),

    // ── Versions ────────────────────────────────────────────────────────────
    list_scene_versions: tool({
      description: "List the saved versions of a scene (draft/revised/final) with their timestamps and word counts.",
      inputSchema: z.object({ sceneId: z.number().int() }),
      execute: async ({ sceneId }) => {
        assertScene(sceneId);
        return db.getSceneVersions(sceneId).map((v) => ({
          id: v.id,
          label: v.versionLabel,
          createdAt: v.createdAt,
          wordCount: v.content.split(/\s+/).filter(Boolean).length,
        }));
      },
    }),

    read_scene_version: tool({
      description: "Read the exact content of a specific scene version (not just the latest).",
      inputSchema: z.object({ versionId: z.number().int() }),
      execute: async ({ versionId }) => {
        const version = assertVersion(versionId);
        return { versionId, label: version.versionLabel, content: fenceLlmContent((version.content ?? "").replace(/<\/scene>/gi, "&lt;/scene&gt;")) };
      },
    }),

    // ── Main story assembly ─────────────────────────────────────────────────
    get_main_story: tool({
      description: "Get the current manuscript assembly: the ordered list of scenes in the Main Story, each with its chosen version.",
      inputSchema: z.object({}),
      execute: async () => {
        return db.getMainStory(projectId).map((entry) => {
          const scene = db.getSceneById(entry.sceneId);
          const version = db.getVersionById(entry.versionId);
          return {
            mainStorySceneId: entry.id,
            sceneId: entry.sceneId,
            sceneTitle: scene?.title ?? `Scene #${entry.sceneId}`,
            versionId: entry.versionId,
            versionLabel: version?.versionLabel ?? "unknown",
            order: entry.order,
          };
        });
      },
    }),

    add_scene_to_main_story: tool({
      description: "Add a scene to the Main Story (the manuscript assembly). If versionId is omitted, the latest version is used. The scene is appended to the end unless you specify order.",
      inputSchema: z.object({
        sceneId: z.number().int(),
        versionId: z.number().int().optional(),
        order: z.number().int().optional(),
      }),
      execute: async ({ sceneId, versionId, order }) => {
        assertScene(sceneId);
        const vid = versionId ?? latestVersionId(sceneId);
        if (!vid) return { error: "This scene has no saved versions yet. Create a draft first." };
        assertVersion(vid);
        const finalOrder = order ?? nextStoryOrder();
        db.addSceneToMainStory(projectId, sceneId, vid, finalOrder);
        return { success: true, sceneId, versionId: vid, order: finalOrder, note: "Added to the Main Story." };
      },
    }),

    remove_scene_from_main_story: tool({
      description: "Remove a scene from the Main Story assembly (the scene itself and its versions are kept).",
      inputSchema: z.object({ mainStorySceneId: z.number().int() }),
      execute: async ({ mainStorySceneId }) => {
        db.removeSceneFromMainStory(mainStorySceneId);
        return { success: true, note: "Removed from the Main Story." };
      },
    }),

    reorder_main_story: tool({
      description: "Reorder a scene inside the Main Story by setting its position (order starts at 1).",
      inputSchema: z.object({ mainStorySceneId: z.number().int(), order: z.number().int().min(1) }),
      execute: async ({ mainStorySceneId, order }) => {
        const entry = db.getMainStory(projectId).find((e) => e.id === mainStorySceneId);
        if (!entry) throw new Error(`Main story entry ${mainStorySceneId} not found in the current project.`);
        db.updateMainStoryScene(mainStorySceneId, entry.versionId, order);
        return { success: true, sceneId: entry.sceneId, order, note: "Main Story order updated." };
      },
    }),

    // ── Project ─────────────────────────────────────────────────────────────
    update_project: tool({
      description: "Update the current project's title or description.",
      inputSchema: z.object({
        title: z.string().optional(),
        description: z.string().nullable().optional(),
      }),
      execute: async ({ title, description }) => {
        const project = db.getProjectById(projectId)!;
        const desc = description === undefined ? project.description ?? undefined : description ?? undefined;
        db.updateProject(projectId, title ?? project.title, desc);
        return { success: true, title: title ?? project.title, note: "Project updated directly." };
      },
    }),
  };
}

/**
 * Resolve a simulation to run proposals against: the project's first
 * simulation, creating a default one if none exists yet.
 */
function resolveSimulationId(projectId: number): number {
  const existing = listSimulations(projectId);
  if (existing.length > 0) return existing[0].id;
  const created = createSimulation(projectId, "Default Run", "Auto-created for LLM proposals");
  return created!.id;
}

/**
 * Mode-1 (baked-in) engine tools: the LLM proposes structured state changes
 * and the engine's 6-layer validation engine decides. Also `render_skeleton`
 * (Mode-2 renderer — skeleton → prose → staged proposal), which is available
 * in both modes.
 */
function buildEngineTools(ctx: ToolsContext): ToolSet {
  const { projectId } = ctx;

  return {
    render_skeleton: tool({
      description:
        "Render a CCE scene skeleton into prose using the LLM. The skeleton is the engine's neutral structure (beats, entry/exit state, participants); you supply prose for it. The result is staged as a proposal the user accepts in the Agent panel — nothing is saved until then. Returns the proposal id.",
      inputSchema: z.object({
        skeletonId: z.number().int().describe("ID of the scene skeleton (from list_skeletons)"),
        sceneTitle: z.string().optional().describe("Optional title for the rendered scene"),
      }),
      execute: async ({ skeletonId, sceneTitle }) => {
        // Ownership check happens inside renderSkeletonToProposal via project lookup.
        const result = await renderSkeletonToProposal(skeletonId, getDbProjectOwner(projectId), { sceneTitle });
        ctx.emit({ type: "proposal", proposal: toProposalDto(getProposal(result.proposalId)!) });
        return result;
      },
    }),

    propose_actor_change: tool({
      description:
        `${CCM_PROPOSAL_REMINDER} Propose structured state changes to an actor. The engine's validation layers (non-contradiction, system/actor/knowledge legality, state compatibility, consequence validity) must approve before anything is applied. \`changes\` target the actor with { target: 'self', field: 'state.<name>' | 'attributes.<name>' | 'drives' | 'habits', op: 'set'|'increment'|'append'|'remove', value }. Returns accepted: true/false with the rejecting layer + reason when refused.`,
      inputSchema: z.object({
        actorId: z.number().int(),
        summary: z.string().describe("One-line human-readable description of the change"),
        changes: z.array(z.object({
          target: z.string().default("self"),
          field: z.string(),
          op: z.enum(["set", "increment", "append", "remove"]),
          value: z.any().optional(),
        })),
      }),
      execute: async ({ actorId, summary, changes }) => {
        return proposeActorChange(projectId, resolveSimulationId(projectId), actorId, summary, changes);
      },
    }),

    propose_environment_change: tool({
      description:
        `${CCM_PROPOSAL_REMINDER} Propose structured state changes to an environment (state, resources, activeProcesses, inhabitants, constraints). The engine's validation layers must approve before anything is applied.`,
      inputSchema: z.object({
        environmentId: z.number().int(),
        summary: z.string(),
        changes: z.array(z.object({
          target: z.string().default("self"),
          field: z.string(),
          op: z.enum(["set", "increment", "append", "remove"]),
          value: z.any().optional(),
        })),
      }),
      execute: async ({ environmentId, summary, changes }) => {
        return proposeEnvironmentChange(projectId, resolveSimulationId(projectId), environmentId, summary, changes);
      },
    }),

    propose_system_change: tool({
      description:
        `${CCM_PROPOSAL_REMINDER} Propose structured state changes to a system (world mechanism: rules, constraints, activeConditions, effects, exceptions). Validated by the engine before applying.`,
      inputSchema: z.object({
        systemId: z.number().int(),
        summary: z.string(),
        changes: z.array(z.object({
          target: z.string().default("self"),
          field: z.string(),
          op: z.enum(["set", "increment", "append", "remove"]),
          value: z.any().optional(),
        })),
      }),
      execute: async ({ systemId, summary, changes }) => {
        return proposeSystemChange(projectId, resolveSimulationId(projectId), systemId, summary, changes);
      },
    }),

    propose_relationship_change: tool({
      description:
        `${CCM_PROPOSAL_REMINDER} Propose creating or updating the relationship between two actors (qualitative state: trust, affection, familiarity, resentment, dependence, fear, obligation, respect, knowledge). The relationship becomes a first-class object the engine can later modify.`,
      inputSchema: z.object({
        actorAId: z.number().int(),
        actorBId: z.number().int(),
        summary: z.string(),
        familiarity: z.string().optional(),
        trust: z.string().optional(),
        affection: z.string().optional(),
        resentment: z.string().optional(),
        dependence: z.string().optional(),
        fear: z.string().optional(),
        obligation: z.string().optional(),
        respect: z.string().optional(),
        knowledge: z.string().optional(),
      }),
      execute: async ({ actorAId, actorBId, summary, ...data }) => {
        return proposeRelationshipChange(projectId, resolveSimulationId(projectId), actorAId, actorBId, summary, data);
      },
    }),
  };
}

/** Resolve the owning user id of a project (for render_skeleton ownership). */
function getDbProjectOwner(projectId: number): number {
  const project = db.getProjectById(projectId);
  if (!project) throw new Error(`Project #${projectId} not found`);
  return project.userId;
}

/**
 * Read-only semantic tools (CPU NLI helper). Advisory-only: they never gate,
 * block, or alter any engine decision — they produce suggestions/scores that
 * get surfaced alongside existing output. Available in BOTH agent modes.
 */
function buildSemanticTools(): ToolSet {
  return {
    check_semantic_consistency: tool({
      description:
        "Advisory-only. Checks whether two pieces of free text contradict each other, entail one another, or are neutral, using a local CPU NLI model (Xenova/nli-deberta-v3-small). Returns { label: 'contradiction'|'entailment'|'neutral', score }. This NEVER blocks or alters any engine decision — it is informational, to help you catch prose/state contradictions before proposing.",
      inputSchema: z.object({
        textA: z.string().describe("First text (e.g. current state/attribute text)"),
        textB: z.string().describe("Second text (e.g. proposed new text)"),
      }),
      execute: async ({ textA, textB }) => {
        try {
          return await checkContradiction(textA, textB);
        } catch (error) {
          return {
            error: `Semantic model unavailable: ${error instanceof Error ? error.message : String(error)}`,
            label: "neutral",
            score: 0,
          };
        }
      },
    }),

    suggest_tags: tool({
      description:
        "Advisory-only. Suggests tags for a piece of text using zero-shot classification against a vocabulary you supply. Returns [{ tag, score }] sorted descending by score (no internal cutoff — you decide a threshold). Informational only; never affects engine state.",
      inputSchema: z.object({
        text: z.string(),
        vocabulary: z.array(z.string()).min(1).describe("Candidate labels to score the text against"),
      }),
      execute: async ({ text, vocabulary }) => {
        try {
          return await suggestTags(text, vocabulary);
        } catch (error) {
          return {
            error: `Semantic model unavailable: ${error instanceof Error ? error.message : String(error)}`,
            tags: [],
          };
        }
      },
    }),
  };
}

/**
 * Builds the tool set exposed to the agent for a specific project.
 *
 * Mode 2 (observer, default): the LLM is layered ON TOP of the engine. It can
 * read everything (world model, events, memory, scenes), stage prose drafts
 * (propose_draft / propose_precise_edit / render_skeleton — all user-approved),
 * delegate research, and search memory. It has NO write tools: canon — actors,
 * environments, systems, rules, memory entries — is untouchable by the model.
 *
 * Mode 1 (baked_in): observer + direct management tools + `propose_*` engine
 * tools whose state changes are validated by the engine's 6-layer validation
 * engine before being applied. The LLM is inside the loop, but the firewall
 * still holds.
 *
 * - research: read-only subset (scenes, actors, world model, ideas, memory).
 * - ideation: no tools (pure sounding-board chat).
 */
export function buildAgentTools(ctx: ToolsContext): ToolSet {
  if (ctx.mode === "ideation") return {};

  const base = buildBaseTools(ctx);
  const management = buildManagementTools(ctx);
  const engine = buildEngineTools(ctx);
  const semantic = buildSemanticTools();

  // Read-only tool selection shared by research mode and observer mode.
  const readTools = {
    list_scenes: base.list_scenes,
    read_scene: base.read_scene,
    get_actor_info: base.get_actor_info,
    search_memory: base.search_memory,
    list_actors: management.list_actors,
    list_environments: management.list_environments,
    read_environment: management.read_environment,
    list_systems: management.list_systems,
    read_system: management.read_system,
    list_ideas: management.list_ideas,
    get_main_story: management.get_main_story,
    list_scene_versions: management.list_scene_versions,
    read_scene_version: management.read_scene_version,
    get_ccm_guidance: base.get_ccm_guidance,
  };

  if (ctx.mode === "research") {
    return readTools;
  }

  // Staged-prose tools (user-approved — allowed in both modes).
  const proseTools = {
    propose_draft: base.propose_draft,
    propose_precise_edit: base.propose_precise_edit,
    render_skeleton: engine.render_skeleton,
  };

  // Delegation / collaboration tools (allowed in both modes).
  const collaborationTools = {
    delegate_task: base.delegate_task,
    suggest_research_thread: base.suggest_research_thread,
  };

  if (ctx.agentMode !== "baked_in") {
    // Mode 2 — observer: read + staged prose + collaboration + semantic advisory. No writes.
    return { ...readTools, ...proseTools, ...collaborationTools, ...semantic };
  }

  // Mode 1 — baked_in: everything, including direct writes and engine-validated proposals.
  return {
    ...readTools,
    ...proseTools,
    ...collaborationTools,
    ...semantic,
    add_to_memory: base.add_to_memory,
    ...management,
    ...engine,
  };
}
