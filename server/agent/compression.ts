import { generateText } from "ai";
import { getAgentSettings } from "./settings";
import { buildModel } from "./provider";
import type { ChatMessage, CompressedContext } from "../../drizzle/schema";

const COMPRESSION_INSTRUCTIONS =
  "Below is a writing-assistant conversation. Summarize the EARLIER messages into a dense, context-rich paragraph that captures every established fact, decision, character detail, and plot point. The summary will be injected into a future assistant prompt in place of the original messages, so it MUST preserve all canonical information. Ignore pleasantries and meta-discussion. Do NOT include the later messages — only the early ones up to the specified cutoff.";

/**
 * Compresses the earliest messages in a conversation into a short summary,
 * returning a `CompressedContext` object. The summary is meant to be injected
 * in place of the original messages to keep the prompt within the model's
 * context window.
 *
 * @param messages - Full conversation history (the stored session messages).
 * @param upToIndex - Index of the last message to include in the summary.
 * @param priorSummary - Optional summary of an earlier region (from a previous
 *   compression). It is fed to the LLM as already-established context so a
 *   re-compression does not forget prior conclusions.
 * @returns A compressed context object, or null if the messages slice is empty.
 */
export async function compressMessages(
  messages: ChatMessage[],
  upToIndex: number,
  priorSummary?: string
): Promise<CompressedContext | null> {
  const slice = messages.slice(0, upToIndex + 1);
  if (slice.length === 0) return null;

  const settings = getAgentSettings();
  if (!settings || !settings.apiKey || !settings.model) {
    // Without AI, return a simple concatenation as a fallback
    const fallback = slice
      .map((m) => `${m.role === "user" ? "Author" : "Assistant"}: ${m.content.slice(0, 200)}`)
      .join("\n");
    return {
      summary: fallback.slice(0, 2000),
      summarizedUpTo: upToIndex,
      createdAt: new Date().toISOString(),
    };
  }

  const model = buildModel(settings);

  const priorBlock = priorSummary
    ? `\n\nEarlier context already summarized (preserve these conclusions):\n${priorSummary}\n`
    : "";

  const transcript = slice
    .map(
      (m) =>
        `${m.role === "user" ? "Author" : "Assistant"}: ${m.content}`
    )
    .join("\n\n");

  try {
    const { text } = await generateText({
      model,
      system:
        "You are a conversation summarizer. You condense early parts of a long writing-assistant conversation into a dense, faithful summary.",
      prompt: `${COMPRESSION_INSTRUCTIONS}${priorBlock}\n\n--- Messages to summarize (up to index ${upToIndex}) ---\n${transcript}`,
    });

    return {
      summary: (text ?? "").trim().slice(0, 8000) || `[Compressed ${slice.length} earlier messages]`,
      summarizedUpTo: upToIndex,
      createdAt: new Date().toISOString(),
    };
  } catch {
    // If the LLM call fails, produce a weak fallback rather than crashing
    const fallback = `[Compressed ${slice.length} earlier messages: ${slice
      .map((m) => m.content.slice(0, 100))
      .join(" | ")}]`;
    return {
      summary: fallback.slice(0, 2000),
      summarizedUpTo: upToIndex,
      createdAt: new Date().toISOString(),
    };
  }
}

/**
 * Applies the compressed context to the conversation history, returning the
 * final message array to send to the model.
 *
 * - If a compressedContext exists, the summary is injected as a synthetic
 *   system message at the front, and only messages AFTER the cutoff are
 *   included verbatim.
 * - If no compressedContext exists, the full messages array is returned.
 */
export function applyCompressedContext(
  messages: ChatMessage[],
  compressedContext: CompressedContext | null
): ChatMessage[] {
  if (!compressedContext || compressedContext.summarizedUpTo < 0) {
    return messages;
  }
  const cutoff = compressedContext.summarizedUpTo;
  const recent = messages.slice(cutoff + 1);
  const summaryEntry: ChatMessage = {
    role: "assistant",
    content: `[Compressed summary of earlier conversation]\n${compressedContext.summary}`,
    createdAt: compressedContext.createdAt,
  };
  return [summaryEntry, ...recent];
}