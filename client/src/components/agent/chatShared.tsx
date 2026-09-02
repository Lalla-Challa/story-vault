import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessageDto, ProposalDto } from "@/lib/agentSse";

export type Entry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "thought"; text: string }
  | { id: string; kind: "tool"; name: string; argsLabel: string; result?: string; failed?: boolean }
  | { id: string; kind: "proposal"; proposal: ProposalDto }
  | { id: string; kind: "subtask"; subId: string; description: string; status: "running" | "done" }
  | { id: string; kind: "suggestion"; topic: string; reason: string; status: "pending" | "dismissed" }
  | { id: string; kind: "error"; text: string }
  | { id: string; kind: "info"; text: string };

let entryCounter = 0;
export const nextEntryId = () => `e${++entryCounter}`;

export function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args ?? {});
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => (typeof v === "string" ? `${k}:"${truncate(v, 40)}"` : `${k}:${String(v)}`))
    .join(", ");
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function toastInfo(message: string) {
  const el = document.createElement("div");
  el.className =
    "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-ink-charcoal text-paper-base text-sm px-4 py-2 rounded-lg shadow-lg";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

export function BranchButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="shrink-0 mt-1.5 size-7 rounded-full flex items-center justify-center text-sage-slate hover:text-violet-700 hover:bg-violet-50 transition-colors"
    >
      <span className="material-symbols-outlined text-[16px]">fork_right</span>
    </button>
  );
}

export function ResearchBranchButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="shrink-0 mt-1.5 size-7 rounded-full flex items-center justify-center text-sage-slate hover:text-stationery-amber hover:bg-stationery-amber/10 transition-colors"
    >
      <span className="material-symbols-outlined text-[16px]">travel_explore</span>
    </button>
  );
}

export function TimelineEntry({
  entry,
  kind,
  text,
  toolCalls,
  showBranch,
  onBranch,
  showResearchBranch,
  onResearchBranch,
  highlight,
  messageIndex,
}: {
  entry?: Entry;
  kind?: "user" | "assistant";
  text?: string;
  toolCalls?: ChatMessageDto["toolCalls"];
  showBranch?: boolean;
  onBranch?: () => void;
  showResearchBranch?: boolean;
  onResearchBranch?: () => void;
  /** Optional renderer for message text (e.g. pinned-concept highlighting). */
  highlight?: (content: string) => ReactNode;
  /** Index of this persisted message (for selection/pinning). */
  messageIndex?: number;
}) {
  const resolved: Entry | null =
    entry ??
    (kind === "user" || kind === "assistant"
      ? ({ id: `persisted-${kind}`, kind, text: text ?? "" } as Entry)
      : null);
  if (!resolved) return null;

  const renderText = (content: string) => (highlight ? highlight(content) : content);

  switch (resolved.kind) {
    case "user":
      return (
        <div className="flex justify-end gap-2 items-start" data-message-index={messageIndex}>
          <div className="max-w-[80%] bg-ink-charcoal text-paper-base rounded-2xl rounded-br-sm px-4 py-2.5 font-body-writing text-body-writing whitespace-pre-wrap shadow-sm">
            {renderText(resolved.text)}
          </div>
          {showResearchBranch && onResearchBranch && (
            <ResearchBranchButton onClick={onResearchBranch} title="Branch to Research Thread" />
          )}
          {showBranch && onBranch && <BranchButton onClick={onBranch} title="Branch from this message" />}
        </div>
      );
    case "assistant":
      return (
        <div className="flex gap-3 items-start" data-message-index={messageIndex}>
          <div className="size-8 shrink-0 mt-1 rounded-full bg-stationery-amber/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[16px] text-stationery-amber">auto_awesome</span>
          </div>
          <div className="max-w-[85%] flex-1 space-y-2">
            <div className="bg-paper-base border border-muted-border rounded-2xl rounded-tl-sm px-4 py-2.5 font-body-writing text-body-writing text-ink-charcoal whitespace-pre-wrap shadow-[0_1px_3px_rgba(45,41,38,0.06)]">
              {renderText(resolved.text)}
            </div>
            {toolCalls && toolCalls.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {toolCalls.map((tc, i) => (
                  <span
                    key={i}
                    title={tc.summary}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-muted-border bg-surface-container-low text-xs font-mono text-sage-slate"
                  >
                    <span className="material-symbols-outlined text-[12px]">construction</span>
                    {tc.name}({formatArgs(tc.args)})
                  </span>
                ))}
              </div>
            )}
            {showResearchBranch && onResearchBranch && (
              <div className="pl-1">
                <ResearchBranchButton onClick={onResearchBranch} title="Branch to Research Thread" />
              </div>
            )}
            {showBranch && onBranch && (
              <div className="pl-1">
                <BranchButton onClick={onBranch} title="Branch from this message" />
              </div>
            )}
          </div>
        </div>
      );
    case "thought":
      return <ThinkingBlock text={resolved.text} />;
    case "tool":
      return (
        <div className="flex gap-3">
          <div className="size-8 shrink-0 mt-1 rounded-full bg-surface-dim flex items-center justify-center">
            <span className="material-symbols-outlined text-[16px] text-sage-slate">construction</span>
          </div>
          <div className="space-y-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono",
                resolved.failed
                  ? "border-error/40 bg-error-container/40 text-on-error-container"
                  : "border-muted-border bg-surface-container-low text-ink-charcoal"
              )}
            >
              {resolved.name}({resolved.argsLabel})
              {resolved.result === undefined && (
                <span className="material-symbols-outlined animate-spin text-[14px] text-stationery-amber">
                  refresh
                </span>
              )}
            </span>
            {resolved.result && (
              <p className="font-caption text-caption text-sage-slate pl-1">{resolved.result}</p>
            )}
          </div>
        </div>
      );
    case "proposal":
      return (
        <div className="pl-11">
          <ProposalCardInline proposal={resolved.proposal} />
        </div>
      );
    case "subtask":
      return (
        <div className="flex gap-3">
          <div className="size-8 shrink-0 mt-1 rounded-full bg-violet-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-[16px] text-violet-700">hub</span>
          </div>
          <div className="max-w-[85%] flex-1 space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-900 text-sm">
              {resolved.status === "running" ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>
                  <span className="font-medium">Processing sub-task…</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span className="font-medium">Sub-task complete</span>
                </>
              )}
            </div>
            <p className="font-caption text-caption text-sage-slate pl-0.5">{resolved.description}</p>
          </div>
        </div>
      );
    case "error":
      return (
        <div className="flex gap-3">
          <div className="size-8 shrink-0 mt-1 rounded-full bg-error-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[16px] text-error">error</span>
          </div>
          <div className="max-w-[85%] bg-error-container/60 border border-error/40 rounded-xl px-4 py-2.5 font-body-ui text-body-ui text-on-error-container">
            {resolved.text}
          </div>
        </div>
      );
    case "info":
      return (
        <div className="text-center font-caption text-caption text-sage-slate italic py-1">
          {resolved.text}
        </div>
      );
    default:
      return null;
  }
}

/** Minimal inline proposal card (used in the timeline, without accept/reject). */
function ProposalCardInline({ proposal }: { proposal: import("@/lib/agentSse").ProposalDto }) {
  return (
    <div className="border border-stationery-amber/40 rounded-xl p-3 bg-paper-base space-y-1">
      <div className="flex items-center gap-2 text-caption">
        <span className="font-label-caps text-[10px] uppercase tracking-widest text-stationery-amber px-2 py-0.5 rounded bg-stationery-amber/10">
          {proposal.kind === "draft" ? "Full Draft" : "Precise Edit"}
        </span>
        <span className="text-sage-slate">{proposal.sceneTitle}</span>
      </div>
      <p className="font-body-ui text-body-ui text-ink-charcoal">
        {proposal.summary || "Proposal created — see Pending proposals above to accept or reject."}
      </p>
    </div>
  );
}
/**
 * Collapsible "AI thinking" viewer — shows the model's reasoning stream.
 * Accumulated reasoning deltas land in a single block; collapsed by default
 * with a two-line preview, expandable to read the full chain of thought.
 */
function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const hasContent = text.trim().length > 0;

  return (
    <div className="flex gap-3">
      <div className="size-8 shrink-0 mt-1 rounded-full bg-violet-100 flex items-center justify-center">
        <span className="material-symbols-outlined text-[16px] text-violet-700">psychology</span>
      </div>
      <div className="flex-1 max-w-[85%] min-w-0">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sage-slate hover:text-violet-700 transition-colors select-none"
        >
          <span className="material-symbols-outlined text-[14px]">
            {open ? "expand_less" : "expand_more"}
          </span>
          <span className="font-label-caps text-[10px] uppercase tracking-widest">
            AI thinking{hasContent ? "" : "…"}
          </span>
        </button>
        {hasContent && (
          <div className={cn("border-l-2 border-violet-200 pl-3 mt-1", !open && "line-clamp-2")}>
            <p className="font-body-writing text-body-writing text-sage-slate italic whitespace-pre-wrap text-[15px]">
              {text}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
