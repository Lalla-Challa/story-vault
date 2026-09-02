import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CATEGORY_STYLES: Record<string, string> = {
  rule: "bg-stationery-amber/20 text-ink-charcoal",
  fact: "bg-surface-variant text-ink-charcoal",
  hypothesis: "bg-violet-100 text-violet-800",
  project_brief: "bg-emerald-100 text-emerald-700",
  core_directive: "bg-sky-100 text-sky-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  rule: "RULE",
  fact: "FACT",
  hypothesis: "HYPOTHESIS",
  project_brief: "PROJECT BRIEF",
  core_directive: "CORE DIRECTIVE",
};

export function AgentMemoryPanel({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const listQuery = trpc.agent.memory.list.useQuery({ projectId }, { enabled: open });
  const createMutation = trpc.agent.memory.create.useMutation();
  const deleteMutation = trpc.agent.memory.delete.useMutation();

  const [category, setCategory] = useState<"rule" | "fact" | "hypothesis">("fact");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");

  const entries = listQuery.data ?? [];

  useEffect(() => {
    if (!open) {
      setContent("");
      setQuery("");
    }
  }, [open]);

  const handleAdd = async () => {
    if (!content.trim()) return;
    await createMutation.mutateAsync({ projectId, category, content: content.trim() });
    setContent("");
    toast.success("Saved to project memory");
    await listQuery.refetch();
  };

  const handleDelete = async (memoryId: number) => {
    await deleteMutation.mutateAsync({ memoryId });
    await listQuery.refetch();
  };

  const visible = query.trim()
    ? (listQuery.data ?? []).filter((e) => e.content.toLowerCase().includes(query.toLowerCase()))
    : entries;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-paper-base">
        <DialogHeader>
          <DialogTitle className="font-headline-md text-headline-md text-ink-charcoal">
            Project Memory
          </DialogTitle>
          <p className="font-body-ui text-body-ui text-sage-slate text-sm">
            Facts, rules, and hypotheses the agent remembers across every chat. Injected into the
            system prompt on each run.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add form */}
          <div className="space-y-2 border border-muted-border rounded-lg p-3 bg-surface-container-low/40">
            <div className="flex gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="bg-surface-container-low border border-muted-border rounded px-2 py-1.5 font-body-ui text-body-ui text-ink-charcoal"
              >
                <option value="rule">Rule</option>
                <option value="fact">Fact</option>
                <option value="hypothesis">Hypothesis</option>
              </select>
              <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                }}
                placeholder="e.g. The protagonist's father is alive but estranged…"
                className="flex-1 bg-paper-base border border-muted-border rounded px-3 py-1.5 font-body-ui text-body-ui text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber"
              />
              <button
                onClick={() => void handleAdd()}
                disabled={!content.trim() || createMutation.isPending}
                className="px-3 py-1.5 rounded bg-ink-charcoal text-paper-base font-body-ui text-body-ui disabled:opacity-40"
              >
                Save
              </button>
            </div>
            <p className="font-caption text-caption text-sage-slate">
              Tip: you can also ask the agent to remember something — it uses add_to_memory itself.
            </p>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter memory…"
              className="flex-1 bg-surface-container-low border border-muted-border rounded px-3 py-1.5 font-body-ui text-body-ui text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber"
            />
          </div>

          {/* List */}
          <div className="space-y-2 max-h-[40vh] overflow-y-auto ink-scrollbar">
            {visible.length === 0 && (
              <p className="font-caption text-caption text-sage-slate italic text-center py-6">
                No memory entries yet.
              </p>
            )}
            {visible.map((entry) => (
              <div
                key={entry.id}
                className="group flex items-start gap-2 border border-muted-border rounded-lg p-3 bg-paper-base"
              >
                <span
                  className={cn(
                    "font-label-caps text-[10px] uppercase tracking-widest px-2 py-0.5 rounded shrink-0 mt-0.5",
                    CATEGORY_STYLES[entry.category] ?? CATEGORY_STYLES.fact
                  )}
                >
                  {CATEGORY_LABELS[entry.category] ?? entry.category}
                </span>
                <p className="flex-1 font-body-writing text-body-writing text-ink-charcoal text-sm whitespace-pre-wrap break-words">
                  {entry.content}
                </p>
                <button
                  onClick={() => void handleDelete(entry.id)}
                  className="opacity-0 group-hover:opacity-100 text-sage-slate hover:text-error transition-all p-0.5 shrink-0"
                  title="Delete memory"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}