import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Simulation workspace — the CCE control room. Pick a simulation (a run of the
 * engine against the project's world model), advance time, and inspect the
 * generated event timeline, episodes, and scene skeletons. World model editing
 * (actors, environments, systems, rules, relationships, constraints) lives in
 * the World tab; skeletons render into prose via the Agent tab's proposals.
 */
export function SimulationWorkspace({ projectId }: { projectId: number }) {
  const utils = trpc.useUtils();
  const { data: simulations, isLoading } = trpc.simulation.list.useQuery({ projectId });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ticks, setTicks] = useState(12);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("Run 1");
  const [newDesc, setNewDesc] = useState("");

  const sim = simulations?.find((s) => s.id === selectedId) ?? simulations?.[0] ?? null;

  const createSim = trpc.simulation.create.useMutation({
    onSuccess: (data) => {
      toast.success("Simulation created");
      setCreateOpen(false);
      setNewName("Run 1");
      setNewDesc("");
      utils.simulation.list.invalidate();
      if (data?.id) setSelectedId(data.id);
    },
    onError: (e) => toast.error(e.message || "Failed to create simulation"),
  });

  const advance = trpc.simulation.advance.useMutation({
    onSuccess: (data) => {
      toast.success(`Advanced — ${data.eventsGenerated} events, ${data.skeletonsCreated} skeletons`);
      invalidateAll();
    },
    onError: (e) => toast.error(e.message || "Failed to advance"),
  });

  const reset = trpc.simulation.reset.useMutation({
    onSuccess: () => {
      toast.success("Simulation reset");
      invalidateAll();
    },
  });

  const invalidateAll = () => {
    utils.simulation.list.invalidate();
    utils.simulation.events.invalidate();
    utils.simulation.episodes.invalidate();
    utils.simulation.skeletons.invalidate();
    utils.simulation.snapshots.invalidate();
  };

  const clock = sim?.clock as { day?: number; minute?: number } | undefined;
  const clockLabel =
    clock && typeof clock.day === "number"
      ? `Day ${clock.day}, ${String(Math.floor((clock.minute ?? 0) / 60)).padStart(2, "0")}:${String((clock.minute ?? 0) % 60).padStart(2, "0")}`
      : "Day 0, 06:00";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-ink-charcoal">Simulation</h2>
          <p className="font-body-ui text-body-ui text-sage-slate mt-1">
            The CCE runs the engine against your world model — pressure → events → episodes → scene skeletons.
          </p>
        </div>
        <Button
          className="bg-ink-charcoal text-paper-base hover:bg-primary-container transition-all hover:scale-97 active:scale-95 shadow-sm flex items-center gap-2"
          onClick={() => setCreateOpen(true)}
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          New Simulation
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-sage-slate text-[32px]">refresh</span>
        </div>
      ) : !sim ? (
        <div className="text-center py-16 border border-dashed border-muted-border rounded-lg bg-surface-container-low">
          <span className="material-symbols-outlined text-[64px] text-sage-slate opacity-50 mb-4 block">neurology</span>
          <p className="font-body-ui text-body-ui text-sage-slate">No simulations yet</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="font-caption text-caption text-stationery-amber hover:underline mt-1"
          >
            Create your first simulation
          </button>
        </div>
      ) : (
        <>
          {/* Simulation picker + controls */}
          <Card className="bg-paper-base border border-muted-border rounded p-5">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              <div className="flex items-center gap-3">
                <select
                  value={sim.id}
                  onChange={(e) => setSelectedId(Number(e.target.value))}
                  className="bg-paper-base border border-muted-border rounded px-3 py-2 font-body-ui text-sm text-ink-charcoal"
                >
                  {simulations?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="font-caption text-caption text-sage-slate">
                  <span className="font-semibold text-stationery-amber">Clock:</span> {clockLabel} ·{" "}
                  <span className="font-semibold text-stationery-amber">Seed:</span> {sim.simulationSeed} ·{" "}
                  <span className="font-semibold text-stationery-amber">Status:</span> {sim.status}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={ticks}
                  onChange={(e) => setTicks(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24 bg-paper-base border-muted-border text-sm"
                  aria-label="Ticks to advance"
                />
                <Button
                  onClick={() => advance.mutate({ simulationId: sim.id, ticks })}
                  disabled={advance.isPending}
                  className="bg-primary-container text-ink-charcoal hover:bg-stationery-amber/20"
                >
                  {advance.isPending && <span className="material-symbols-outlined animate-spin mr-1 text-[16px]">refresh</span>}
                  Advance
                </Button>
                <Button
                  variant="outline"
                  onClick={() => reset.mutate({ simulationId: sim.id })}
                  disabled={reset.isPending}
                >
                  Reset
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <TimelinePanel simulationId={sim.id} />
            <WorldStatePanel projectId={projectId} />
            <SkeletonPanel simulationId={sim.id} />
          </div>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md bg-paper-base border-muted-border">
          <DialogHeader>
            <DialogTitle className="font-headline-md text-headline-md">New Simulation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-body-ui text-body-ui">Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-paper-base border-muted-border" />
            </div>
            <div className="space-y-2">
              <Label className="font-body-ui text-body-ui">Description (optional)</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="bg-paper-base border-muted-border" />
            </div>
            <Button
              className="w-full bg-ink-charcoal text-paper-base hover:bg-primary-container"
              onClick={() => createSim.mutate({ projectId, name: newName, description: newDesc || undefined })}
              disabled={createSim.isPending || !newName.trim()}
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimelinePanel({ simulationId }: { simulationId: number }) {
  const { data: events, isLoading } = trpc.simulation.events.useQuery(
    { simulationId, limit: 200 },
    { enabled: !!simulationId }
  );
  const { data: episodes } = trpc.simulation.episodes.useQuery({ simulationId }, { enabled: !!simulationId });
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const { data: ancestry } = trpc.simulation.ancestry.useQuery(
    { eventId: selectedEventId ?? 0 },
    { enabled: !!selectedEventId }
  );
  const { data: allEvents } = trpc.simulation.events.useQuery(
    { simulationId, limit: 1000 },
    { enabled: !!selectedEventId }
  );

  const eventById = (id: number) => allEvents?.find((e) => e.id === id);

  return (
    <Card className="bg-paper-base border border-muted-border rounded p-5 xl:col-span-1 flex flex-col max-h-[70vh]">
      <h3 className="font-label-caps text-label-caps text-sage-slate uppercase tracking-widest mb-3">
        Event Timeline
      </h3>
      <div className="flex-1 overflow-y-auto ink-scrollbar space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><span className="material-symbols-outlined animate-spin text-sage-slate">refresh</span></div>
        ) : !events || events.length === 0 ? (
          <p className="font-caption text-caption text-sage-slate italic">No events yet. Press Advance to run the engine.</p>
        ) : (
          <>
            {/* Episodes as section headers */}
            {episodes?.map((ep) => {
              const epEvents = events.filter((e) => ((ep.eventIds as number[]) ?? []).includes(e.id));
              if (epEvents.length === 0) return null;
              return (
                <div key={ep.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 pt-2">
                    <span className="material-symbols-outlined text-[16px] text-stationery-amber">view_timeline</span>
                    <span className="font-label-caps text-[11px] uppercase tracking-widest text-ink-charcoal">{ep.title}</span>
                    <span className="font-caption text-[10px] text-sage-slate capitalize">· {ep.theme}</span>
                  </div>
                  {epEvents.map((e) => (
                    <TimelineRow key={e.id} event={e} onSelect={() => setSelectedEventId(selectedEventId === e.id ? null : e.id)} selected={selectedEventId === e.id} />
                  ))}
                </div>
              );
            })}
            {/* Any events not in an episode */}
            {events
              .filter((e) => !episodes?.some((ep) => ((ep.eventIds as number[]) ?? []).includes(e.id)))
              .map((e) => (
                <TimelineRow key={e.id} event={e} onSelect={() => setSelectedEventId(selectedEventId === e.id ? null : e.id)} selected={selectedEventId === e.id} />
              ))}
          </>
        )}
      </div>

      {/* Causal ancestry drawer */}
      {selectedEventId && (
        <div className="mt-3 border-t border-muted-border pt-3 space-y-2">
          <h4 className="font-label-caps text-[10px] uppercase tracking-widest text-sage-slate">
            Why did this happen? (causal ancestry)
          </h4>
          {(!ancestry || ancestry.length === 0) && (
            <p className="font-caption text-caption text-sage-slate italic">No recorded causal parents.</p>
          )}
          {ancestry?.map((parent) => {
            const p = eventById(parent.id) ?? parent;
            return (
              <div key={parent.id} className="text-xs text-ink-charcoal flex gap-2 items-start">
                <span className="material-symbols-outlined text-[14px] text-sage-slate mt-px">subdirectory_arrow_right</span>
                <span>{(p.action as any)?.summary ?? p.eventType}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TimelineRow({ event, onSelect, selected }: { event: any; onSelect: () => void; selected: boolean }) {
  const weight = event.narrativeWeight === "high" ? "text-stationery-amber" : event.narrativeWeight === "medium" ? "text-ink-charcoal" : "text-sage-slate";
  const loadBearing = (event.causalLoad as any)?.class === "load_bearing";
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-2.5 rounded-lg border transition-colors ${selected ? "bg-surface-container-high border-stationery-amber/40" : "border-transparent hover:bg-surface-container-low"}`}
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[14px] text-sage-slate">schedule</span>
        <span className="font-caption text-[10px] text-sage-slate">
          {new Date((event.timestamp as number) * 1).getTime() ? "—" : ""}
          {String(Math.floor(((event.timestamp as number) % 1440) / 60)).padStart(2, "0")}:
          {String((event.timestamp as number) % 60).padStart(2, "0")}
        </span>
        {loadBearing && <span className="material-symbols-outlined text-[14px] text-error" title="Load-bearing">link</span>}
      </div>
      <p className={`font-body-ui text-sm ${weight}`}>{(event.action as any)?.summary ?? event.eventType}</p>
      <p className="font-caption text-[10px] text-sage-slate">{event.eventType}{event.location ? ` · ${event.location}` : ""}</p>
    </button>
  );
}

function WorldStatePanel({ projectId }: { projectId: number }) {
  const { data: actors } = trpc.actor.list.useQuery({ projectId });
  return (
    <Card className="bg-paper-base border border-muted-border rounded p-5 flex flex-col max-h-[70vh]">
      <h3 className="font-label-caps text-label-caps text-sage-slate uppercase tracking-widest mb-3">World State</h3>
      <div className="flex-1 overflow-y-auto ink-scrollbar space-y-3">
        {!actors || actors.length === 0 ? (
          <p className="font-caption text-caption text-sage-slate italic">No actors in the world model yet.</p>
        ) : (
          actors.map((a: any) => (
            <div key={a.id} className="rounded-lg border border-muted-border bg-surface-container-low p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[16px] text-stationery-amber">group</span>
                <span className="font-headline-md text-headline-md text-ink-charcoal">{a.name}</span>
                <span className="font-caption text-[10px] text-sage-slate">{a.type}</span>
              </div>
              {a.state && typeof a.state === "object" && Object.keys(a.state as object).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(a.state as Record<string, unknown>).map(([k, v]) => (
                    <span key={k} className="font-caption text-[10px] bg-paper-base border border-muted-border rounded px-1.5 py-0.5 text-sage-slate">
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
              {(a.drives as string[] | undefined)?.length ? (
                <p className="font-caption text-[10px] text-sage-slate mt-1">drives: {(a.drives as string[]).join(", ")}</p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function SkeletonPanel({ simulationId }: { simulationId: number }) {
  const utils = trpc.useUtils();
  const { data: skeletons, isLoading } = trpc.simulation.skeletons.useQuery(
    { simulationId },
    { enabled: !!simulationId }
  );
  const render = trpc.simulation.renderSkeleton.useMutation({
    onSuccess: (data) => {
      toast.success(`Drafted "${data.sceneTitle}" — accept it in the Agent tab`);
      utils.simulation.skeletons.invalidate();
      utils.scene.list.invalidate();
      utils.agent.proposals.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Render failed (is AI configured?)"),
  });
  return (
    <Card className="bg-paper-base border border-muted-border rounded p-5 flex flex-col max-h-[70vh]">
      <h3 className="font-label-caps text-label-caps text-sage-slate uppercase tracking-widest mb-3">Scene Skeletons</h3>
      <div className="flex-1 overflow-y-auto ink-scrollbar space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8"><span className="material-symbols-outlined animate-spin text-sage-slate">refresh</span></div>
        ) : !skeletons || skeletons.length === 0 ? (
          <p className="font-caption text-caption text-sage-slate italic">Skeletons appear here after the extractor finds notable events.</p>
        ) : (
          skeletons.map((s: any) => (
            <div key={s.id} className="rounded-lg border border-muted-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-headline-md text-headline-md text-ink-charcoal mb-1">{s.title}</p>
                  {s.participants && (s.participants as string[]).length > 0 && (
                    <p className="font-caption text-[10px] text-sage-slate mb-1">
                      {s.location ? `${s.location} · ` : ""}
                      {(s.participants as string[]).join(", ")}
                    </p>
                  )}
                </div>
                {!s.rendered && (
                  <Button
                    size="sm"
                    onClick={() => render.mutate({ skeletonId: s.id })}
                    disabled={render.isPending}
                    className="shrink-0 bg-primary-container text-ink-charcoal hover:bg-stationery-amber/20 text-xs"
                  >
                    {render.isPending ? <span className="material-symbols-outlined animate-spin text-[14px]">refresh</span> : <span className="material-symbols-outlined text-[14px]">auto_awesome</span>}
                    Render
                  </Button>
                )}
              </div>
              <div className="space-y-0.5">
                {(s.beats as string[] | undefined)?.map((beat: string, i: number) => (
                  <p key={i} className="font-body-ui text-sm text-ink-charcoal">• {beat}</p>
                ))}
              </div>
              {s.turningPoint && (
                <p className="font-caption text-[11px] text-stationery-amber mt-1">
                  Turning point: {s.turningPoint}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}