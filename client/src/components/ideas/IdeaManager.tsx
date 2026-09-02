import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  raw: "bg-surface-dim text-sage-slate",
  evaluating: "bg-violet-100 text-violet-800",
  adopted: "bg-emerald-100 text-emerald-700",
  discarded: "bg-surface-dim text-sage-slate line-through",
};

type IdeaDto = {
  id: number;
  projectId: number;
  title: string;
  content: string;
  status: "raw" | "evaluating" | "adopted" | "discarded";
  linkedSceneId: number | null;
  linkedSceneTitle: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type FormState = {
  title: string;
  content: string;
  status: "raw" | "evaluating" | "adopted" | "discarded";
  linkedSceneId: number | null;
};

const EMPTY_FORM: FormState = { title: "", content: "", status: "raw", linkedSceneId: null };

export function IdeaManager({
  projectId,
  onEvaluate,
}: {
  projectId: number;
  /** Called with the created research thread id when "Evaluate with AI" is used. */
  onEvaluate: (threadId: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: ideas, isLoading } = trpc.ideas.list.useQuery({ projectId });
  const { data: scenes } = trpc.scene.list.useQuery({ projectId });
  const createMutation = trpc.ideas.create.useMutation();
  const updateMutation = trpc.ideas.update.useMutation();
  const deleteMutation = trpc.ideas.delete.useMutation();
  const evaluateMutation = trpc.ideas.evaluate.useMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sceneFilter, setSceneFilter] = useState<string>("all");

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (idea: IdeaDto) => {
    setEditingId(idea.id);
    setForm({
      title: idea.title,
      content: idea.content,
      status: idea.status,
      linkedSceneId: idea.linkedSceneId,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ ideaId: editingId, ...form });
        toast.success("Idea updated");
      } else {
        await createMutation.mutateAsync({ projectId, ...form });
        toast.success("Idea saved to the vault");
      }
      setDialogOpen(false);
      await utils.ideas.list.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save idea");
    }
  };

  const handleDelete = async (ideaId: number) => {
    await deleteMutation.mutateAsync({ ideaId });
    toast.success("Idea deleted");
    await utils.ideas.list.invalidate();
  };

  const handleEvaluate = async (ideaId: number) => {
    try {
      const res = await evaluateMutation.mutateAsync({ ideaId });
      toast.success("Research thread opened for this idea");
      await utils.ideas.list.invalidate();
      onEvaluate(res.threadId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open research thread");
    }
  };

  const filtered = useMemo(() => {
    return (ideas ?? []).filter((idea) => {
      const matchesStatus = statusFilter === "all" || idea.status === statusFilter;
      const matchesScene =
        sceneFilter === "all" ||
        (sceneFilter === "unlinked" && idea.linkedSceneId === null) ||
        (sceneFilter !== "unlinked" && idea.linkedSceneId === Number(sceneFilter));
      return matchesStatus && matchesScene;
    });
  }, [ideas, statusFilter, sceneFilter]);

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-ink-charcoal">Idea Vault</h2>
          <p className="font-body-ui text-body-ui text-sage-slate mt-1">
            A sandbox for sudden ideas and plot hypotheses. Ideas never appear in your manuscript
            — you decide what to do with them.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-ink-charcoal text-paper-base px-6 py-3 rounded hover:bg-primary-container transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[20px]">lightbulb</span>
          <span className="font-medium">New Idea</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal"
        >
          <option value="all">All statuses</option>
          <option value="raw">Raw</option>
          <option value="evaluating">Evaluating</option>
          <option value="adopted">Adopted</option>
          <option value="discarded">Discarded</option>
        </select>
        <select
          value={sceneFilter}
          onChange={(e) => setSceneFilter(e.target.value)}
          className="bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal"
        >
          <option value="all">All scenes</option>
          <option value="unlinked">Unlinked</option>
          {(scenes ?? []).map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      {/* Idea list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-sage-slate text-[32px]">refresh</span>
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((idea) => (
            <div
              key={idea.id}
              className="bg-paper-base border border-muted-border rounded-xl p-5 flex flex-col gap-3 shadow-[0_4px_20px_rgba(45,41,38,0.02)] hover:shadow-[0_8px_30px_rgba(45,41,38,0.05)] transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="material-symbols-outlined text-[18px] text-stationery-amber">lightbulb</span>
                  <span
                    className={cn(
                      "font-label-caps text-[10px] uppercase tracking-widest px-2 py-0.5 rounded",
                      STATUS_STYLES[idea.status] ?? STATUS_STYLES.raw
                    )}
                  >
                    {idea.status}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void handleEvaluate(idea.id)}
                    disabled={evaluateMutation.isPending}
                    title="Evaluate with AI (opens a research thread)"
                    className="text-sage-slate hover:text-violet-700 hover:bg-violet-50 transition-colors p-1.5 rounded-full"
                  >
                    <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  </button>
                  <button
                    onClick={() => openEdit(idea)}
                    title="Edit"
                    className="text-sage-slate hover:text-ink-charcoal transition-colors p-1.5 rounded-full"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    onClick={() => void handleDelete(idea.id)}
                    title="Delete"
                    className="text-sage-slate hover:text-error transition-colors p-1.5 rounded-full"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>

              <h3 className="font-headline-md text-headline-md text-ink-charcoal leading-snug">
                {idea.title}
              </h3>
              <p className="font-body-writing text-body-writing text-on-surface-variant text-sm whitespace-pre-wrap line-clamp-4 flex-1">
                {idea.content}
              </p>

              <div className="border-t border-muted-border pt-3 flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 font-caption text-caption px-2 py-1 rounded",
                    idea.linkedSceneId
                      ? "bg-surface-container-low text-ink-charcoal"
                      : "bg-surface-dim text-sage-slate"
                  )}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {idea.linkedSceneId ? "link" : "link_off"}
                  </span>
                  {idea.linkedSceneId
                    ? `Linked to: ${idea.linkedSceneTitle ?? `Scene #${idea.linkedSceneId}`}`
                    : "Unlinked"}
                </span>
                <span className="font-caption text-caption text-sage-slate">
                  {new Date(idea.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border border-dashed border-muted-border rounded-lg bg-surface-container-low">
          <span className="material-symbols-outlined text-[56px] text-sage-slate opacity-40 mb-3 block">
            lightbulb
          </span>
          <p className="font-body-writing text-body-writing text-sage-slate">
            {statusFilter !== "all" || sceneFilter !== "all"
              ? "No ideas match your filters."
              : "No ideas yet. Capture your next plot spark here."}
          </p>
          {statusFilter === "all" && sceneFilter === "all" && (
            <button
              onClick={openCreate}
              className="mt-4 px-4 py-2 border border-muted-border rounded text-sage-slate hover:text-ink-charcoal transition-colors"
            >
              + Write your first idea
            </button>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg bg-paper-base">
          <DialogHeader>
            <DialogTitle className="font-headline-md text-headline-md text-ink-charcoal">
              {editingId ? "Edit Idea" : "New Idea"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="font-body-ui text-body-ui text-sage-slate block">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Chapter 12 opens with the shipwreck"
                className="w-full bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-body-ui text-body-ui text-sage-slate block">Content</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={5}
                placeholder="Describe the idea, hypothesis, or plot point…"
                className="w-full bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-writing text-body-writing text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber resize-y"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-body-ui text-body-ui text-sage-slate block">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as FormState["status"] })}
                  className="w-full bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal"
                >
                  <option value="raw">Raw</option>
                  <option value="evaluating">Evaluating</option>
                  <option value="adopted">Adopted</option>
                  <option value="discarded">Discarded</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="font-body-ui text-body-ui text-sage-slate block">
                  Link to scene <span className="font-caption">(optional)</span>
                </label>
                <select
                  value={form.linkedSceneId === null ? "" : String(form.linkedSceneId)}
                  onChange={(e) =>
                    setForm({ ...form, linkedSceneId: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal"
                >
                  <option value="">Unlinked</option>
                  {(scenes ?? []).map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDialogOpen(false)}
                className="px-4 py-2 rounded border border-muted-border text-sage-slate hover:text-ink-charcoal transition-colors font-body-ui text-body-ui"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={busy}
                className="px-5 py-2 rounded bg-ink-charcoal text-paper-base hover:bg-primary-container transition-colors font-body-ui text-body-ui disabled:opacity-50"
              >
                {busy ? "Saving…" : editingId ? "Save changes" : "Save idea"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}