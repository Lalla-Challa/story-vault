import { generateText } from "ai";
import { getAgentSettings } from "../../agent/settings";
import { buildModel } from "../../agent/provider";
import { getSkeletonById } from "./simulation.data";
import { getProjectById } from "../projects/project.data";
import { createScene } from "../scenes/scenes.data";
import { getRawDb, getDb } from "../../db";
import { agentProposals } from "../../../drizzle/schema";

/**
 * Mode-2 skeleton renderer (CCE → manuscript bridge).
 *
 * The CCE produces neutral scene skeletons; the LLM renders prose from them.
 * This is a read-only renderer: it takes the skeleton's structure (beats,
 * entry/exit state, participants, active pressures, turning point), asks the
 * LLM for prose, and stages it as an `agent_proposals` draft for a NEW scene.
 * The user accepts/rejects in the Agent tab — the engine's causality is never
 * touched, and no prose lands in the manuscript without user approval.
 */

const RENDER_INSTRUCTIONS = `You are a novelist rendering a scene from a neutral dramatic skeleton produced by a story engine. The skeleton is the canonical truth: location, participants, entry state, beats, turning point, exit state. Write vivid, restrained prose that honors the skeleton — do not invent new plot events, new characters, or contradict the state. Use plain paragraphs. Use # for section breaks if useful. Bold and italic are allowed.`;

export async function renderSkeletonToProposal(
  skeletonId: number,
  userId: number,
  opts?: { sceneTitle?: string }
): Promise<{ proposalId: number; sceneId: number; sceneTitle: string; summary: string }> {
  const skeleton = getSkeletonById(skeletonId);
  if (!skeleton) throw new Error(`Skeleton #${skeletonId} not found`);
  const project = getProjectById(getProjectOfSimulation(skeleton.simulationId));
  if (!project) throw new Error("Project not found");
  if (project.userId !== userId) throw new Error("Access denied");

  const settings = getAgentSettings();
  if (!settings || !settings.apiKey || !settings.model) {
    throw new Error("AI is not configured — add an API key and model in Agent Settings first.");
  }
  const model = buildModel(settings);

  const sceneTitle = opts?.sceneTitle ?? skeleton.title ?? "Rendered Scene";
  const prompt = buildSkeletonPrompt(skeleton, sceneTitle);

  const { text } = await generateText({
    model,
    system: RENDER_INSTRUCTIONS,
    prompt,
  });

  const prose = (text ?? "").trim();
  if (!prose) throw new Error("The model returned empty prose.");

  // Normalize plain paragraphs into HTML (same convention as the agent's
  // propose_draft flow): blank-line-separated blocks become <p> tags.
  const html = normalizeToHtml(prose);

  // Stage as a draft proposal for a NEW scene (the skeleton becomes a scene
  // only when the user accepts the render).
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const scene = createScene(project.id, sceneTitle, `Rendered from CCE skeleton #${skeleton.id}`);
  const result = db
    .insert(agentProposals)
    .values({
      projectId: project.id,
      sceneId: scene!.id,
      kind: "draft",
      content: html,
      originalContent: "",
      summary: `Render of CCE skeleton "${sceneTitle}"`,
      status: "pending",
    })
    .run();
  const proposalId = result.lastInsertRowid as number;

  return {
    proposalId,
    sceneId: scene!.id,
    sceneTitle,
    summary: `Scene "${sceneTitle}" drafted from skeleton — accept it in the Agent tab.`,
  };
}

function getProjectOfSimulation(simulationId: number): number {
  const raw = getRawDb();
  if (!raw) throw new Error("Database not available");
  const row = raw
    .prepare("SELECT projectId FROM ccm_simulations WHERE id = ?")
    .get(simulationId) as { projectId: number } | undefined;
  if (!row) throw new Error("Simulation not found");
  return row.projectId;
}

function buildSkeletonPrompt(skeleton: any, sceneTitle: string): string {
  const beats = (skeleton.beats ?? []) as string[];
  const participants = (skeleton.participants ?? []) as string[];
  const entry = skeleton.entryState ?? {};
  const exit = skeleton.exitState ?? {};
  const pressures = skeleton.activePressures ?? {};
  const threads = (skeleton.unresolvedThreads ?? []) as string[];
  const important = (skeleton.importantInformation ?? []) as string[];
  const notes = (skeleton.continuityNotes ?? []) as string[];

  return `## Scene skeleton: ${sceneTitle}
${skeleton.purpose ? `Purpose: ${skeleton.purpose}\n` : ""}
Location: ${skeleton.location ?? "unspecified"}
Time: ${JSON.stringify(skeleton.time ?? {})}
Participants: ${participants.join(", ") || "none"}

## Entry state
${JSON.stringify(entry, null, 2)}

## Beats (in order)
${beats.map((b, i) => `${i + 1}. ${b}`).join("\n") || "(none)"}

${skeleton.turningPoint ? `Turning point: ${skeleton.turningPoint}\n` : ""}

## Active pressures
${JSON.stringify(pressures, null, 2)}

## Exit state
${JSON.stringify(exit, null, 2)}

${threads.length ? `## Unresolved threads\n${threads.map((t) => `- ${t}`).join("\n")}\n` : ""}
${important.length ? `## Important information\n${important.map((i) => `- ${i}`).join("\n")}\n` : ""}
${notes.length ? `## Continuity notes\n${notes.map((n) => `- ${n}`).join("\n")}\n` : ""}

Write the scene prose now.`;
}

/** Convert blank-line-separated paragraphs to <p> HTML (matches agent convention). */
function normalizeToHtml(text: string): string {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return `<p>${text}</p>`;
  return paragraphs.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("\n");
}