import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  StringListEditor,
  KeyValueListEditor,
  objectToRows,
  rowsToObject,
  type KeyValueRow,
} from "./worldmodel/editors";

type EntityKind = "environments" | "systems" | "rules" | "relationships" | "constraints";

const KIND_META: Record<EntityKind, { label: string; icon: string; blurb: string }> = {
  environments: { label: "Environments", icon: "place", blurb: "Locations with state, resources, and active processes" },
  systems: { label: "Systems", icon: "auto_fix_high", blurb: "World mechanics: magic, weather, economy, biology" },
  rules: { label: "Rules", icon: "rule", blurb: "The engine's DSL — WHEN conditions generate candidate events" },
  relationships: { label: "Relationships", icon: "groups", blurb: "First-class state between two actors" },
  constraints: { label: "Narrative Constraints", icon: "flag", blurb: "Destinations, not events: hard, soft, forbidden, range, temporal" },
};

const CONDITION_OPS = [
  { value: "eq", label: "equals" },
  { value: "ne", label: "not equals" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "in", label: "is one of (comma list)" },
  { value: "not_in", label: "is not one of" },
  { value: "exists", label: "exists" },
  { value: "absent", label: "is missing" },
] as const;

type ConditionRow = { field: string; op: string; value: string };

const RULE_FAMILIES = ["actor", "relationship", "environment", "biology", "physics", "social", "temporal", "narrative"] as const;
const RULE_SCOPES = ["actor", "environment", "system", "relationship", "narrative"] as const;

type RuleForm = {
  name: string;
  family: string;
  scope: string;
  requiresPressure: string;
  priority: string;
  probability: string;
  cooldown: string;
  conditions: ConditionRow[];
  candidateId: string;
  candidateSummary: string;
  candidateLevel: "micro" | "event";
  candidateWeight: "low" | "medium" | "high";
  candidateProbability: string;
  candidateChanges: ConditionRow[]; // reuse row shape: field/op/value (op = state-change op)
};

const EMPTY_RULE: RuleForm = {
  name: "",
  family: "actor",
  scope: "actor",
  requiresPressure: "",
  priority: "5",
  probability: "1",
  cooldown: "0",
  conditions: [],
  candidateId: "",
  candidateSummary: "",
  candidateLevel: "event",
  candidateWeight: "medium",
  candidateProbability: "0.5",
  candidateChanges: [],
};

const STATE_CHANGE_OPS = ["set", "increment", "append", "remove"] as const;

function rowsToConditions(rows: ConditionRow[]): { field: string; op: string; value?: unknown }[] {
  return rows
    .filter((r) => r.field.trim())
    .map((r) => {
      const base: { field: string; op: string; value?: unknown } = { field: r.field.trim(), op: r.op };
      if (r.op !== "exists" && r.op !== "absent") {
        if (r.op === "in" || r.op === "not_in") {
          base.value = r.value.split(",").map((s) => s.trim()).filter(Boolean);
        } else {
          const n = Number(r.value);
          base.value = r.value !== "" && !Number.isNaN(n) ? n : r.value;
        }
      }
      return base;
    });
}

function conditionsToRows(conditions: any[] | undefined): ConditionRow[] {
  return (conditions ?? []).map((c) => ({
    field: String(c.field ?? ""),
    op: String(c.op ?? "eq"),
    value: Array.isArray(c.value) ? c.value.join(", ") : c.value === undefined || c.value === null ? "" : String(c.value),
  }));
}

function changesToRows(changes: any[] | undefined): ConditionRow[] {
  return (changes ?? []).map((c) => ({
    field: String(c.field ?? ""),
    op: String(c.op ?? "set"),
    value: Array.isArray(c.value) ? c.value.join(", ") : c.value === undefined || c.value === null ? "" : String(c.value),
  }));
}

export function WorldModelManager({ projectId }: { projectId: number }) {
  const [activeTab, setActiveTab] = useState<EntityKind>("environments");
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // environments / systems / constraints
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [envRows, setEnvRows] = useState<KeyValueRow[]>([]); // attributes
  const [envStateRows, setEnvStateRows] = useState<KeyValueRow[]>([]);
  const [inhabitants, setInhabitants] = useState<string[]>([]);
  const [activeProcesses, setActiveProcesses] = useState<string[]>([]);
  const [sysRules, setSysRules] = useState<string[]>([]);
  const [sysConstraints, setSysConstraints] = useState<string[]>([]);
  const [sysConditions, setSysConditions] = useState<string[]>([]);
  const [sysEffects, setSysEffects] = useState<string[]>([]);
  const [sysExceptions, setSysExceptions] = useState<string[]>([]);
  const [conClass, setConClass] = useState<string>("hard");
  const [conDescription, setConDescription] = useState("");
  const [conActors, setConActors] = useState<string[]>([]);
  const [conForbidden, setConForbidden] = useState<string[]>([]);
  const [conField, setConField] = useState("");
  const [conMin, setConMin] = useState("");
  const [conMax, setConMax] = useState("");
  const [conConditions, setConConditions] = useState<ConditionRow[]>([]);

  // rules
  const [rule, setRule] = useState<RuleForm>(EMPTY_RULE);

  // relationships
  const [relA, setRelA] = useState("");
  const [relB, setRelB] = useState("");

  const utils = trpc.useUtils();

  const envList = trpc.environment.list.useQuery({ projectId }, { enabled: activeTab === "environments" });
  const sysList = trpc.worldSystem.list.useQuery({ projectId }, { enabled: activeTab === "systems" });
  const ruleList = trpc.rule.list.useQuery({ projectId }, { enabled: activeTab === "rules" });
  const relList = trpc.relationship.list.useQuery({ projectId }, { enabled: activeTab === "relationships" });
  const conList = trpc.constraint.list.useQuery({ projectId }, { enabled: activeTab === "constraints" });
  const actorList = trpc.actor.list.useQuery({ projectId });

  const lists: Record<EntityKind, { data: any; loading: boolean }> = {
    environments: { data: envList.data, loading: envList.isLoading },
    systems: { data: sysList.data, loading: sysList.isLoading },
    rules: { data: ruleList.data, loading: ruleList.isLoading },
    relationships: { data: relList.data, loading: relList.isLoading },
    constraints: { data: conList.data, loading: conList.isLoading },
  };

  const invalidate = () => {
    utils.environment.list.invalidate();
    utils.worldSystem.list.invalidate();
    utils.rule.list.invalidate();
    utils.relationship.list.invalidate();
    utils.constraint.list.invalidate();
  };

  const close = () => { setIsOpen(false); setEditingId(null); };

  const resetForm = () => {
    setName(""); setType("");
    setEnvRows([]); setEnvStateRows([]); setInhabitants([]); setActiveProcesses([]);
    setSysRules([]); setSysConstraints([]); setSysConditions([]); setSysEffects([]); setSysExceptions([]);
    setConClass("hard"); setConDescription(""); setConActors([]); setConForbidden([]);
    setConField(""); setConMin(""); setConMax(""); setConConditions([]);
    setRule(EMPTY_RULE); setRelA(""); setRelB("");
  };

  const handleSave = () => {
    if (activeTab === "relationships") {
      if (!relA || !relB) { toast.error("Pick both actors"); return; }
      createRel.mutate({ projectId, actorAId: Number(relA), actorBId: Number(relB) });
      return;
    }
    if (!name.trim()) { toast.error("A name is required"); return; }

    switch (activeTab) {
      case "environments": {
        const body = {
          name: name.trim(),
          type: type.trim() || "location",
          attributes: rowsToObject(envRows),
          state: rowsToObject(envStateRows),
          inhabitants,
          activeProcesses,
        };
        if (editingId) updateEnv.mutate({ environmentId: editingId, ...body } as any);
        else createEnv.mutate({ projectId, ...body } as any);
        break;
      }
      case "systems": {
        const body = {
          name: name.trim(),
          type: type.trim() || "mechanism",
          rules: sysRules,
          constraints: sysConstraints,
          activeConditions: sysConditions,
          effects: sysEffects,
          exceptions: sysExceptions,
        };
        if (editingId) updateSys.mutate({ systemId: editingId, ...body } as any);
        else createSys.mutate({ projectId, ...body } as any);
        break;
      }
      case "rules": {
        if (!rule.candidateId.trim() || !rule.candidateSummary.trim()) {
          toast.error("The event needs an id and a summary");
          return;
        }
        const candidate = {
          id: rule.candidateId.trim(),
          summary: rule.candidateSummary.trim(),
          level: rule.candidateLevel,
          narrativeWeight: rule.candidateWeight,
          probability: Number(rule.candidateProbability) || 0.5,
          stateChanges: rule.candidateChanges
            .filter((c) => c.field.trim())
            .map((c) => {
              const change: Record<string, unknown> = { target: "self", field: c.field.trim(), op: c.op };
              if (c.value !== "") {
                const n = Number(c.value);
                change.value = !Number.isNaN(n) ? n : c.value;
              }
              return change;
            }),
        };
        const body = {
          name: name.trim(),
          family: rule.family,
          scope: rule.scope,
          when: {
            conditions: rowsToConditions(rule.conditions),
            ...(rule.requiresPressure.trim() ? { requiresPressure: rule.requiresPressure.trim() } : {}),
          },
          candidateEvents: [candidate],
          priority: Number(rule.priority) || 5,
          probability: Number(rule.probability) || 1,
          cooldown: Number(rule.cooldown) || 0,
          enabled: true,
        };
        if (editingId) updateRule.mutate({ ruleId: editingId, ...body } as any);
        else createRule.mutate({ projectId, ...body } as any);
        break;
      }
      case "constraints": {
        const target: Record<string, unknown> = {};
        if (conActors.length > 0) target.actors = conActors;
        if (conForbidden.length > 0) target.forbidden = conForbidden;
        if (conField.trim()) target.field = conField.trim();
        if (conMin !== "") target.min = Number(conMin);
        if (conMax !== "") target.max = Number(conMax);
        const conds = rowsToConditions(conConditions);
        if (conds.length > 0) target.conditions = conds;
        const body = {
          name: name.trim(),
          class: conClass,
          target,
          description: conDescription || null,
          priority: 1,
        };
        if (editingId) updateCon.mutate({ constraintId: editingId, ...body } as any);
        else createCon.mutate({ projectId, ...body } as any);
        break;
      }
    }
  };

  const onSaved = (suffix?: string) => { toast.success(suffix ?? "Saved"); close(); invalidate(); };

  const createEnv = trpc.environment.create.useMutation({ onSuccess: () => onSaved("Environment created") });
  const updateEnv = trpc.environment.update.useMutation({ onSuccess: () => onSaved("Environment updated") });
  const createSys = trpc.worldSystem.create.useMutation({ onSuccess: () => onSaved("System created") });
  const updateSys = trpc.worldSystem.update.useMutation({ onSuccess: () => onSaved("System updated") });
  const createRule = trpc.rule.create.useMutation({ onSuccess: () => onSaved("Rule created") });
  const updateRule = trpc.rule.update.useMutation({ onSuccess: () => onSaved("Rule updated") });
  const createRel = trpc.relationship.create.useMutation({ onSuccess: () => onSaved("Relationship created") });
  const deleteRel = trpc.relationship.delete.useMutation({ onSuccess: () => { toast.success("Deleted"); invalidate(); } });
  const createCon = trpc.constraint.create.useMutation({ onSuccess: () => onSaved("Constraint created") });
  const updateCon = trpc.constraint.update.useMutation({ onSuccess: () => onSaved("Constraint updated") });

  const deleteEnv = trpc.environment.delete.useMutation({ onSuccess: () => { toast.success("Deleted"); invalidate(); } });
  const deleteSys = trpc.worldSystem.delete.useMutation({ onSuccess: () => { toast.success("Deleted"); invalidate(); } });
  const deleteRule = trpc.rule.delete.useMutation({ onSuccess: () => { toast.success("Deleted"); invalidate(); } });
  const deleteCon = trpc.constraint.delete.useMutation({ onSuccess: () => { toast.success("Deleted"); invalidate(); } });

  const openEdit = (item: any) => {
    resetForm();
    setEditingId(item.id);
    switch (activeTab) {
      case "environments":
        setName(item.name ?? ""); setType(item.type ?? "");
        setEnvRows(objectToRows((item.attributes ?? {}) as Record<string, unknown>));
        setEnvStateRows(objectToRows((item.state ?? {}) as Record<string, unknown>));
        setInhabitants(item.inhabitants ?? []);
        setActiveProcesses(item.activeProcesses ?? []);
        break;
      case "systems":
        setName(item.name ?? ""); setType(item.type ?? "");
        setSysRules(item.rules ?? []); setSysConstraints(item.constraints ?? []);
        setSysConditions(item.activeConditions ?? []); setSysEffects(item.effects ?? []); setSysExceptions(item.exceptions ?? []);
        break;
      case "rules": {
        const r = item;
        setRule({
          name: r.name ?? "",
          family: r.family ?? "actor",
          scope: r.scope ?? "actor",
          requiresPressure: (r.when as any)?.requiresPressure ?? "",
          priority: String(r.priority ?? 5),
          probability: String(r.probability ?? 1),
          cooldown: String(r.cooldown ?? 0),
          conditions: conditionsToRows((r.when as any)?.conditions),
          candidateId: r.candidateEvents?.[0]?.id ?? "",
          candidateSummary: r.candidateEvents?.[0]?.summary ?? "",
          candidateLevel: r.candidateEvents?.[0]?.level ?? "event",
          candidateWeight: r.candidateEvents?.[0]?.narrativeWeight ?? "medium",
          candidateProbability: String(r.candidateEvents?.[0]?.probability ?? 0.5),
          candidateChanges: changesToRows(r.candidateEvents?.[0]?.stateChanges),
        });
        setName(r.name ?? "");
        break;
      }
      case "constraints": {
        const t = (item.target ?? {}) as Record<string, any>;
        setName(item.name ?? "");
        setConClass(item.class ?? "hard");
        setConDescription(item.description ?? "");
        setConActors(t.actors ?? []);
        setConForbidden(t.forbidden ?? []);
        setConField(t.field ?? "");
        setConMin(t.min !== undefined ? String(t.min) : "");
        setConMax(t.max !== undefined ? String(t.max) : "");
        setConConditions(conditionsToRows(t.conditions));
        break;
      }
      case "relationships":
        break;
    }
    setIsOpen(true);
  };

  const itemLabel = (item: any): string => item.name ?? item.title ?? `#${item.id}`;
  const itemSnippet = (item: any): string => {
    if (activeTab === "rules") {
      const c = item.candidateEvents?.[0];
      const condCount = (item.when as any)?.conditions?.length ?? 0;
      return c ? `When ${condCount} condition${condCount === 1 ? "" : "s"} met → ${c.summary}` : "No candidate event";
    }
    if (activeTab === "constraints") {
      const t = (item.target ?? {}) as any;
      const bits: string[] = [];
      if (t.forbidden?.length) bits.push(`forbids: ${t.forbidden.join(", ")}`);
      if (t.field) bits.push(`field: ${t.field}`);
      if (t.conditions?.length) bits.push(`${t.conditions.length} condition(s)`);
      return bits.length ? `${item.class} · ${bits.join(" · ")}` : `${item.class} constraint`;
    }
    if (item.description) return item.description;
    if (item.type) return item.type;
    if (item.class) return `${item.class} constraint`;
    return "—";
  };

  const current = lists[activeTab];
  const meta = KIND_META[activeTab];

  const actorName = (id: number) => actorList.data?.find((a) => a.id === id)?.name ?? `#${id}`;

  const renderRow = (item: any) => (
    <Card key={item.id} className="bg-paper-base border border-muted-border rounded p-5 flex flex-col gap-1">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <h3 className="font-headline-md text-headline-md text-ink-charcoal truncate">{itemLabel(item)}</h3>
          <p className="font-caption text-caption text-sage-slate mt-0.5 line-clamp-2">{itemSnippet(item)}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => openEdit(item)}
            className="text-sage-slate hover:text-ink-charcoal transition-colors p-2 rounded-full hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button
            onClick={() => {
              const d =
                activeTab === "environments" ? deleteEnv :
                activeTab === "systems" ? deleteSys :
                activeTab === "rules" ? deleteRule :
                activeTab === "relationships" ? deleteRel : deleteCon;
              d.mutate({ [idKey()]: item.id } as any);
            }}
            className="text-sage-slate hover:text-error transition-colors p-2 rounded-full hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    </Card>
  );

  const idKey = (): string =>
    activeTab === "environments" ? "environmentId" :
    activeTab === "systems" ? "systemId" :
    activeTab === "rules" ? "ruleId" :
    activeTab === "relationships" ? "relationshipId" : "constraintId";

  const newButtonLabel =
    activeTab === "environments" ? "New Environment" :
    activeTab === "systems" ? "New System" :
    activeTab === "rules" ? "New Rule" :
    activeTab === "relationships" ? "New Relationship" : "New Constraint";

  const openNew = () => { resetForm(); setEditingId(null); setIsOpen(true); };

  const textField = (label: string, value: string, onChange: (v: string) => void, placeholder?: string) => (
    <div className="space-y-2">
      <Label className="font-body-ui text-body-ui">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-paper-base border-muted-border" />
    </div>
  );

  const conditionRowEditor = (
    rows: ConditionRow[],
    onChange: (rows: ConditionRow[]) => void,
    ops: readonly string[],
    valuePlaceholder = "value",
    fieldPlaceholder = "field (e.g. state.fatigue)",
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="font-body-ui text-body-ui">Conditions</Label>
        <button type="button" onClick={() => onChange([...rows, { field: "", op: "eq", value: "" }])} className="font-caption text-caption text-stationery-amber hover:underline">
          + Add condition
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="font-caption text-caption text-sage-slate italic">No conditions — the rule can always fire.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                value={row.field}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, field: e.target.value } : r)))}
                placeholder={fieldPlaceholder}
                className="bg-paper-base border-muted-border flex-1"
              />
              <Select value={row.op} onValueChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, op: v } : r)))}>
                <SelectTrigger className="bg-paper-base border-muted-border w-[150px] shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITION_OPS.filter((o) => ops.includes(o.value)).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {row.op !== "exists" && row.op !== "absent" && (
                <Input
                  value={row.value}
                  onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                  placeholder={valuePlaceholder}
                  className="bg-paper-base border-muted-border flex-1"
                />
              )}
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-sage-slate hover:text-error transition-colors p-1">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderForm = () => {
    if (activeTab === "relationships") {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="font-body-ui text-body-ui">Actor A</Label>
            <Select value={relA} onValueChange={setRelA}>
              <SelectTrigger className="bg-paper-base border-muted-border"><SelectValue placeholder="Choose an actor" /></SelectTrigger>
              <SelectContent>
                {actorList.data?.map((a) => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="font-body-ui text-body-ui">Actor B</Label>
            <Select value={relB} onValueChange={setRelB}>
              <SelectTrigger className="bg-paper-base border-muted-border"><SelectValue placeholder="Choose an actor" /></SelectTrigger>
              <SelectContent>
                {actorList.data?.map((a) => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="font-caption text-caption text-sage-slate">The relationship starts neutral; the engine develops it as events unfold.</p>
        </div>
      );
    }

    if (activeTab === "environments") {
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {textField("Name *", name, setName, "e.g. Anchor Isle Lighthouse")}
            {textField("Type", type, setType, "location")}
          </div>
          <KeyValueListEditor label="Attributes" hint="Stable features (height, rooms, capacity)." rows={envRows} onChange={setEnvRows} keyPlaceholder="e.g. height" valuePlaceholder="e.g. 30 meters" />
          <KeyValueListEditor label="Current State" hint="Volatile conditions (weather, occupancy, tide)." rows={envStateRows} onChange={setEnvStateRows} keyPlaceholder="e.g. occupancy" valuePlaceholder="e.g. quiet" />
          <StringListEditor label="Inhabitants" values={inhabitants} onChange={setInhabitants} placeholder="Add an inhabitant…" />
          <StringListEditor label="Active Processes" hint="Ongoing changes the engine can advance (e.g. “storm approaching”)." values={activeProcesses} onChange={setActiveProcesses} placeholder="Add a process…" />
        </div>
      );
    }

    if (activeTab === "systems") {
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {textField("Name *", name, setName, "e.g. Weather")}
            {textField("Type", type, setType, "e.g. meteorology")}
          </div>
          <StringListEditor label="Rules" hint="How this system behaves." values={sysRules} onChange={setSysRules} placeholder="Add a rule of this system…" />
          <StringListEditor label="Active Conditions" values={sysConditions} onChange={setSysConditions} placeholder="e.g. storm season" />
          <StringListEditor label="Effects" values={sysEffects} onChange={setSysEffects} placeholder="e.g. delays ferries" />
          <StringListEditor label="Constraints" values={sysConstraints} onChange={setSysConstraints} placeholder="What this system forbids…" />
          <StringListEditor label="Exceptions" values={sysExceptions} onChange={setSysExceptions} placeholder="e.g. ferries run during light fog" />
        </div>
      );
    }

    if (activeTab === "constraints") {
      return (
        <div className="space-y-5">
          {textField("Name *", name, setName, "e.g. The lamp must burn each night")}
          <div className="space-y-2">
            <Label className="font-body-ui text-body-ui">Class</Label>
            <Select value={conClass} onValueChange={setConClass}>
              <SelectTrigger className="bg-paper-base border-muted-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hard">Hard — must be respected, blocks contradictions</SelectItem>
                <SelectItem value="soft">Soft — steering, not blocking</SelectItem>
                <SelectItem value="forbidden">Forbidden — keywords that must never appear</SelectItem>
                <SelectItem value="range">Range — a field must stay between min and max</SelectItem>
                <SelectItem value="temporal">Temporal — must be reached by a deadline</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="font-body-ui text-body-ui">Description</Label>
            <Textarea rows={2} value={conDescription} onChange={(e) => setConDescription(e.target.value)} className="bg-paper-base border-muted-border" placeholder="Why this constraint exists (shown to the LLM when it violates the rule)" />
          </div>
          <StringListEditor label="Applies to Actors" hint="Leave empty to apply to everyone." values={conActors} onChange={setConActors} placeholder="Add an actor name…" />
          {conClass === "forbidden" && (
            <StringListEditor label="Forbidden Keywords" hint="Any proposal whose text contains one of these is rejected (Layer 1)." values={conForbidden} onChange={setConForbidden} placeholder="e.g. lamp" />
          )}
          {(conClass === "range" || conClass === "forbidden") && (
            <div className="grid grid-cols-3 gap-3 items-end">
              {textField("Field (dotted path)", conField, setConField, "e.g. state.fatigue")}
              {conClass === "range" && textField("Min", conMin, setConMin, "0")}
              {conClass === "range" && textField("Max", conMax, setConMax, "10")}
            </div>
          )}
          {(conClass === "hard" || conClass === "soft" || conClass === "temporal") &&
            conditionRowEditor(conConditions, setConConditions, ["eq", "ne", "gt", "gte", "lt", "lte", "in", "not_in", "exists", "absent"], "value", "field (e.g. state.location)")}
        </div>
      );
    }

    // rules
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          {textField("Name *", name, setName, "e.g. Hourly Lamp Check")}
          <div className="space-y-2">
            <Label className="font-body-ui text-body-ui">Family</Label>
            <Select value={rule.family} onValueChange={(v) => setRule({ ...rule, family: v })}>
              <SelectTrigger className="bg-paper-base border-muted-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_FAMILIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="font-body-ui text-body-ui">Scope</Label>
            <Select value={rule.scope} onValueChange={(v) => setRule({ ...rule, scope: v })}>
              <SelectTrigger className="bg-paper-base border-muted-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_SCOPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {textField("Pressure keyword (optional)", rule.requiresPressure, (v) => setRule({ ...rule, requiresPressure: v }), "Only fires when an entity's drives/goals/habits mention this")}
        </div>
        {conditionRowEditor(rule.conditions, (conditions) => setRule({ ...rule, conditions }), ["eq", "ne", "gt", "gte", "lt", "lte", "in", "not_in", "exists", "absent"], "value", "field (e.g. state.exertion)")}
        <div className="grid grid-cols-3 gap-3">
          {textField("Priority", rule.priority, (v) => setRule({ ...rule, priority: v }))}
          {textField("Probability (0–1)", rule.probability, (v) => setRule({ ...rule, probability: v }))}
          {textField("Cooldown (ticks)", rule.cooldown, (v) => setRule({ ...rule, cooldown: v }))}
        </div>
        <div className="pt-1 border-t border-muted-border" />
        <p className="font-caption text-caption text-sage-slate -mt-2">
          When the conditions are met, the engine picks from the rule's candidate events:
        </p>
        <div className="grid grid-cols-2 gap-4">
          {textField("Event ID *", rule.candidateId, (v) => setRule({ ...rule, candidateId: v }), "e.g. lamp.check")}
          {textField("Probability (0–1)", rule.candidateProbability, (v) => setRule({ ...rule, candidateProbability: v }))}
        </div>
        {textField("Event Summary *", rule.candidateSummary, (v) => setRule({ ...rule, candidateSummary: v }), "e.g. {name} climbs the tower for the hourly lamp check — {name} is replaced with the actor's name")}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="font-body-ui text-body-ui">Level</Label>
            <Select value={rule.candidateLevel} onValueChange={(v) => setRule({ ...rule, candidateLevel: v as "micro" | "event" })}>
              <SelectTrigger className="bg-paper-base border-muted-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="micro">Micro — small background change</SelectItem>
                <SelectItem value="event">Event — a notable story beat</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="font-body-ui text-body-ui">Narrative weight</Label>
            <Select value={rule.candidateWeight} onValueChange={(v) => setRule({ ...rule, candidateWeight: v as "low" | "medium" | "high" })}>
              <SelectTrigger className="bg-paper-base border-muted-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="font-body-ui text-body-ui">State Changes</Label>
            <button type="button" onClick={() => setRule({ ...rule, candidateChanges: [...rule.candidateChanges, { field: "", op: "set", value: "" }] })} className="font-caption text-caption text-stationery-amber hover:underline">
              + Add change
            </button>
          </div>
          <p className="font-caption text-caption text-sage-slate -mt-1">What the world looks like after this event.</p>
          {rule.candidateChanges.length === 0 ? (
            <p className="font-caption text-caption text-sage-slate italic">No changes — the event happens without touching state.</p>
          ) : (
            <div className="space-y-2">
              {rule.candidateChanges.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={row.field}
                    onChange={(e) => setRule({ ...rule, candidateChanges: rule.candidateChanges.map((r, j) => (j === i ? { ...r, field: e.target.value } : r)) })}
                    placeholder="field (e.g. state.lampWick)"
                    className="bg-paper-base border-muted-border flex-1"
                  />
                  <Select value={row.op} onValueChange={(v) => setRule({ ...rule, candidateChanges: rule.candidateChanges.map((r, j) => (j === i ? { ...r, op: v } : r)) })}>
                    <SelectTrigger className="bg-paper-base border-muted-border w-[110px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATE_CHANGE_OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={row.value}
                    onChange={(e) => setRule({ ...rule, candidateChanges: rule.candidateChanges.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)) })}
                    placeholder="value"
                    className="bg-paper-base border-muted-border flex-1"
                  />
                  <button type="button" onClick={() => setRule({ ...rule, candidateChanges: rule.candidateChanges.filter((_, j) => j !== i) })} className="text-sage-slate hover:text-error transition-colors p-1">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-ink-charcoal">World Model</h2>
          <p className="font-body-ui text-body-ui text-sage-slate mt-1">Environments, systems, rules, relationships, and narrative constraints</p>
        </div>
        <Button
          className="bg-ink-charcoal text-paper-base hover:bg-primary-container transition-all hover:scale-97 active:scale-95 shadow-sm flex items-center gap-2"
          onClick={openNew}
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          {newButtonLabel}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto scrollbar-hide gap-2 border-b border-muted-border pb-px">
        {(Object.keys(KIND_META) as EntityKind[]).map((kind) => (
          <button
            key={kind}
            onClick={() => setActiveTab(kind)}
            className={`px-4 py-2 font-label-caps text-label-caps whitespace-nowrap ${
              activeTab === kind
                ? "text-ink-charcoal border-b-2 border-stationery-amber"
                : "text-sage-slate hover:text-ink-charcoal transition-colors"
            }`}
          >
            {KIND_META[kind].label.toUpperCase()}
          </button>
        ))}
      </div>

      <p className="font-caption text-caption text-sage-slate">{meta.blurb}</p>

      {current.loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-sage-slate text-[32px]">refresh</span>
        </div>
      ) : current.data && current.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {current.data.map((item: any) =>
            activeTab === "relationships" ? (
              <Card key={item.id} className="bg-paper-base border border-muted-border rounded p-5">
                <h3 className="font-headline-md text-headline-md text-ink-charcoal">
                  {actorName(item.actorAId)} ↔ {actorName(item.actorBId)}
                </h3>
                <p className="font-caption text-caption text-sage-slate mt-1">
                  trust: {item.trust} · affection: {item.affection} · familiarity: {item.familiarity}
                </p>
                <div className="flex gap-1 justify-end mt-2">
                  <button
                    onClick={() => deleteRel.mutate({ relationshipId: item.id })}
                    className="text-sage-slate hover:text-error transition-colors p-2 rounded-full hover:bg-surface-container-low"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </Card>
            ) : (
              renderRow(item)
            )
          )}
        </div>
      ) : (
        <div className="text-center py-16 border border-dashed border-muted-border rounded-lg bg-surface-container-low">
          <span className="material-symbols-outlined text-[64px] text-sage-slate opacity-50 mb-4 block">{meta.icon}</span>
          <p className="font-body-ui text-body-ui text-sage-slate">No {meta.label.toLowerCase()} yet</p>
          <button onClick={openNew} className="font-caption text-caption text-stationery-amber hover:underline mt-1">
            Create your first {activeTab === "rules" ? "rule" : activeTab === "constraints" ? "constraint" : "entry"}
          </button>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-headline-md text-headline-md">
              {editingId ? `Edit ${meta.label}` : `New ${meta.label}`}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            {renderForm()}
          </div>
          <div className="flex gap-3 justify-end pt-3 border-t border-muted-border shrink-0">
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button
              className="bg-ink-charcoal text-paper-base hover:bg-primary-container"
              onClick={handleSave}
              disabled={createEnv.isPending || updateEnv.isPending || createSys.isPending || updateSys.isPending || createRule.isPending || updateRule.isPending || createCon.isPending || updateCon.isPending || createRel.isPending}
            >
              {editingId ? "Save Changes" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
