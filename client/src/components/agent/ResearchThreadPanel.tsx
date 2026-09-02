import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { runAgentStream, type ChatSessionDto, type ChatMessageDto } from "@/lib/agentSse";
import { TimelineEntry, Entry, nextEntryId, formatArgs, toastInfo } from "./chatShared";

export function ResearchThreadPanel({
  projectId,
  thread,
  onClosed,
}: {
  projectId: number;
  thread: ChatSessionDto;
  onClosed: () => void;
}) {
  const utils = trpc.useUtils();
  const [messages, setMessages] = useState<ChatMessageDto[]>(thread.messages ?? []);
  const [live, setLive] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [busyAction, setBusyAction] = useState<"synthesize" | "discard" | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const updateMessagesMutation = trpc.agent.sessions.updateMessages.useMutation();
  const synthesizeMutation = trpc.agent.sessions.synthesize.useMutation();
  const discardMutation = trpc.agent.sessions.discard.useMutation();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, live]);

  const persist = async (msgs: ChatMessageDto[]) => {
    await updateMessagesMutation.mutateAsync({ sessionId: thread.id, messages: msgs });
    await utils.agent.sessions.list.invalidate();
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || isRunning) return;
    setMessages((prev) => [...prev, { role: "user", content: prompt, createdAt: new Date().toISOString() }]);
    setInput("");
    setIsRunning(true);
    setLive([]);

    const controller = new AbortController();
    abortRef.current = controller;
    const toolCalls: NonNullable<ChatMessageDto["toolCalls"]> = [];

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
          sessionId: thread.id, // history comes from the isolated thread session
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
              toolCalls.push({ name: event.name, args: event.args });
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
              toolCalls.forEach((tc) => {
                if (tc.name === event.name && !tc.summary) tc.summary = event.summary;
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
          text: error instanceof Error ? error.message : "Agent run failed",
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
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          createdAt: new Date().toISOString(),
        });
      }
      setMessages(finalMessages);
      // The streamed assistant bubble is now persisted in `messages` —
      // remove it from the live timeline so it doesn't render twice.
      setLive((prev) => prev.filter((e) => e.kind !== "assistant"));
      await persist(finalMessages).catch(() => {
        setLive((prev) => [
          ...prev,
          { id: nextEntryId(), kind: "error", text: "Failed to persist the thread." },
        ]);
      });
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  const handleSynthesize = async () => {
    if (busyAction) return;
    setBusyAction("synthesize");
    try {
      const res = await synthesizeMutation.mutateAsync({ sessionId: thread.id });
      toastInfo("Research thread synthesized & merged into the main chat");
      await utils.agent.sessions.list.invalidate();
      await utils.agent.sessions.get.invalidate({ sessionId: res.mainSessionId });
      onClosed();
    } catch (error) {
      toastInfo(error instanceof Error ? error.message : "Synthesis failed");
      setBusyAction(null);
    }
  };

  const handleDiscard = async () => {
    if (busyAction) return;
    setBusyAction("discard");
    try {
      await discardMutation.mutateAsync({ sessionId: thread.id });
      toastInfo("Research thread discarded");
      await utils.agent.sessions.list.invalidate();
      onClosed();
    } catch (error) {
      toastInfo(error instanceof Error ? error.message : "Discard failed");
      setBusyAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full min-w-0">
      {/* Header with actions */}
      <div className="flex items-center justify-between gap-3 border-b border-muted-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-stationery-amber">travel_explore</span>
            <h3 className="font-headline-md text-headline-md text-ink-charcoal truncate">{thread.title}</h3>
          </div>
          <p className="font-caption text-caption text-sage-slate truncate mt-0.5">
            Isolated research thread — conclusions can be merged back into the main chat.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => void handleDiscard()}
            disabled={busyAction !== null || isRunning}
            className="px-4 py-2 rounded border border-muted-border text-sage-slate hover:border-error hover:text-error transition-colors font-body-ui text-body-ui disabled:opacity-50"
          >
            {busyAction === "discard" ? "Discarding…" : "Discard"}
          </button>
          <button
            onClick={() => void handleSynthesize()}
            disabled={busyAction !== null || isRunning || messages.length === 0}
            className="px-4 py-2 rounded bg-stationery-amber text-ink-charcoal hover:opacity-90 transition-colors font-body-ui text-body-ui disabled:opacity-50 flex items-center gap-2"
          >
            {busyAction === "synthesize" ? (
              <span className="material-symbols-outlined animate-spin text-[16px]">refresh</span>
            ) : (
              <span className="material-symbols-outlined text-[16px]">merge</span>
            )}
            Synthesize &amp; Merge to Main
          </button>
        </div>
      </div>

      {/* Isolation banner */}
      <div className="border border-violet-200 bg-violet-50 rounded-lg px-4 py-2.5 font-body-ui text-body-ui text-violet-900 text-sm">
        <span className="material-symbols-outlined text-[16px] align-middle mr-1.5">info</span>
        You are exploring a tangent branched from the main project. Fact-check, evaluate, and
        iterate freely. Context here is isolated — the main chat is untouched until you merge.
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto ink-scrollbar pr-1 min-h-0">
        {messages.map((msg, index) => (
          <TimelineEntry key={`m-${index}`} kind={msg.role} text={msg.content} toolCalls={msg.toolCalls} />
        ))}
        {live.map((entry) => (
          <TimelineEntry key={entry.id} entry={entry} />
        ))}
      </div>

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
          placeholder="Explore the tangent…"
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
    </div>
  );
}