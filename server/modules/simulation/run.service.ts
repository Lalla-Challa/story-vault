import { loadWorld } from "../../ccm/loader";
import { runSimulation } from "../../ccm/simulator";
import { extractStory } from "../../ccm/extractor";
import { persistRun, resetSimulationHistory } from "../../ccm/persister";
import { getSimulationById } from "./simulation.data";

/**
 * The CCE run service — the single entry point the router calls.
 * Orchestrates: load world → simulate N ticks → extract story → persist in one
 * transaction. The engine itself stays pure; this is where DB meets engine.
 */
export function advanceSimulation(simulationId: number, ticks: number): {
  eventsGenerated: number;
  episodesCreated: number;
  skeletonsCreated: number;
  finalClock: { day: number; minute: number };
  summary: ReturnType<typeof runSimulation>["summary"];
} {
  const sim = getSimulationById(simulationId);
  if (!sim) throw new Error(`Simulation #${simulationId} not found`);

  const world = loadWorld(sim.projectId, simulationId);
  const run = runSimulation(world, ticks);
  const extraction = extractStory(world, run.newEvents, run.startActorStates);
  persistRun(world, run, extraction);

  return {
    eventsGenerated: run.newEvents.length,
    episodesCreated: extraction.episodes.length,
    skeletonsCreated: extraction.skeletons.length,
    finalClock: run.finalClock,
    summary: run.summary,
  };
}

export function resetSimulation(simulationId: number): { success: true } {
  resetSimulationHistory(simulationId);
  return { success: true };
}