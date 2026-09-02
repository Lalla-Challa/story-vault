import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { trpc } from "@/lib/trpc";
import { runAgentStream, normalizeSession, type ProposalDto, type ChatSessionDto, type ChatMessageDto } from "@/lib/agentSse";
import { ProposalCard } from "./ProposalCard";
import { AgentSettingsDialog } from "./AgentSettingsDialog";
import { AgentMemoryPanel } from "./AgentMemoryPanel";
import { AIGuideDialog } from "./AIGuideDialog";
import { ResearchThreadPanel } from "./ResearchThreadPanel";
import { Entry, nextEntryId, TimelineEntry, formatArgs, toastInfo } from "./chatShared";
import { cn } from "@/lib/utils";

export function AgentWorkspace({
  projectId,
  initialResearchThreadId,
  onResearchThreadConsumed,
}: {
  projectId: number;
  /** When set (e.g. from the Idea Vault's "Evaluate with AI"), opens this research thread. */
  initialResearchThreadId?: number | null;
  /** Called after the initialResearchThreadId has been consumed (so the parent can clear it). */
  onResearchThreadConsumed?: () => void;
}) {
  const utils = trpc.useUtils();

  // ── Sessions ──────────────────────────────────────────────────────────────
  const { data: rawSessions, refetch: refetchSessions } = trpc.agent.sessions.list.useQuery(
    { projectId },
    { enabled: true }
  );
  const sessions = useMemo(
    () =>
      (rawSessions ?? [])
        .map((s) => normalizeSession(s as Record<string, unknown>))
        .filter((s): s is ChatSessionDto => s !== null),
    [rawSessions]
  );

  const mainSessions = useMemo(() => sessions.filter((s) => s.type !== "research"), [sessions]);
  const researchThreads = useMemo(() => sessions.filter((s) => s.type === "research" && s.status === "active"), [sessions]);

  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [openResearchThreadId, setOpenResearchThreadId] = useState<number | null>(null);
  const createSessionMutation = trpc.agent.sessions.create.useMutation();
  const deleteSessionMutation = trpc.agent.sessions.delete.useMutation();
  const branchMutation = trpc.agent.sessions.branch.useMutation();
  const createResearchMutation = trpc.agent.sessions.createResearchThread.useMutation();
  const updateMessagesMutation = trpc.agent.sessions.updateMessages.useMutation();

  const openResearchThread = useMemo(
    () => (openResearchThreadId ? sessions.find((s) => s.id === openResearchThreadId) ?? null : null),
    [sessions, openResearchThreadId]
  );

  // ── Conversation state ────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [live, setLive] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [sceneId, setSceneId] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(
    () => (sessions ?? []).find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const { data: scenes } = trpc.scene.list.useQuery({ projectId });
  const { data: proposals, refetch: refetchProposals } = trpc.agent.proposals.list.useQuery(
    { projectId },
    { enabled: isRunning === false }
  );
  const pendingProposals = useMemo(
    () => (proposals ?? []).filter((p) => p.status === "pending"),
    [proposals]
  );

  const loadSession = useCallback((session: ChatSessionDto | null) => {
    setActiveSessionId(session?.id ?? null);
    setMessages(session?.messages ?? []);
    setLive([]);
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  useEffect(() => {
    if (sessions && sessions.length > 0 && activeSessionId === null && !openResearchThreadId) {
      const first = sessions[0];
      if (first) {
        setActiveSessionId(first.id);
        setMessages(first.messages ?? []);
        setLive([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  // Open a research thread requested externally (e.g. Idea Vault → Evaluate with AI).
  useEffect(() => {
    if (initialResearchThreadId != null) {
      setOpenResearchThreadId(initialResearchThreadId);
      onResearchThreadConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResearchThreadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, live]);

  // ── Sending / running ─────────────────────────────────────────────────────
  const persistMessages = async (sessionId: number, msgs: ChatMessageDto[]) => {
    await updateMessagesMutation.mutateAsync({ sessionId, messages: msgs });
    await refetchSessions();
  };

  const runSend = async (prompt: string, sessionId: number, isNew: boolean) => {
    setIsRunning(true);
    setLive([]);

    const controller = new AbortController();
    abortRef.current = controller;
    const toolCallsForAssistant: NonNullable<ChatMessageDto["toolCalls"]> = [];

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
        {
          projectId,
          prompt,
          sessionId,
          sceneId: sceneId ? parseInt(sceneId, 10) : undefined,
        },
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
            case "tool_call":
              appendLive({ id: nextEntryId(), kind: "tool", name: event.name, argsLabel: formatArgs(event.args) });
              toolCallsForAssistant.push({ name: event.name, args: event.args });
              break;
            case "tool_result":
              setLive((prev) => {
                for (let i = prev.length - 1; i >= 0; i--) {
                  const entry = prev[i];
                  if (entry.kind === "tool" && entry.name === event.name && entry.result === undefined) {
                    const next = [...prev];
                    next[i] = { ...entry, result: event.summary };
                    return next;
                  }
                }
                return prev;
              });
              toolCallsForAssistant.forEach((tc) => {
                if (tc.name === event.name && !tc.summary) tc.summary = event.summary;
              });
              break;
            case "proposal":
              appendLive({ id: nextEntryId(), kind: "proposal", proposal: event.proposal });
              void refetchProposals();
              break;
            case "subtask_start":
              appendLive({ id: nextEntryId(), kind: "subtask", subId: event.id, description: event.description, status: "running" });
              break;
            case "subtask_end":
              setLive((prev) =>
                prev.map((e) => (e.kind === "subtask" && e.subId === event.id ? { ...e, status: "done" as const } : e))
              );
              break;
            case "suggest_research_thread":
              appendLive({
                id: nextEntryId(),
                kind: "suggestion",
                topic: event.topic,
                reason: event.reason,
                status: "pending" as const,
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
      if ((error as Error)?.name === "AbortError") {
        appendLive({ id: nextEntryId(), kind: "info", text: "Run stopped." });
      } else {
        appendLive({ id: nextEntryId(), kind: "error", text: error instanceof Error ? error.message : "Agent run failed" });
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
          toolCalls: toolCallsForAssistant.length > 0 ? toolCallsForAssistant : undefined,
          createdAt: new Date().toISOString(),
        });
      }
      setMessages(finalMessages);
      // The streamed assistant bubble is now persisted in `messages` —
      // remove it from the live timeline so it doesn't render twice.
      setLive((prev) => prev.filter((e) => e.kind !== "assistant"));
      if (sessionId) await persistMessages(sessionId, finalMessages).catch(() => {});
      setIsRunning(false);
      abortRef.current = null;
      await refetchProposals();
    }
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || isRunning) return;
    setMessages((prev) => [...prev, { role: "user", content: prompt, createdAt: new Date().toISOString() }]);
    setInput("");

    let sessionId = activeSessionId;
    let isNew = false;
    if (!sessionId) {
      try {
        const created = await createSessionMutation.mutateAsync({ projectId });
        sessionId = created.id;
        setActiveSessionId(sessionId);
        isNew = true;
      } catch {
        setLive([{ id: nextEntryId(), kind: "error", text: "Failed to create a chat session." }]);
        return;
      }
    }
    await runSend(prompt, sessionId, isNew);
  };

  const handleStop = () => abortRef.current?.abort();
  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setLive([]);
  };

  const handleDeleteSession = async (sessionId: number) => {
    await deleteSessionMutation.mutateAsync({ sessionId });
    await refetchSessions();
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
      setLive([]);
    }
  };

  const handleBranch = async (messageIndex: number) => {
    if (!activeSessionId) return;
    try {
      const branch = await branchMutation.mutateAsync({ parentSessionId: activeSessionId, parentMessageId: messageIndex });
      await refetchSessions();
      const normalized = normalizeSession(branch as Record<string, unknown>);
      loadSession(normalized);
      toastInfo("Branched — new parallel chat created.");
    } catch (error) {
      setLive((prev) => [...prev, { id: nextEntryId(), kind: "error", text: error instanceof Error ? error.message : "Branch failed" }]);
    }
  };

  const handleResearchBranch = async (messageIndex: number) => {
    if (!activeSessionId) return;
    try {
      const res = await createResearchMutation.mutateAsync({
        projectId,
        parentSessionId: activeSessionId,
        parentMessageId: messageIndex,
      });
      await refetchSessions();
      setOpenResearchThreadId(res.id);
      toastInfo("Research thread opened — explore freely below.");
    } catch (error) {
      setLive((prev) => [...prev, { id: nextEntryId(), kind: "error", text: error instanceof Error ? error.message : "Failed to create research thread" }]);
    }
  };

  const handleSuggestionOpen = async (topic: string, reason: string) => {
    if (!activeSessionId) return;
    const idx = messages.length - 1;
    if (idx < 0) return;
    try {
      const res = await createResearchMutation.mutateAsync({
        projectId,
        parentSessionId: activeSessionId,
        parentMessageId: idx,
      });
      await refetchSessions();
      setOpenResearchThreadId(res.id);
      // Remove the suggestion card from the timeline
      setLive((prev) => prev.filter((e) => e.kind !== "suggestion" || (e.topic !== topic && e.reason !== reason)));
      toastInfo(`Research thread "${topic}" opened.`);
    } catch (error) {
      toastInfo(error instanceof Error ? error.message : "Failed to open research thread");
    }
  };

  const handleSuggestionDismiss = (topic: string) => {
    setLive((prev) => prev.filter((e) => e.kind !== "suggestion" || e.topic !== topic));
  };

  const onProposalResolved = (id: number, status: "accepted" | "rejected") => {
    setLive((prev) =>
      prev.map((e) =>
        e.kind === "proposal" && e.proposal.id === id ? { ...e, proposal: { ...e.proposal, status } } : e
      )
    );
    void refetchProposals();
  };

  const closeResearchThread = () => {
    setOpenResearchThreadId(null);
    void refetchSessions();
    // Reload the current main session to pick up any merged summary
    if (activeSessionId) {
      const s = sessions.find((x) => x.id === activeSessionId);
      if (s) loadSession(s);
    }
  };

  // Suggestion card entry
  type SuggestionEntry = Entry & { kind: "suggestion"; topic: string; reason: string; status: "pending" | "dismissed" };

  return (
    <div className="flex gap-5 w-full h-full min-h-0">
      {/* Session sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border border-muted-border rounded-xl bg-surface-container-low/40 overflow-hidden">
        <div className="p-3 border-b border-muted-border/60 flex items-center justify-between">
          <span className="font-label-caps text-[10px] uppercase tracking-widest text-sage-slate">Chats</span>
          <button onClick={handleNewChat} title="New chat" className="text-sage-slate hover:text-ink-charcoal transition-colors p-1">
            <span className="material-symbols-outlined text-[18px]">add_comment</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto ink-scrollbar p-1.5 space-y-0.5">
          {mainSessions.length === 0 && (
            <p className="font-caption text-caption text-sage-slate p-2 italic">No chats yet.</p>
          )}
          {mainSessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={activeSessionId === s.id}
              onSelect={() => { setOpenResearchThreadId(null); loadSession(s); }}
              onDelete={() => void handleDeleteSession(s.id)}
            />
          ))}
          {researchThreads.length > 0 && (
            <>
              <div className="pt-3 pb-1 px-2 font-label-caps text-[9px] uppercase tracking-widest text-sage-slate/70">
                Research threads
              </div>
              {researchThreads.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={openResearchThreadId === s.id}
                  onSelect={() => setOpenResearchThreadId(s.id)}
                  onDelete={() => void handleDeleteSession(s.id)}
                />
              ))}
            </>
          )}
        </div>
      </aside>

      {/* Main chat column */}
      <div className="flex flex-col gap-4 flex-1 min-w-0 h-full min-h-0">
        {openResearchThread && openResearchThreadId ? (
          /* Split screen: read-only main chat left, research thread right */
          <PanelGroup direction="horizontal" className="flex-1 min-h-0">
            <Panel defaultSize={40} minSize={25} className="overflow-y-auto ink-scrollbar pr-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between sticky top-0 bg-surface pb-2 z-10">
                  <h3 className="font-label-caps text-[10px] uppercase tracking-widest text-sage-slate">Main chat (read-only)</h3>
                  <button
                    onClick={() => setOpenResearchThreadId(null)}
                    className="text-xs text-sage-slate hover:text-ink-charcoal transition-colors"
                  >
                    Close
                  </button>
                </div>
                {messages.map((msg, i) => (
                  <TimelineEntry key={i} kind={msg.role} text={msg.content} toolCalls={msg.toolCalls} />
                ))}
              </div>
            </Panel>
            <PanelResizeHandle className="w-1.5 bg-muted-border rounded-full cursor-col-resize hover:bg-stationery-amber transition-colors mx-2" />
            <Panel defaultSize={60} minSize={30}>
              <ResearchThreadPanel projectId={projectId} thread={openResearchThread} onClosed={closeResearchThread} />
            </Panel>
          </PanelGroup>
        ) : (
          /* Normal full-width chat */
          <>
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display-hero text-display-hero text-ink-charcoal">Agent</h2>
                <p className="font-body-ui text-body-ui text-sage-slate mt-1 truncate">
                  {activeSession ? `Chat: ${activeSession.title}` : "New chat"}
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
                  onClick={() => setMemoryOpen(true)}
                  title="Project memory"
                  className="flex items-center gap-2 text-sage-slate hover:text-ink-charcoal transition-colors px-3 py-2 rounded-lg border border-muted-border bg-surface-container-low/40"
                >
                  <span className="material-symbols-outlined text-[18px]">database</span>
                  <span className="font-label-caps text-[10px] uppercase tracking-widest hidden lg:inline">
                    Memory
                  </span>
                </button>
                <button
                  onClick={() => setSettingsOpen(true)}
                  title="AI Settings"
                  className="flex items-center gap-2 text-sage-slate hover:text-ink-charcoal transition-colors px-3 py-2 rounded-lg border border-muted-border bg-surface-container-low/40"
                >
                  <span className="material-symbols-outlined text-[18px]">tune</span>
                  <span className="font-label-caps text-[10px] uppercase tracking-widest hidden lg:inline">
                    AI Settings
                  </span>
                </button>
                <AgentModeBadge projectId={projectId} />
              </div>
            </div>
            <div className="md:hidden flex items-center gap-2">
              <select value={activeSessionId ?? ""} onChange={(e) => { const sid = e.target.value ? Number(e.target.value) : null; const s = mainSessions.find((x) => x.id === sid) ?? null; loadSession(s); }} className="flex-1 bg-surface-container-low border border-muted-border rounded px-3 py-1.5 font-body-ui text-body-ui text-ink-charcoal">
                <option value="">New chat</option>
                {mainSessions.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.parentId ? "↳ " : ""}{s.title}</option>
                ))}
              </select>
              <button onClick={handleNewChat} className="px-3 py-1.5 rounded border border-muted-border text-sage-slate font-body-ui">+ New</button>
            </div>
            <div className="flex items-center gap-3">
              <label className="font-caption text-caption text-sage-slate">Focus:</label>
              <select value={sceneId} onChange={(e) => setSceneId(e.target.value)} className="bg-surface-container-low border border-muted-border rounded px-3 py-1.5 font-body-ui text-body-ui text-ink-charcoal">
                <option value="">Whole project</option>
                {(scenes ?? []).map((s) => (<option key={s.id} value={String(s.id)}>{s.title}</option>))}
              </select>
            </div>
            {pendingProposals.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-label-caps text-label-caps uppercase tracking-widest text-sage-slate">Pending proposals</h3>
                {pendingProposals.map((p) => (<ProposalCard key={p.id} proposal={p} onResolved={onProposalResolved} />))}
              </div>
            )}
            <div ref={scrollRef} className="space-y-4 flex-1 min-h-0 overflow-y-auto ink-scrollbar pr-1 pb-4">
              {messages.length === 0 && live.length === 0 && (
                <div className="text-center py-12 text-sage-slate">
                  <span className="material-symbols-outlined text-[48px] opacity-30 mb-2 block">auto_awesome</span>
                  <p className="font-body-writing italic">Ask me to outline a chapter, rewrite a scene, fix continuity, or expand a character moment…</p>
                </div>
              )}
              {messages.map((msg, index) => (
                <TimelineEntry
                  key={`m-${index}`}
                  kind={msg.role}
                  text={msg.content}
                  toolCalls={msg.toolCalls}
                  showBranch={!isRunning}
                  onBranch={() => void handleBranch(index)}
                  showResearchBranch={!isRunning}
                  onResearchBranch={() => void handleResearchBranch(index)}
                />
              ))}
              {live.map((entry) => {
                if (entry.kind === "suggestion") {
                  const s = entry as SuggestionEntry;
                  return (
                    <div key={entry.id} className="border border-violet-200 rounded-xl p-4 space-y-3 bg-violet-50/80">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-[20px] text-violet-700 shrink-0 mt-0.5">travel_explore</span>
                        <div className="space-y-1">
                          <p className="font-body-ui text-body-ui text-ink-charcoal font-medium">AI suggests opening a Research Thread</p>
                          <p className="font-headline-md text-headline-md text-violet-900">{s.topic}</p>
                          <p className="font-caption text-caption text-sage-slate">{s.reason}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleSuggestionDismiss(s.topic)} className="px-4 py-1.5 rounded border border-muted-border text-sage-slate hover:text-ink-charcoal transition-colors font-body-ui text-body-ui text-sm">Dismiss</button>
                        <button onClick={() => void handleSuggestionOpen(s.topic, s.reason)} className="px-4 py-1.5 rounded bg-stationery-amber text-ink-charcoal font-body-ui text-body-ui text-sm hover:opacity-90 transition-colors">Open thread</button>
                      </div>
                    </div>
                  );
                }
                return <TimelineEntry key={entry.id} entry={entry as Entry} />;
              })}
            </div>
            <div className="sticky bottom-0 bg-surface/95 backdrop-blur pt-3 pb-2">
              <div className="flex items-end gap-2 border border-muted-border rounded-xl bg-paper-base p-2 shadow-sm focus-within:ring-1 focus-within:ring-stationery-amber">
                <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }} rows={2} placeholder="Describe what you want to write or fix…" disabled={isRunning} className="flex-1 bg-transparent border-none outline-none resize-none font-body-writing text-body-writing text-ink-charcoal placeholder:text-sage-slate/50 px-2 py-1" />
                {isRunning ? (
                  <button onClick={handleStop} className="shrink-0 px-4 py-2 rounded-lg border border-error/40 text-error hover:bg-error-container/50 transition-colors font-body-ui text-body-ui flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">stop</span>Stop</button>
                ) : (
                  <button onClick={() => void handleSend()} disabled={!input.trim()} className="shrink-0 px-5 py-2 rounded-lg bg-ink-charcoal text-paper-base hover:bg-primary-container transition-colors font-body-ui text-body-ui disabled:opacity-40 flex items-center gap-2"><span>Send</span><span className="material-symbols-outlined text-[18px]">arrow_upward</span></button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <AgentSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AgentMemoryPanel projectId={projectId} open={memoryOpen} onOpenChange={setMemoryOpen} />
      <AIGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}

function SessionRow({ session, active, onSelect, onDelete }: { session: ChatSessionDto; active: boolean; onSelect: () => void; onDelete: () => void }) {
  const isResearch = session.type === "research";
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors",
        active ? "bg-paper-base text-ink-charcoal shadow-sm font-medium" : "text-sage-slate hover:bg-surface-container-high"
      )}
      onClick={onSelect}
    >
      <span className="material-symbols-outlined text-[16px] shrink-0">
        {isResearch ? "travel_explore" : session.parentId ? "fork_right" : "chat_bubble_outline"}
      </span>
      <span className="flex-1 truncate font-body-ui text-[13px]">{session.title}</span>
      {session.status === "merged" && <span className="text-[10px] text-emerald-600 font-label-caps">Merged</span>}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 text-sage-slate hover:text-error transition-all p-0.5"
        title="Delete"
      >
        <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>
  );
}
/**
 * CCM agent mode indicator — shows whether the LLM runs in observer mode
 * (read-only, canon untouched) or baked_in mode (engine-validated proposals).
 * Clicking toggles the per-project setting.
 */
function AgentModeBadge({ projectId }: { projectId: number }) {
  const utils = trpc.useUtils();
  const { data } = trpc.agent.mode.get.useQuery({ projectId });
  const setMode = trpc.agent.mode.set.useMutation({
    onSuccess: () => {
      utils.agent.mode.get.invalidate();
      toastInfo(data?.mode === "baked_in" ? "Agent switched to observer mode — read-only, canon untouched." : "Agent switched to baked-in mode — proposals are engine-validated.");
    },
    onError: (e) => toastInfo(e.message || "Failed to switch mode"),
  });

  const mode = data?.mode ?? "observer";
  const baked = mode === "baked_in";

  return (
    <button
      onClick={() => setMode.mutate({ projectId, mode: baked ? "observer" : "baked_in" })}
      title={baked ? "Baked-in mode: the LLM proposes state changes the engine validates. Click to switch to observer (read-only)." : "Observer mode: the LLM reads everything but cannot write canon. Click to switch to baked-in (engine-validated proposals)."}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[10px] font-label-caps uppercase tracking-widest transition-colors ${
        baked
          ? "bg-stationery-amber/15 border-stationery-amber/40 text-stationery-amber hover:bg-stationery-amber/25"
          : "bg-surface-container-low/40 border-muted-border text-sage-slate hover:text-ink-charcoal"
      }`}
    >
      <span className="material-symbols-outlined text-[15px]">{baked ? "psychology" : "visibility"}</span>
      <span className="hidden xl:inline">{baked ? "Baked-in" : "Observer"}</span>
    </button>
  );
}
