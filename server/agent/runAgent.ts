import { streamText, stepCountIs, type ToolSet } from "ai";
import { buildModel } from "./provider";
import { getAgentSettings } from "./settings";
import { buildAgentTools, type AgentSseEvent } from "./tools";
import { SYSTEM_PROMPT, IDEATION_SYSTEM_PROMPT } from "./systemPrompt";
import { formatMemoryBlock } from "./projectMemory";
import { getSession, updateSessionCompressedContext } from "./chatSessions";
import { compressMessages, applyCompressedContext } from "./compression";
import {
  resolveContextWindow,
  computeBudget,
  estimateTokens,
} from "./contextBudget";
import { escapeLlmText } from "../entities";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import type { ChatMessage, CompressedContext } from "../../drizzle/schema";

export type AgentRunRequest = {
  projectId: number;
  prompt: string;
  /** Prior conversation turns (role/content pairs) to continue from. */
  messages?: { role: "user" | "assistant"; content: string }[];
  /** Optional scene focus hint (not required — tools read scenes by id). */
  sceneId?: number;
  /** Optional chat session id — history is loaded from the session. */
  sessionId?: number;
};

export type AgentSseEmitter = (event: AgentSseEvent) => void;

const MAX_STEPS = 8;

/**
 * Number of most-recent messages kept verbatim when the conversation is
 * compressed. Everything older is folded into the compressed summary.
 */
const VERBATIM_TAIL = 14;

/**
 * Rough token cost of the serialized tool definitions + per-call overhead
 * that the SDK interleaves with the prompt. Safe over-estimate; keeps the
 * request comfortably under the window.
 */
const TOOL_DEF_TOKENS = 6000;

/** Human-readable one-liner for a tool result (keeps SSE payloads small). */
function summarizeToolResult(name: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  if (typeof r?.proposalId === "number") {
    return `Proposal #${r.proposalId} staged${r.summary ? ` — ${String(r.summary)}` : ""}`;
  }
  if (typeof r?.accepted === "boolean") {
    if (r.accepted) {
      return `Accepted — ${Array.isArray(r.applied) ? r.applied.length : 0} change(s) applied`;
    }
    const layer = typeof r.rejectedLayer === "number" ? ` (Layer ${r.rejectedLayer})` : "";
    const reason = r.reason ? `: ${String(r.reason)}` : "";
    const guidanceTitle = r.guidance
      ? ` — ${String((r.guidance as { title?: string }).title ?? "")}`
      : "";
    return `Rejected${layer}${reason}${guidanceTitle}`;
  }
  if (r?.matched === false) {
    return `No match: ${String(r.error ?? "could not find the target text")}`;
  }
  if (name === "check_semantic_consistency") {
    return `NLI: ${String(r?.label ?? "?")} (${String(r?.score ?? "?")})`;
  }
  if (name === "get_ccm_guidance") {
    const sections = Array.isArray(r?.sections) ? r.sections : [];
    const match = r?.matchType === "direct" ? "direct" : "semantic";
    const label =
      sections.length === 0
        ? "(no sections)"
        : String((sections[0] as { title?: string })?.title ?? sections.length);
    return `CCM guidance: "${label}" (${match}, ${sections.length} section(s))`;
  }
  if (name === "search_memory") {
    return r?.found === true
      ? `Memory: ${Array.isArray(r?.matches) ? r.matches.length : 0} match(es)`
      : "No memory matches";
  }
  if (name === "suggest_tags") {
    return `Tags: ${Array.isArray(r?.tags) ? r.tags.length : 0} suggested`;
  }
  const LIST_LABELS: Record<string, string> = {
    list_scenes: "scene(s)",
    list_actors: "actor(s)",
    list_environments: "environment(s)",
    list_systems: "system(s)",
    list_ideas: "idea(s)",
    list_scene_versions: "version(s)",
    get_main_story: "main story entry/entries",
  };
  if (name in LIST_LABELS) {
    const arr = Array.isArray(result) ? result : [];
    return `Found ${arr.length} ${LIST_LABELS[name]}`;
  }
  if (name === "read_scene") {
    const found = r?.found === true;
    return found
      ? `Scene "${String(r.title ?? "")}" (${String(r.wordCount ?? "?")} words)`
      : `Scene not found or empty`;
  }
  if (name === "get_actor_info") {
    return `Actor "${String(r?.name ?? "")}"`;
  }
  if (name === "get_character_info") {
    return `Character "${String(r?.name ?? "")}"`;
  }
  if (name === "read_environment") {
    return `Environment "${String(r?.name ?? "")}"`;
  }
  if (name === "read_system") {
    return `System "${String(r?.name ?? "")}"`;
  }
  if (name === "read_scene_version") {
    return `Version "${String(r?.label ?? "")}"`;
  }
  return "done";
}

/** Estimated tokens for one chat message, including its tool calls. */
export function estimateMessageTokens(m: ChatMessage): number {
  let total = 3; // role marker + separators
  total += estimateTokens(m.content);
  if (m.toolCalls) {
    for (const tc of m.toolCalls) {
      total += estimateTokens(tc.name);
      total += estimateTokens(JSON.stringify(tc.args ?? {}));
      if (tc.summary) total += estimateTokens(tc.summary);
    }
  }
  return total;
}

export function estimateMessages(msgs: ChatMessage[]): number {
  return msgs.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

/**
 * Trims the conversation to the newest messages that fit within `budget`.
 *
 * Priority: the compressed summary (the only representation of the early
 * conversation) is always retained at the front, the newest message (the
 * user's prompt) is always retained at the end, and as many of the remaining
 * recent messages as fit are kept in between. When a summary is present its
 * tokens are reserved first and the tail is trimmed around it.
 */
export function trimConversation(
  messages: ChatMessage[],
  budget: number,
  hasSummary: boolean
): ChatMessage[] {
  // Reserve the summary (if any) and the user's prompt — both always kept.
  let reserved = 0;
  let firstIdx = 0;
  if (hasSummary && messages[0]) {
    reserved += estimateMessageTokens(messages[0]);
    firstIdx = 1;
  }

  const last = messages[messages.length - 1];
  if (last) reserved += estimateMessageTokens(last);

  // Walk newest → oldest, keeping as many of the remaining messages as fit.
  const tail: ChatMessage[] = [];
  if (last) tail.unshift(last);
  for (let i = messages.length - 2; i >= firstIdx; i--) {
    const m = messages[i];
    const c = estimateMessageTokens(m);
    if (reserved + c > budget) break;
    reserved += c;
    tail.unshift(m);
  }

  if (hasSummary && messages[0]) tail.unshift(messages[0]);
  return tail;
}

/**
 * Runs the agent loop for a single user prompt and streams events to the
 * provided emitter (SSE). The tool loop is driven by the AI SDK
 * (`stopWhen: stepCountIs(MAX_STEPS)`): model → tool calls → tool execution
 * → model → … until the model produces a final text response.
 *
 * Context is budgeted before the request is sent:
 *  1. the model's context window is resolved (heuristic or user override),
 *  2. memory is injected selectively (brief/directives always, the rest by
 *     relevance to the prompt, capped by budget),
 *  3. conversation history is kept as a sliding window — the oldest messages
 *     are LLM-compressed into a summary when the history would otherwise
 *     overflow the window.
 */
export async function runAgent(
  request: AgentRunRequest,
  userId: number,
  emit: AgentSseEmitter,
  options?: { signal?: AbortSignal }
): Promise<void> {
  // Validate project ownership
  const project = db.getProjectById(request.projectId);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  if (project.userId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

  const settings = getAgentSettings();
  if (!settings || !settings.apiKey || !settings.model) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "AI is not configured. Open Agent Settings and add your API key and model.",
    });
  }

  const model = buildModel(settings);

  // Resolve conversation history: prefer the persisted session when provided.
  let history: ChatMessage[] = [];
  let mode: "main" | "research" | "ideation" = "main";
  let agentMode: "observer" | "baked_in" = "observer";
  let threadParentHint = "";
  let compressedContext: CompressedContext | null = null;
  let sessionId = request.sessionId ?? null;

  // Per-project LLM integration mode: observer (read-only, default) or
  // baked_in (LLM proposals validated by the engine before applying).
  const agentModeSetting = db.getProjectSettingByKey(request.projectId, "agent_mode");
  agentMode = agentModeSetting?.settingValue === "baked_in" ? "baked_in" : "observer";

  if (request.sessionId) {
    const session = getSession(request.sessionId);
    if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Chat session not found" });
    if (session.projectId !== request.projectId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    }
    history = (session.messages as unknown as ChatMessage[]) ?? [];
    compressedContext = (session.compressedContext as unknown as CompressedContext | null) ?? null;
    if (session.type === "ideation") {
      mode = "ideation";
    } else if (session.type === "research") {
      mode = "research";
      threadParentHint =
        session.parentMessageId !== null
          ? `\nYou are working in an isolated Research Thread branched from the main project at message #${session.parentMessageId}. You can ONLY see the parent message and this thread's messages — the main chat's later messages are deliberately hidden.`
          : "";
    }
  } else {
    history = (request.messages ?? []).map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: new Date().toISOString(),
    }));
  }

  const tools = mode === "ideation" ? undefined : buildAgentTools({ projectId: request.projectId, emit, mode, agentMode });

  const sceneHint = request.sceneId
    ? `\nThe author is currently viewing scene #${request.sceneId}. Consider reading it first.`
    : "";

  const researchDirective =
    mode === "research"
      ? `\n\nYou are exploring a tangent branched from the main project. Fact-check, evaluate, and iterate freely. Context here is isolated: you see only the parent message and this thread's messages. Your conclusions will be synthesized and merged back into the main chat.` +
        threadParentHint
      : "";

  emit({ type: "start", projectId: request.projectId });

  const systemBase = mode === "ideation" ? IDEATION_SYSTEM_PROMPT : SYSTEM_PROMPT;
  // Fence untrusted project title so `"</Project Memory>\nSYSTEM: ignore..."` tricks fail.
  const safeProjectTitle = escapeLlmText(project.title);
  const systemText = `${systemBase}\n\nProject: "${safeProjectTitle}"${sceneHint}${researchDirective}`;
  const systemTokens = estimateTokens(systemText);
  const toolTokens = tools ? TOOL_DEF_TOKENS : 0;

  // ── Context budget ────────────────────────────────────────────────────────
  const contextWindow = resolveContextWindow(settings.model, settings.contextWindow);
  const budget = computeBudget(contextWindow);

  // Memory is injected selectively and capped to a slice of the remaining
  // budget so a bloated project_memory table can never overflow the window.
  const memoryMaxTokens = Math.max(0, Math.floor((budget.inputBudget - systemTokens - toolTokens) * 0.25));
  const memoryBlock = formatMemoryBlock(request.projectId, {
    prompt: request.prompt,
    maxTokens: memoryMaxTokens,
  });
  const memorySection = memoryBlock
    ? `\n\n${memoryBlock}\n\nTreat the entries above as canonical project knowledge. Prefer them over guessing.`
    : "";
  const memoryTokens = estimateTokens(memorySection);

  const conversationBudget = Math.max(
    1,
    budget.inputBudget - systemTokens - toolTokens - memoryTokens
  );

  // ── Conversation: sliding window + compression ────────────────────────────
  const newPromptMsg: ChatMessage = {
    role: "user",
    content: request.prompt,
    createdAt: new Date().toISOString(),
  };

  let messages: ChatMessage[];
  const fullWithSummary = applyCompressedContext(history, compressedContext);
  const allMessages = [...fullWithSummary, newPromptMsg];

  if (estimateMessages(allMessages) <= conversationBudget) {
    messages = allMessages;
  } else {
    // The full history does not fit. If we haven't compressed yet, fold the
    // oldest messages into an LLM summary (keeps the tail verbatim).
    if (!compressedContext && history.length > VERBATIM_TAIL + 2) {
      const upTo = history.length - VERBATIM_TAIL - 1;
      const compressed = await compressMessages(history, Math.max(0, upTo));
      if (compressed) {
        compressedContext = compressed;
        if (sessionId) updateSessionCompressedContext(sessionId, compressed);
        const rebuilt = applyCompressedContext(history, compressed);
        const rebuiltAll = [...rebuilt, newPromptMsg];
        if (estimateMessages(rebuiltAll) <= conversationBudget) {
          messages = rebuiltAll;
        } else {
          messages = trimConversation(rebuiltAll, conversationBudget, true);
        }
      } else {
        messages = trimConversation(allMessages, conversationBudget, Boolean(compressedContext));
      }
    } else {
      // Re-compress a wider region if the existing summary + tail still
      // overflow (the conversation kept growing past the previous cutoff).
      if (compressedContext && history.length > VERBATIM_TAIL + 2) {
        const upTo = history.length - VERBATIM_TAIL - 1;
        const compressed = await compressMessages(history, Math.max(0, upTo), compressedContext.summary);
        if (compressed) {
          compressedContext = compressed;
          if (sessionId) updateSessionCompressedContext(sessionId, compressed);
          const rebuilt = applyCompressedContext(history, compressed);
          const rebuiltAll = [...rebuilt, newPromptMsg];
          messages = trimConversation(rebuiltAll, conversationBudget, true);
        } else {
          messages = trimConversation(allMessages, conversationBudget, true);
        }
      } else {
        messages = trimConversation(allMessages, conversationBudget, Boolean(compressedContext));
      }
    }

    // Safety net: if even the trimmed conversation plus prompt is larger than
    // the window, fail loudly instead of silently truncating mid-sentence.
    if (estimateMessages(messages) > conversationBudget) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          `The conversation exceeds this model's context window (${contextWindow.toLocaleString()} tokens) ` +
          "even after compression. Start a new chat or switch to a model with a larger window.",
      });
    }
  }

  const result = streamText({
    model,
    system: `${systemText}\n\n${memorySection}`,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    abortSignal: options?.signal,
  });

  let fullText = "";
  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          fullText += part.text;
          emit({ type: "text", delta: part.text });
          break;
        }
        case "reasoning-delta": {
          emit({ type: "thought", text: part.text });
          break;
        }
        case "tool-call": {
          emit({
            type: "tool_call",
            name: part.toolName,
            args: part.input as Record<string, unknown>,
          });
          break;
        }
        case "tool-result": {
          emit({
            type: "tool_result",
            name: part.toolName,
            summary: summarizeToolResult(part.toolName, part.output),
          });
          break;
        }
        case "tool-error": {
          const err = (part as { error?: unknown }).error;
          const message =
            err instanceof Error
              ? err.message
              : typeof err === "string"
              ? err
              : ((err as { message?: string })?.message ?? "Tool execution failed");
          emit({ type: "tool_result", name: part.toolName, summary: `Error: ${message}` });
          break;
        }
        case "error": {
          const message =
            (part as { error?: unknown }).error instanceof Error
              ? ((part as { error?: Error }).error as Error).message
              : "The model returned an error.";
          emit({ type: "error", message });
          return;
        }
        default:
          break; // text-start/end, reasoning-start/end, tool-input-*, start/end, step events
      }
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The agent loop failed unexpectedly. Check your AI settings and try again.";
    emit({ type: "error", message });
    return;
  }

  // Token usage across all steps (awaiting consumes nothing extra — the
  // stream was already iterated to completion above).
  let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  try {
    const u = await result.totalUsage;
    usage = {
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      totalTokens: u.totalTokens,
    };
  } catch {
    usage = { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined };
  }

  emit({ type: "done", text: fullText, usage });
}