import { useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Bug, X, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Level = "info" | "warn" | "error";

function LevelBadge({ level }: { level: Level }) {
  if (level === "error") {
    return (
      <Badge className="bg-[#ffdad6] text-[#93000a] border-[#ffdad6] font-[Inter]">
        error
      </Badge>
    );
  }
  if (level === "warn") {
    return (
      <Badge className="bg-[#fff0d9] text-[#7a4d00] border-[#fff0d9] font-[Inter]">
        warn
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-[#6B705C]/30 text-[#6B705C] font-[Inter]">
      info
    </Badge>
  );
}

const LEVELS: { label: string; value: Level | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Errors", value: "error" },
  { label: "Warnings", value: "warn" },
  { label: "Info", value: "info" },
];

export default function MonitoringErrors() {
  const [level, setLevel] = useState<Level | "all">("error");
  const [requestId, setRequestId] = useState("");
  const [userIdInput, setUserIdInput] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const userId = useMemo(() => {
    const n = parseInt(userIdInput, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [userIdInput]);

  const { data, isLoading, isError, refetch } = trpc.admin.monitoring.system.list.useQuery(
    {
      page,
      pageSize: 50,
      level: level === "all" ? undefined : level,
      requestId: requestId.trim() || undefined,
      userId,
      path: pathInput.trim() || undefined,
      message: messageInput.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    },
    { placeholderData: (prev) => prev, refetchInterval: 30_000 }
  );

  const rows = data?.rows ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  const hasFilters =
    level !== "all" ||
    requestId.trim() !== "" ||
    userIdInput.trim() !== "" ||
    pathInput.trim() !== "" ||
    messageInput.trim() !== "" ||
    dateFrom !== "" ||
    dateTo !== "";

  function clearFilters() {
    setLevel("error");
    setRequestId("");
    setUserIdInput("");
    setPathInput("");
    setMessageInput("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <div className="p-6 space-y-6 bg-[#FDFCFB] min-h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-[#93000a]" />
            <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">
              System Logs
            </h1>
          </div>
          <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">
            Server errors, warnings, and operational messages.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#4d4540] font-[Inter] font-medium">Level</span>
          <div className="flex rounded-md border border-[#E5E2DE] bg-[#F5F0EB] p-0.5 gap-0.5">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => {
                  setLevel(l.value);
                  setPage(1);
                }}
                className={[
                  "px-3 py-1.5 rounded text-xs font-[Inter] transition-colors",
                  level === l.value
                    ? "bg-white text-[#2D2926] shadow-sm font-medium"
                    : "text-[#7e756f] hover:text-[#2D2926]",
                ].join(" ")}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#4d4540] font-[Inter] font-medium">Request ID</span>
          <Input
            value={requestId}
            onChange={(e) => {
              setRequestId(e.target.value);
              setPage(1);
            }}
            placeholder="x-request-id"
            className="h-9 w-56 border-[#E5E2DE] bg-white font-[Inter]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#4d4540] font-[Inter] font-medium">User ID</span>
          <Input
            type="number"
            value={userIdInput}
            onChange={(e) => {
              setUserIdInput(e.target.value);
              setPage(1);
            }}
            placeholder="All"
            className="h-9 w-32 border-[#E5E2DE] bg-white font-[Inter]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#4d4540] font-[Inter] font-medium">Path</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7e756f]" />
            <Input
              value={pathInput}
              onChange={(e) => {
                setPathInput(e.target.value);
                setPage(1);
              }}
              placeholder="/api/trpc"
              className="h-9 w-56 pl-9 border-[#E5E2DE] bg-white font-[Inter]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#4d4540] font-[Inter] font-medium">Message</span>
          <Input
            value={messageInput}
            onChange={(e) => {
              setMessageInput(e.target.value);
              setPage(1);
            }}
            placeholder="Contains…"
            className="h-9 w-56 border-[#E5E2DE] bg-white font-[Inter]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#4d4540] font-[Inter] font-medium">From</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="h-9 w-40 border-[#E5E2DE] bg-white font-[Inter]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#4d4540] font-[Inter] font-medium">To</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="h-9 w-40 border-[#E5E2DE] bg-white font-[Inter]"
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 text-[#7e756f] hover:text-[#2D2926] hover:bg-[#f0ede9] font-[Inter] gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="destructive" className="border-[#ffdad6] bg-[#fff8f7]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-[#93000a]">Failed to load system logs</AlertTitle>
          <AlertDescription className="text-[#93000a]/80">
            <span>Could not fetch system logs.</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-2 border-[#93000a]/30 text-[#93000a] hover:bg-[#ffdad6]/40"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#E5E2DE] bg-white py-16 text-center">
          <p className="text-[#4d4540] font-[Inter] font-medium">No logs found.</p>
          {hasFilters && (
            <p className="mt-1 text-sm text-[#7e756f] font-[Inter]">
              Try adjusting or clearing the filters.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <details
              key={r.id}
              className="rounded-lg border border-[#E5E2DE] bg-white px-4 py-3 shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <LevelBadge level={r.level as Level} />
                      <span className="text-sm text-[#2D2926] font-[Inter] font-medium truncate">
                        {r.message}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[#7e756f] font-[Inter] flex flex-wrap gap-x-3 gap-y-1">
                      <span className="tabular-nums">{new Date(r.createdAt).toLocaleString()}</span>
                      {r.path && <span className="font-mono truncate max-w-[520px]">{r.path}</span>}
                      {r.userId && <span className="tabular-nums">user {r.userId}</span>}
                      {r.requestId && <span className="font-mono truncate">rid {r.requestId}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-[#b0a89f] font-[Inter] shrink-0">Details</span>
                </div>
              </summary>
              <div className="mt-3 border-t border-[#E5E2DE] pt-3 space-y-2">
                {r.context != null && (
                  <pre className="text-xs text-[#4d4540] bg-[#FDFCFB] border border-[#E5E2DE] rounded-md p-3 overflow-x-auto">
                    {JSON.stringify(r.context, null, 2) ?? ""}
                  </pre>
                )}
                {r.stack != null && (
                  <pre className="text-xs text-[#4d4540] bg-[#FDFCFB] border border-[#E5E2DE] rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                    {String(r.stack)}
                  </pre>
                )}
              </div>
            </details>
          ))}
        </div>
      )}

      {!isLoading && data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#7e756f] font-[Inter]">
            Page {page} of {totalPages} &mdash;{" "}
            <span className="text-[#4d4540]">{data.total.toLocaleString()} logs</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-[#E5E2DE] text-[#4d4540] hover:bg-[#FDFCFB] font-[Inter]"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-[#E5E2DE] text-[#4d4540] hover:bg-[#FDFCFB] font-[Inter]"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
