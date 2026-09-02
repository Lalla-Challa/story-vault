import { generateText } from "ai";
import { getAgentSettings } from "./settings";
import { buildModel } from "./provider";

const BRIEF_INSTRUCTIONS = `The following are pinned "core concepts" a writer selected while brainstorming. Compile them into a concise, cohesive Project Brief — a short directive a writing assistant can treat as canonical guidance.

- Preserve every idea; clean up the language, remove repetition, and organize them.
- Keep it dense and directive (bullet points are fine).
- Output plain text only.`;

/**
 * Turns the pinned core concepts into a cohesive "Project Brief".
 * Uses a fresh LLM context when AI is configured; otherwise falls back to a
 * plain bulleted join so the workflow never blocks on the LLM.
 */
export async function compileProjectBrief(pins: string[]): Promise<string> {
  const fallback = pins.map((p) => `- ${p}`).join("\n");

  try {
    const settings = getAgentSettings();
    if (!settings || !settings.apiKey || !settings.model) return fallback;

    const model = buildModel(settings);
    const { text } = await generateText({
      model,
      system: "You are a story development assistant who turns brainstorming notes into clear directives.",
      prompt: `${BRIEF_INSTRUCTIONS}\n\nPinned concepts:\n${pins
        .map((p, i) => `${i + 1}. ${p}`)
        .join("\n")}`,
    });

    return (text ?? "").trim() || fallback;
  } catch {
    return fallback; // never block initialization on an LLM failure
  }
}