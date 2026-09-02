import { generateText } from "ai";
import { getAgentSettings } from "./settings";
import { buildModel } from "./provider";
import type { ChatMessage } from "../../drizzle/schema";

const SYNTHESIS_INSTRUCTIONS = `Read this research thread. Synthesize the final conclusions, verified facts, and any refined ideas into a concise, context-dense summary. Ignore the back-and-forth debate and failed tangents.`;

/**
 * Condenses a research thread's transcript into a single context-dense
 * summary using a fresh LLM context (the main chat's context is never
 * touched). Returns the summary text.
 */
export async function synthesizeThread(messages: ChatMessage[]): Promise<string> {
  const settings = getAgentSettings();
  if (!settings || !settings.apiKey || !settings.model) {
    throw new Error("AI is not configured — cannot synthesize the research thread.");
  }
  const model = buildModel(settings);

  const transcript = (messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "Author" : "Research agent"}: ${m.content}`)
    .join("\n\n");

  if (!transcript.trim()) {
    throw new Error("The research thread has no messages to synthesize.");
  }

  const { text } = await generateText({
    model,
    system:
      "You are a research synthesis assistant. You condense long, exploratory conversations into dense, faithful summaries that a writing assistant can paste directly into its context without losing the key conclusions.",
    prompt: `${SYNTHESIS_INSTRUCTIONS}\n\n--- Research thread transcript ---\n${transcript}`,
  });

  return (text ?? "").trim();
}