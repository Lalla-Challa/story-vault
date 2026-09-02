import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";
import { diffLines, htmlToPlainText, type DiffRow } from "./diff";
import type { ProposalDto } from "@/lib/agentSse";
import { cn } from "@/lib/utils";

function DiffView({ originalContent, content }: { originalContent: string; content: string }) {
  const rows = diffLines(htmlToPlainText(originalContent), htmlToPlainText(content));
  const changed = rows.some((r) => r.a !== r.b);

  if (!changed) {
    return (
      <div className="font-caption text-caption text-sage-slate italic">
        No visible text changes (content is identical in plain text).
      </div>
    );
  }

  return (
    <div className="border border-muted-border rounded-md overflow-hidden text-[13px] leading-relaxed font-body-writing">
      {/* Header */}
      <div className="flex border-b border-muted-border bg-surface-container-low text-caption text-sage-slate">
        <div className="w-1/2 px-3 py-1.5 border-r border-muted-border">Original</div>
        <div className="w-1/2 px-3 py-1.5">Proposed</div>
      </div>
      <div className="max-h-[340px] overflow-y-auto ink-scrollbar">
        {rows.map((row, index) => (
          <DiffRowView key={index} row={row} />
        ))}
      </div>
    </div>
  );
}

function DiffRowView({ row }: { row: DiffRow }) {
  const unchanged = row.a === row.b;
  if (unchanged) {
    return (
      <div className="flex border-b border-muted-border/40 last:border-b-0">
        <div className="w-full px-3 py-1 text-on-surface-variant opacity-70 whitespace-pre-wrap break-words">
          {row.a ?? ""}
        </div>
      </div>
    );
  }
  return (
    <div className="flex border-b border-muted-border/40 last:border-b-0">
      <div className="w-1/2 px-3 py-1 bg-error-container/50 text-on-error-container whitespace-pre-wrap break-words border-r border-muted-border/40">
        {row.a ? (
          <>
            <span className="text-error select-none mr-1">−</span>
            {row.a}
          </>
        ) : (
          <span className="text-sage-slate/40 italic select-none">—</span>
        )}
      </div>
      <div className="w-1/2 px-3 py-1 bg-emerald-50 text-ink-charcoal whitespace-pre-wrap break-words">
        {row.b ? (
          <>
            <span className="text-emerald-600 select-none mr-1">+</span>
            {row.b}
          </>
        ) : (
          <span className="text-sage-slate/40 italic select-none">—</span>
        )}
      </div>
    </div>
  );
}

export function ProposalCard({
  proposal,
  onResolved,
}: {
  proposal: ProposalDto;
  onResolved: (id: number, status: "accepted" | "rejected") => void;
}) {
  const [resolving, setResolving] = useState(false);
  const utils = trpc.useUtils();

  const acceptMutation = trpc.agent.proposals.accept.useMutation({
    onSuccess: (data) => {
      toast.success(`Accepted — version ${data.versionId ?? ""} created`);
      setResolving(false);
      onResolved(proposal.id, "accepted");
      utils.version.list.invalidate();
      utils.scene.list.invalidate();
      utils.project.list.invalidate();
    },
    onError: (e) => {
      toast.error(e.message || "Failed to accept proposal");
      setResolving(false);
    },
  });

  const rejectMutation = trpc.agent.proposals.reject.useMutation({
    onSuccess: () => {
      toast.success("Proposal rejected");
      setResolving(false);
      onResolved(proposal.id, "rejected");
    },
    onError: (e) => {
      toast.error(e.message || "Failed to reject proposal");
      setResolving(false);
    },
  });

  const isPending = proposal.status === "pending";
  const busy = resolving || acceptMutation.isPending || rejectMutation.isPending;

  return (
    <div
      className={cn(
        "border rounded-xl p-5 space-y-4 bg-paper-base",
        proposal.status === "pending" && "border-stationery-amber/60 shadow-[0_8px_30px_rgba(212,163,115,0.12)]",
        proposal.status === "accepted" && "border-emerald-200",
        proposal.status === "rejected" && "border-muted-border opacity-80"
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "font-label-caps text-[10px] uppercase tracking-widest px-2 py-0.5 rounded",
                proposal.kind === "draft"
                  ? "bg-stationery-amber/20 text-ink-charcoal"
                  : "bg-surface-variant text-ink-charcoal"
              )}
            >
              {proposal.kind === "draft" ? "Full Draft" : "Precise Edit"}
            </span>
            <span className="font-caption text-caption text-sage-slate">
              Scene: <span className="text-ink-charcoal font-medium">{proposal.sceneTitle}</span>
            </span>
            {!isPending && (
              <span
                className={cn(
                  "font-label-caps text-[10px] uppercase tracking-widest px-2 py-0.5 rounded",
                  proposal.status === "accepted" ? "bg-emerald-100 text-emerald-700" : "bg-surface-dim text-sage-slate"
                )}
              >
                {proposal.status}
              </span>
            )}
          </div>
          <p className="font-body-ui text-body-ui text-ink-charcoal font-medium">
            {proposal.summary || (proposal.kind === "draft" ? "Draft proposal" : "Targeted edit")}
          </p>
          <p className="font-caption text-caption text-sage-slate">
            {new Date(proposal.createdAt).toLocaleString()}
          </p>
        </div>

        {isPending && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setResolving(true);
                rejectMutation.mutate({ proposalId: proposal.id });
              }}
              disabled={busy}
              className="px-4 py-2 rounded border border-muted-border text-sage-slate hover:border-error hover:text-error transition-colors font-body-ui text-body-ui disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => {
                setResolving(true);
                acceptMutation.mutate({ proposalId: proposal.id });
              }}
              disabled={busy}
              className="px-4 py-2 rounded bg-ink-charcoal text-paper-base hover:bg-primary-container transition-colors font-body-ui text-body-ui disabled:opacity-50 flex items-center gap-2"
            >
              {acceptMutation.isPending && <span className="material-symbols-outlined animate-spin text-[16px]">refresh</span>}
              Accept
            </button>
          </div>
        )}
      </div>

      {/* Precise-edit details */}
      {proposal.kind === "precise_edit" && proposal.findString && (
        <div className="space-y-1.5 text-caption">
          <div className="flex items-start gap-2">
            <span className="text-sage-slate shrink-0">Find:</span>
            <code className="bg-error-container/50 text-on-error-container px-2 py-0.5 rounded text-xs whitespace-pre-wrap break-all">
              {proposal.findString}
            </code>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-sage-slate shrink-0">Replace:</span>
            <code className="bg-emerald-50 text-ink-charcoal px-2 py-0.5 rounded text-xs whitespace-pre-wrap break-all">
              {proposal.replaceString}
            </code>
          </div>
        </div>
      )}

      {/* Diff */}
      <DiffView originalContent={proposal.originalContent} content={proposal.content} />
    </div>
  );
}