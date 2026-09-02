import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { runAgentStream, normalizeSession, type ChatSessionDto, type ChatMessageDto } from "@/lib/agentSse";
import { TimelineEntry, Entry, nextEntryId, toastInfo } from "@/components/agent/chatShared";
import { AIGuideDialog } from "@/components/agent/AIGuideDialog";

type PinnedConcept = {
  id: number;
  text: string;
  messageIndex: number;
};

export function IdeationChat({
  projectId,
  onInitialized,
}: {
  projectId: number;
  /** Called with the new scene id after "Initialize Working Agent". */
  onInitialized: (sceneId: number) => void;
}) {
  const utils = trpc.useUtils();

  // ── Ideation session (one per project, reused) ───────────────────────────
  const { data: rawSessions, refetch: refetchSessions } = trpc.agent.sessions.list.useQuery({ projectId });
  const sessions = useMemo(
    () =>
      (rawSessions ?? [])
        .map((s) => normalizeSession(s as Record<string, unknown>))
        .filter((s): s is ChatSessionDto => s !== null && s.type === "ideation"),
    [rawSessions]
  );

  const createSessionMutation = trpc.agent.sessions.create.useMutation();
  const updateMessagesMutation = trpc.agent.sessions.updateMessages.useMutation();
  const initializeMutation = trpc.agent.ideation.initialize.useMutation();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [live, setLive] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [sceneTitle, setSceneTitle] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Pinned concepts + selection popover ──────────────────────────────────
  const [pins, setPins] = useState<PinnedConcept[]>([]);
  const [selection, setSelection] = useState<{
    text: string;
    messageIndex: number;
    left: number;
    top: number;
  } | null>(null);
  const pinIdRef = useRef(0);

  // Load the most recent ideation session when the list arrives.
  useEffect(() => {
    if (sessions.length > 0 && sessionId === null) {
      const latest = sessions[0];
      if (latest) {
        setSessionId(latest.id);
        setMessages(latest.messages ?? []);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, live]);

  const persist = async (sid: number, msgs: ChatMessageDto[]) => {
    await updateMessagesMutation.mutateAsync({ sessionId: sid, messages: msgs });
    await refetchSessions();
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || isRunning) return;
    setMessages((prev) => [...prev, { role: "user", content: prompt, createdAt: new Date().toISOString() }]);
    setInput("");

    let sid = sessionId;
    if (!sid) {
      try {
        const created = await createSessionMutation.mutateAsync({
          projectId,
          title: "Ideation",
          type: "ideation",
        });
        sid = created.id;
        setSessionId(sid);
      } catch {
        setLive([{ id: nextEntryId(), kind: "error", text: "Failed to create the ideation chat." }]);
        return;
      }
    }

    setIsRunning(true);
    setLive([]);
    const controller = new AbortController();
    abortRef.current = controller;

    const appendLive = (entry: Entry) => setLive((prev) => [...prev, entry]);
    const appendAssistantDelta = (delta: string) => {
      setLive((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === "assistant") {
          return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
        }
        return [...prev, { id: nextEntryId(), kind: "assistant", text: delta }];
      });
    };

    let assistantText = "";
    try {
      await runAgentStream(
        { projectId, prompt, sessionId: sid },
        (event) => {
          switch (event.type) {
            case "text":
              assistantText += event.delta;
              appendAssistantDelta(event.delta);
              break;
            case "thought":
              setLive((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.kind === "thought") {
                  return [...prev.slice(0, -1), { ...last, text: last.text + event.text }];
                }
                return [...prev, { id: nextEntryId(), kind: "thought", text: event.text }];
              });
              break;
            case "error":
              appendLive({ id: nextEntryId(), kind: "error", text: event.message });
              break;
            default:
              break;
          }
        },
        controller.signal
      );
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        appendLive({
          id: nextEntryId(),
          kind: "error",
          text: error instanceof Error ? error.message : "Ideation chat failed",
        });
      }
    } finally {
      const finalMessages: ChatMessageDto[] = [
        ...messages,
        { role: "user", content: prompt, createdAt: new Date().toISOString() },
      ];
      if (assistantText.trim()) {
        finalMessages.push({
          role: "assistant",
          content: assistantText,
          createdAt: new Date().toISOString(),
        });
      }
      setMessages(finalMessages);
      // The streamed assistant bubble is now persisted in `messages` —
      // remove it from the live timeline so it doesn't render twice.
      setLive((prev) => prev.filter((e) => e.kind !== "assistant"));
      if (sid) await persist(sid, finalMessages).catch(() => {});
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  const handleNewSession = async () => {
    try {
      const created = await createSessionMutation.mutateAsync({ projectId, title: "Ideation", type: "ideation" });
      await refetchSessions();
      setSessionId(created.id);
      setMessages([]);
      setLive([]);
      setPins([]);
      toastInfo("Fresh ideation chat started");
    } catch {
      toastInfo("Failed to start a new ideation chat");
    }
  };

  // ── Selection → pin popover ───────────────────────────────────────────────
  const handleMouseUp = (e: React.MouseEvent) => {
    // Ignore selections that started inside the composer/popover
    const target = e.target as HTMLElement;
    if (target.closest("[data-pin-popover]") || target.closest("textarea")) return;

    const sel = window.getSelection();
    const text = sel?.toString().replace(/\r\n/g, "\n").trim();
    if (!sel || sel.isCollapsed || !text || text.length < 2) {
      setSelection(null);
      return;
    }
    const messageEl = target.closest("[data-message-index]") as HTMLElement | null;
    if (!messageEl) {
      setSelection(null);
      return;
    }
    const messageIndex = Number(messageEl.getAttribute("data-message-index"));
    if (Number.isNaN(messageIndex)) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelection({
      text,
      messageIndex,
      left: rect.left + rect.width / 2,
      top: rect.bottom + 6,
    });
  };

  const handlePin = () => {
    if (!selection) return;
    setPins((prev) => [
      ...prev,
      { id: ++pinIdRef.current, text: selection.text, messageIndex: selection.messageIndex },
    ]);
    setSelection(null);
    toastInfo("Pinned as a core concept");
  };

  const removePin = (id: number) => setPins((prev) => prev.filter((p) => p.id !== id));

  // Highlight pinned text inside a message.
  const highlight = useCallback(
    (content: string, messageIndex: number): ReactNode => {
      const messagePins = pins.filter((p) => p.messageIndex === messageIndex && p.text.length > 0);
      if (messagePins.length === 0) return content;

      const ranges: Array<[number, number]> = [];
      for (const pin of messagePins) {
        let idx = content.indexOf(pin.text);
        while (idx !== -1) {
          ranges.push([idx, idx + pin.text.length]);
          idx = content.indexOf(pin.text, idx + pin.text.length);
        }
      }
      if (ranges.length === 0) return content; // fall back to plain text

      ranges.sort((a, b) => a[0] - b[0]);
      const merged: Array<[number, number]> = [];
      for (const [s, e] of ranges) {
        const last = merged[merged.length - 1];
        if (last && s <= last[1]) last[1] = Math.max(last[1], e);
        else merged.push([s, e]);
      }

      const nodes: ReactNode[] = [];
      let pos = 0;
      merged.forEach(([s, e], i) => {
        if (s > pos) nodes.push(<span key={`t${i}`}>{content.slice(pos, s)}</span>);
        nodes.push(
          <mark key={`m${i}`} className="bg-stationery-amber/35 text-inherit rounded-[2px] px-0.5">
            {content.slice(s, e)}
          </mark>
        );
        pos = e;
      });
      if (pos < content.length) nodes.push(<span key="tend">{content.slice(pos)}</span>);
      return nodes;
    },
    [pins]
  );

  const handleInitialize = async () => {
    if (pins.length === 0) {
      toastInfo("Select text in the chat and pin it as a core concept first.");
      return;
    }
    if (initializeMutation.isPending) return;
    try {
      const res = await initializeMutation.mutateAsync({
        projectId,
        pinnedConcepts: pins.map((p) => p.text),
        sceneTitle: sceneTitle.trim() || undefined,
      });
      toastInfo(`Project brief saved — ${res.conceptMemoryIds.length} core concept(s) promoted`);
      await utils.agent.memory.list.invalidate();
      if (res.sceneId) onInitialized(res.sceneId);
    } catch (error) {
      toastInfo(error instanceof Error ? error.message : "Failed to initialize the working agent");
    }
  };

  const pinTexts = pins.map((p) => p.text);

  return (
    <div className="flex gap-5 w-full h-full min-h-0">
      {/* Chat column */}
      <div className="flex flex-col gap-4 flex-1 min-w-0 h-full min-h-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display-hero text-display-hero text-ink-charcoal">Ideation</h2>
            <p className="font-body-ui text-body-ui text-sage-slate mt-1">
              Brainstorm with the AI before writing. Select text in any message and pin it as a
              core concept — then promote the good ideas into the workspace.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setGuideOpen(true)}
              title="How to use the AI features"
              className="flex items-center justify-center size-9 text-sage-slate hover:text-ink-charcoal transition-colors rounded-lg border border-muted-border bg-surface-container-low/40"
            >
              <span className="material-symbols-outlined text-[18px]">help</span>
            </button>
            <button
              onClick={() => void handleNewSession()}
              className="shrink-0 px-3 py-2 rounded-lg border border-muted-border text-sage-slate hover:text-ink-charcoal transition-colors font-body-ui text-body-ui flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add_comment</span>
              New chat
            </button>
          </div>
        </div>

        {/* Timeline with selection */}
        <div
          ref={scrollRef}
          onMouseUp={handleMouseUp}
          className="space-y-4 flex-1 min-h-0 overflow-y-auto ink-scrollbar pr-1 pb-4"
        >
          {messages.length === 0 && live.length === 0 && (
            <div className="text-center py-12 text-sage-slate">
              <span className="material-symbols-outlined text-[48px] opacity-30 mb-2 block">psychology</span>
              <p className="font-body-writing italic">
                Pitch your rough idea. The AI will ask questions, sharpen the concept, and flag
                plot holes before you write a single scene.
              </p>
            </div>
          )}
          {messages.map((msg, index) => (
            <TimelineEntry
              key={`m-${index}`}
              kind={msg.role}
              text={msg.content}
              messageIndex={index}
              highlight={(c) => highlight(c, index)}
            />
          ))}
          {live.map((entry) => (
            <TimelineEntry key={entry.id} entry={entry} />
          ))}
        </div>

        {/* Selection pin popover */}
        {selection && (
          <div
            data-pin-popover
            className="fixed z-[100] -translate-x-1/2"
            style={{ left: selection.left, top: selection.top }}
          >
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handlePin}
              className="bg-ink-charcoal text-paper-base text-sm px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 hover:bg-primary-container transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">push_pin</span>
              Pin as Core Concept
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="flex items-end gap-2 border border-muted-border rounded-xl bg-paper-base p-2 shadow-sm focus-within:ring-1 focus-within:ring-stationery-amber">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={2}
            placeholder="Pitch an idea…"
            disabled={isRunning}
            className="flex-1 bg-transparent border-none outline-none resize-none font-body-writing text-body-writing text-ink-charcoal placeholder:text-sage-slate/50 px-2 py-1"
          />
          {isRunning ? (
            <button
              onClick={handleStop}
              className="shrink-0 px-4 py-2 rounded-lg border border-error/40 text-error hover:bg-error-container/50 transition-colors font-body-ui text-body-ui"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim()}
              className="shrink-0 px-5 py-2 rounded-lg bg-ink-charcoal text-paper-base hover:bg-primary-container transition-colors font-body-ui text-body-ui disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>

        {/* Initialize bar */}
        <div className="border border-emerald-200 rounded-xl p-4 space-y-3 bg-emerald-50/60">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex-1 min-w-0">
              <p className="font-body-ui text-body-ui text-ink-charcoal font-medium">
                Initialize Working Agent
              </p>
              <p className="font-caption text-caption text-sage-slate mt-0.5">
                Promotes {pins.length} pinned concept{pins.length === 1 ? "" : "s"} into project
                memory (injected into every future agent run) and opens a working scene.
              </p>
            </div>
            <input
              value={sceneTitle}
              onChange={(e) => setSceneTitle(e.target.value)}
              placeholder="Working scene title (optional)"
              className="flex-1 sm:max-w-[240px] bg-paper-base border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber"
            />
            <button
              onClick={() => void handleInitialize()}
              disabled={pins.length === 0 || initializeMutation.isPending}
              className="shrink-0 px-5 py-2 rounded bg-emerald-700 text-white hover:bg-emerald-800 transition-colors font-body-ui text-body-ui disabled:opacity-40 flex items-center gap-2"
            >
              {initializeMutation.isPending ? (
                <span className="material-symbols-outlined animate-spin text-[16px]">refresh</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
              )}
              {initializeMutation.isPending ? "Preparing…" : "Move to Workspace"}
            </button>
          </div>
        </div>
      </div>

      {/* Pinned concepts sidebar */}
      <aside className="hidden md:flex flex-col w-72 shrink-0 border border-muted-border rounded-xl bg-surface-container-low/40 overflow-hidden h-fit sticky top-0">
        <div className="p-3 border-b border-muted-border/60">
          <p className="font-label-caps text-[10px] uppercase tracking-widest text-sage-slate">
            Core Concepts extracted: {pins.length}
          </p>
          <p className="font-caption text-caption text-sage-slate mt-1">
            Select text in a chat message and pin it. Pinned concepts are promoted when you
            initialize the working agent.
          </p>
        </div>
        <div className="p-2 space-y-2 max-h-[50vh] overflow-y-auto ink-scrollbar">
          {pins.length === 0 && (
            <p className="font-caption text-caption text-sage-slate italic p-2">Nothing pinned yet.</p>
          )}
          {pins.map((pin) => (
            <div key={pin.id} className="group flex items-start gap-2 bg-paper-base border border-muted-border rounded-lg p-2.5">
              <span className="material-symbols-outlined text-[16px] text-stationery-amber shrink-0 mt-0.5">
                push_pin
              </span>
              <p className="flex-1 font-body-ui text-body-ui text-ink-charcoal text-[13px] whitespace-pre-wrap break-words line-clamp-4">
                {pin.text}
              </p>
              <button
                onClick={() => removePin(pin.id)}
                className="opacity-0 group-hover:opacity-100 text-sage-slate hover:text-error transition-all p-0.5 shrink-0"
                title="Unpin"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-muted-border/60">
          <p className="font-caption text-caption text-sage-slate">
            Tip: pins are saved as <span className="font-mono">core_directive</span> memory and the
            compiled brief as <span className="font-mono">project_brief</span> — the main agent
            reads them automatically.
          </p>
        </div>
      </aside>

      <AIGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}