import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
import { useState } from "react";

/**
 * Friendly (no-JSON) editors for the CCM world-model fields.
 * Normal people get chip lists and key/value rows; the underlying data is the
 * same JSON the engine reads — it just never has to be hand-written.
 */

// ─── StringListEditor — chip list for drives, habits, knowledge, … ───────────

export function StringListEditor({
  label,
  hint,
  values,
  onChange,
  placeholder = "Type and press Enter…",
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <Label className="font-body-ui text-body-ui">{label}</Label>
      {hint && <p className="font-caption text-caption text-sage-slate">{hint}</p>}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 bg-surface-container-low border border-muted-border rounded px-2 py-0.5 text-sm text-ink-charcoal"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-sage-slate hover:text-error transition-colors"
                aria-label={`Remove ${v}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="bg-paper-base border-muted-border"
        />
      </div>
    </div>
  );
}

// ─── KeyValueListEditor — rows of key + value for attributes/state/resources ──

export type KeyValueRow = { key: string; value: string; kind: "text" | "list" };

/** Convert an arbitrary JSON object into editable rows (lists become comma-ish chips). */
export function objectToRows(obj: Record<string, unknown>): KeyValueRow[] {
  return Object.entries(obj ?? {}).map(([key, value]) => {
    if (Array.isArray(value)) {
      return { key, value: value.map((v) => String(v)).join(", "), kind: "list" as const };
    }
    if (typeof value === "object" && value !== null) {
      // Nested objects are rare in practice; show as JSON so no data is lost.
      return { key, value: JSON.stringify(value), kind: "text" as const };
    }
    return { key, value: String(value), kind: "text" as const };
  });
}

/** Convert editable rows back into the JSON object the engine expects. */
export function rowsToObject(rows: KeyValueRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (row.kind === "list") {
      out[key] = row.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      // Numbers stay numbers so the engine's gt/lt/increment ops keep working.
      const asNum = Number(row.value);
      out[key] = row.value !== "" && !Number.isNaN(asNum) ? asNum : row.value;
    }
  }
  return out;
}

export function KeyValueListEditor({
  label,
  hint,
  rows,
  onChange,
  keyPlaceholder = "name (e.g. age, location, mood)",
  valuePlaceholder = "value",
}: {
  label: string;
  hint?: string;
  rows: KeyValueRow[];
  onChange: (next: KeyValueRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const addRow = () => onChange([...rows, { key: "", value: "", kind: "text" }]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="font-body-ui text-body-ui">{label}</Label>
        <button
          type="button"
          onClick={addRow}
          className="font-caption text-caption text-stationery-amber hover:underline"
        >
          + Add field
        </button>
      </div>
      {hint && <p className="font-caption text-caption text-sage-slate -mt-1">{hint}</p>}
      {rows.length === 0 ? (
        <p className="font-caption text-caption text-sage-slate italic">No fields yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                value={row.key}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
                placeholder={keyPlaceholder}
                className="bg-paper-base border-muted-border flex-1"
              />
              <Select
                value={row.kind}
                onValueChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, kind: v as "text" | "list" } : r)))}
              >
                <SelectTrigger className="bg-paper-base border-muted-border w-[92px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="list">List</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={row.value}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                placeholder={row.kind === "list" ? "comma, separated, values" : valuePlaceholder}
                className="bg-paper-base border-muted-border flex-[1.4]"
              />
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="text-sage-slate hover:text-error transition-colors p-1"
                aria-label="Remove field"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GoalsEditor — the six CCM goal buckets ──────────────────────────────────

export const GOAL_BUCKETS = [
  { key: "survival", label: "Survival" },
  { key: "functional", label: "Functional" },
  { key: "social", label: "Social" },
  { key: "emotional", label: "Emotional" },
  { key: "longTerm", label: "Long-term" },
  { key: "narrative", label: "Narrative" },
] as const;

export function GoalsEditor({
  goals,
  onChange,
}: {
  goals: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="font-body-ui text-body-ui">Goals</Label>
      <p className="font-caption text-caption text-sage-slate -mt-1">
        What the actor wants, by category. The engine uses these to build pressure.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {GOAL_BUCKETS.map((bucket) => (
          <StringListEditor
            key={bucket.key}
            label={bucket.label}
            values={goals[bucket.key] ?? []}
            onChange={(next) => onChange({ ...goals, [bucket.key]: next })}
            placeholder="Add a goal…"
          />
        ))}
      </div>
    </div>
  );
}
