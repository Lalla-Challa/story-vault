import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  StringListEditor,
  KeyValueListEditor,
  GoalsEditor,
  objectToRows,
  rowsToObject,
  type KeyValueRow,
} from "./worldmodel/editors";

type Beliefs = { known: string[]; believed: string[]; uncertain: string[]; misconceptions: string[] };

const EMPTY_GOALS = { survival: [], functional: [], social: [], emotional: [], longTerm: [], narrative: [] };
const EMPTY_BELIEFS: Beliefs = { known: [], believed: [], uncertain: [], misconceptions: [] };

type FormData = {
  name: string;
  type: string;
  description: string;
  notes: string;
  attributeRows: KeyValueRow[];
  stateRows: KeyValueRow[];
  goals: Record<string, string[]>;
  drives: string[];
  beliefs: Beliefs;
  knowledge: string[];
  capabilities: string[];
  constraints: string[];
  habits: string[];
  plans: string[];
};

const empty: FormData = {
  name: "",
  type: "human",
  description: "",
  notes: "",
  attributeRows: [],
  stateRows: [],
  goals: EMPTY_GOALS,
  drives: [],
  beliefs: EMPTY_BELIEFS,
  knowledge: [],
  capabilities: [],
  constraints: [],
  habits: [],
  plans: [],
};

/** Coerce legacy CCM data (arrays may arrive as Date/JSON values) into form state. */
function toForm(a: any): FormData {
  return {
    name: a.name ?? "",
    type: a.type ?? "human",
    description: a.description ?? "",
    notes: a.notes ?? "",
    attributeRows: objectToRows((a.attributes ?? {}) as Record<string, unknown>),
    stateRows: objectToRows((a.state ?? {}) as Record<string, unknown>),
    goals: { ...EMPTY_GOALS, ...(a.goals ?? {}) },
    drives: a.drives ?? [],
    beliefs: { ...EMPTY_BELIEFS, ...(a.beliefs ?? {}) },
    knowledge: a.knowledge ?? [],
    capabilities: a.capabilities ?? [],
    constraints: a.constraints ?? [],
    habits: a.habits ?? [],
    plans: a.plans ?? [],
  };
}

export function ActorManager({ projectId }: { projectId: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(empty);

  const utils = trpc.useUtils();
  const { data: actors, isLoading } = trpc.actor.list.useQuery({ projectId });

  const exportMutation = trpc.export.singleItem.useMutation({
    onSuccess: (data) => {
      const byteCharacters = atob(data.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.contentType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`${data.filename} exported`);
    },
    onError: (e) => toast.error(e.message || "Export failed"),
  });

  const createMutation = trpc.actor.create.useMutation({
    onSuccess: () => {
      toast.success("Actor created");
      close();
      utils.actor.list.invalidate();
    },
  });
  const updateMutation = trpc.actor.update.useMutation({
    onSuccess: () => {
      toast.success("Actor updated");
      close();
      utils.actor.list.invalidate();
    },
  });
  const deleteMutation = trpc.actor.delete.useMutation({
    onSuccess: () => {
      toast.success("Actor deleted");
      utils.actor.list.invalidate();
    },
  });

  const close = () => {
    setIsOpen(false);
    setEditingId(null);
    setForm(empty);
  };

  const openEdit = (a: any) => {
    setForm(toForm(a));
    setEditingId(a.id);
    setIsOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const base = {
      name: form.name.trim(),
      type: form.type.trim() || "human",
      description: form.description,
      notes: form.notes,
      attributes: rowsToObject(form.attributeRows),
      state: rowsToObject(form.stateRows),
      goals: form.goals,
      drives: form.drives,
      beliefs: form.beliefs,
      knowledge: form.knowledge,
      capabilities: form.capabilities,
      constraints: form.constraints,
      habits: form.habits,
      plans: form.plans,
    };
    if (editingId) updateMutation.mutate({ actorId: editingId, ...base });
    else createMutation.mutate({ projectId, ...base });
  };

  const field = (key: "name" | "type" | "description" | "notes", label: string, multiline?: boolean, rows?: number) => (
    <div className="space-y-2">
      <Label className="font-body-ui text-body-ui">{label}</Label>
      {multiline ? (
        <Textarea
          rows={rows ?? 3}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="bg-paper-base border-muted-border"
        />
      ) : (
        <Input
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="bg-paper-base border-muted-border"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-ink-charcoal">Actors</h2>
          <p className="font-body-ui text-body-ui text-sage-slate mt-1">World model characters — attributes (stable), state (volatile), goals, drives, beliefs</p>
        </div>
        <Button
          className="bg-ink-charcoal text-paper-base hover:bg-primary-container transition-all hover:scale-97 active:scale-95 shadow-sm flex items-center gap-2"
          onClick={() => { setForm(empty); setEditingId(null); setIsOpen(true); }}
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          New Actor
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-sage-slate text-[32px]">refresh</span>
        </div>
      ) : actors && actors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {actors.map((a: any) => (
            <Card
              key={a.id}
              className="bg-paper-base border border-muted-border rounded p-6 shadow-[0_4px_20px_rgba(45,41,38,0.02)] hover:shadow-[0_8px_30px_rgba(45,41,38,0.05)] transition-shadow cursor-pointer group flex flex-col h-full"
            >
              <div className="flex justify-between items-start mb-4">
                <span className="font-label-caps text-label-caps text-stationery-amber bg-surface-container-low px-2 py-1 rounded">
                  {a.type?.toUpperCase() ?? "ACTOR"}
                </span>
                <button className="text-sage-slate hover:text-ink-charcoal opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="material-symbols-outlined text-[20px]">more_vert</span>
                </button>
              </div>
              <h3 className="font-headline-md text-headline-md text-ink-charcoal mb-2 group-hover:text-secondary transition-colors">
                {a.name}
              </h3>
              <div className="space-y-1 mb-4">
                {a.attributes && typeof a.attributes === "object" && Object.entries(a.attributes as Record<string, unknown>).slice(0, 4).map(([k, v]) => (
                  <div key={k} className="text-xs">
                    <span className="font-semibold text-sage-slate uppercase tracking-wider">{k}: </span>
                    <span className="text-ink-charcoal">{friendlyValue(v)}</span>
                  </div>
                ))}
              </div>
              {Array.isArray(a.drives) && a.drives.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {(a.drives as string[]).slice(0, 3).map((d) => (
                    <span key={d} className="text-xs bg-surface-container-low border border-muted-border rounded px-1.5 py-0.5 text-ink-charcoal line-clamp-1 max-w-full">{d}</span>
                  ))}
                </div>
              )}
              <p className="font-body-ui text-body-ui text-on-surface-variant line-clamp-3 mb-6 flex-grow">
                {a.description || "No description yet"}
              </p>
              <div className="flex items-center justify-between mt-auto pt-4 border-t border-muted-border">
                <span className="font-caption text-caption text-sage-slate">
                  {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : "Never"}
                </span>
                <div className="flex gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-sage-slate hover:text-stationery-amber transition-colors p-2 rounded-full hover:bg-surface-container-low">
                        <span className="material-symbols-outlined text-[18px]">ios_share</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-paper-base border-muted-border">
                      <DropdownMenuItem onClick={() => exportMutation.mutate({ type: "actor", id: a.id, format: "pdf" })} className="cursor-pointer">
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportMutation.mutate({ type: "actor", id: a.id, format: "md" })} className="cursor-pointer">
                        Export as Markdown
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    onClick={() => openEdit(a)}
                    className="text-sage-slate hover:text-ink-charcoal transition-colors p-2 rounded-full hover:bg-surface-container-low"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate({ actorId: a.id })}
                    disabled={deleteMutation.isPending}
                    className="text-sage-slate hover:text-error transition-colors p-2 rounded-full hover:bg-surface-container-low"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border border-dashed border-muted-border rounded-lg bg-surface-container-low">
          <span className="material-symbols-outlined text-[64px] text-sage-slate opacity-50 mb-4 block">group</span>
          <p className="font-body-ui text-body-ui text-sage-slate">No actors yet</p>
          <button onClick={() => setIsOpen(true)} className="font-caption text-caption text-stationery-amber hover:underline mt-1">
            Create your first actor
          </button>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-3xl flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-headline-md text-headline-md">
              {editingId ? "Edit Actor" : "New Actor"}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-5 pr-1">
            <div className="grid grid-cols-2 gap-4">
              {field("name", "Name *")}
              {field("type", "Type (human, spirit, creature…)")}
            </div>
            {field("description", "Description", true, 3)}
            {field("notes", "Notes", true, 3)}

            <div className="pt-1 border-t border-muted-border" />

            <KeyValueListEditor
              label="Attributes"
              hint="Stable traits — age, abilities, appearance. These rarely change."
              rows={form.attributeRows}
              onChange={(attributeRows) => setForm({ ...form, attributeRows })}
              keyPlaceholder="e.g. age"
              valuePlaceholder="e.g. 34"
            />

            <KeyValueListEditor
              label="Current State"
              hint="Volatile facts — location, mood, fatigue. The engine mutates these during simulation."
              rows={form.stateRows}
              onChange={(stateRows) => setForm({ ...form, stateRows })}
              keyPlaceholder="e.g. location"
              valuePlaceholder="e.g. Lighthouse Tower"
            />

            <GoalsEditor
              goals={form.goals}
              onChange={(goals) => setForm({ ...form, goals })}
            />

            <StringListEditor
              label="Drives"
              hint="Deep motivations that generate pressure every tick (e.g. “keep the light burning every night”)."
              values={form.drives}
              onChange={(drives) => setForm({ ...form, drives })}
              placeholder="Add a drive…"
            />

            <StringListEditor
              label="Habits"
              hint="Routine behaviours the engine can fall back on (e.g. “hourly lamp check”)."
              values={form.habits}
              onChange={(habits) => setForm({ ...form, habits })}
              placeholder="Add a habit…"
            />

            <StringListEditor
              label="Knowledge"
              hint="Facts this actor knows. Other actors cannot act on what they don't know — the engine enforces this."
              values={form.knowledge}
              onChange={(knowledge) => setForm({ ...form, knowledge })}
              placeholder="Add a known fact…"
            />

            <StringListEditor
              label="Capabilities"
              hint="What this actor is able to do. Events requiring missing capabilities are rejected."
              values={form.capabilities}
              onChange={(capabilities) => setForm({ ...form, capabilities })}
              placeholder="Add a capability…"
            />

            <StringListEditor
              label="Constraints"
              hint="Personal restraints — things this actor will not do."
              values={form.constraints}
              onChange={(constraints) => setForm({ ...form, constraints })}
              placeholder="Add a restraint…"
            />

            <StringListEditor
              label="Plans"
              hint="Current plans the actor is pursuing (the engine can interrupt them when the world changes)."
              values={form.plans}
              onChange={(plans) => setForm({ ...form, plans })}
              placeholder="Add a plan…"
            />

            <div className="space-y-3">
              <Label className="font-body-ui text-body-ui">Beliefs</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StringListEditor label="Known (verified)" values={form.beliefs.known} onChange={(known) => setForm({ ...form, beliefs: { ...form.beliefs, known } })} placeholder="Add…" />
                <StringListEditor label="Believed (unverified)" values={form.beliefs.believed} onChange={(believed) => setForm({ ...form, beliefs: { ...form.beliefs, believed } })} placeholder="Add…" />
                <StringListEditor label="Uncertain" values={form.beliefs.uncertain} onChange={(uncertain) => setForm({ ...form, beliefs: { ...form.beliefs, uncertain } })} placeholder="Add…" />
                <StringListEditor label="Misconceptions" values={form.beliefs.misconceptions} onChange={(misconceptions) => setForm({ ...form, beliefs: { ...form.beliefs, misconceptions } })} placeholder="Add…" />
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-3 border-t border-muted-border shrink-0">
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button
              className="bg-ink-charcoal text-paper-base hover:bg-primary-container"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <span className="material-symbols-outlined animate-spin mr-2">refresh</span>
              )}
              {editingId ? "Save Changes" : "Create Actor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Card display: lists join with commas, nested objects stay compact JSON. */
function friendlyValue(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return String(v);
}
