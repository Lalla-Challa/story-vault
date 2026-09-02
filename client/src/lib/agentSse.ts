/**
 * Client-side consumer for the agent SSE stream (`POST /api/agent/run`).
 * Mirrors the server's AgentSseEvent shape (see server/agent/tools.ts).
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
  | { type: "done"; text: string }
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
  createdAt: string | Date;
};

export type AgentRunRequest = {
  projectId: number;
  prompt: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  sceneId?: number;
  sessionId?: number;
};

/** One persisted chat message (matches the session's messages JSON column). */
export type ChatMessageDto = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    summary?: string;
  }>;
  createdAt?: string;
};

/** Chat session as returned by the agent.chat router. */
export type ChatSessionDto = {
  id: number;
  projectId: number;
  parentId: number | null;
  parentMessageId: number | null;
  title: string;
  type: "main" | "research" | "ideation";
  status: "active" | "merged" | "discarded";
  messages: ChatMessageDto[];
  createdAt: string | Date;
  updatedAt: string | Date;
};

/** Normalizes a tRPC session row (messages stored as JSON → unknown) to the DTO. */
export function normalizeSession(session: Record<string, unknown> | null | undefined): ChatSessionDto | null {
  if (!session) return null;
  const raw = session as unknown as {
    id: number;
    projectId: number;
    parentId: number | null;
    parentMessageId: number | null;
    title: string;
    type?: "main" | "research";
    status?: "active" | "merged" | "discarded";
    messages: unknown;
    createdAt: string | Date;
    updatedAt: string | Date;
  };
  return {
    id: raw.id,
    projectId: raw.projectId,
    parentId: raw.parentId,
    parentMessageId: raw.parentMessageId,
    title: raw.title ?? "New chat",
    type: raw.type ?? "main",
    status: raw.status ?? "active",
    messages: Array.isArray(raw.messages)
      ? (raw.messages as ChatMessageDto[]).map((m) => ({
          role: m.role,
          content: m.content,
          toolCalls: m.toolCalls,
          createdAt: m.createdAt,
        }))
      : [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Streams an agent run over SSE. Returns the final assistant text.
 * `onEvent` is invoked for every parsed event as it arrives.
 */
export async function runAgentStream(
  request: AgentRunRequest,
  onEvent: (event: AgentSseEvent) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch("/api/agent/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    credentials: "include",
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error ?? `Agent request failed (${res.status})`);
  }
  if (!res.body) {
    throw new Error("Agent stream unavailable");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    try {
      const event = JSON.parse(payload) as AgentSseEvent;
      onEvent(event);
      if (event.type === "done") finalText = event.text;
    } catch {
      // ignore malformed events
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) handleLine(line);
    }
  }
  // flush remaining buffer
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) handleLine(line);
  }

  return finalText;
}