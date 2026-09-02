import { useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 50;

function StatusBadge({ status }: { status: number }) {
  if (status >= 500) {
    return (
      <Badge className="bg-[#ffdad6] text-[#93000a] border-[#ffdad6] font-[Inter]">
        {status}
      </Badge>
    );
  }
  if (status >= 400) {
    return (
      <Badge className="bg-[#fff0d9] text-[#7a4d00] border-[#fff0d9] font-[Inter]">
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-[#6B705C]/30 text-[#6B705C] font-[Inter]">
      {status}
    </Badge>
  );
}

export default function MonitoringRequests() {
  const [page, setPage] = useState(1);
  const [requestId, setRequestId] = useState("");
  const [userIdInput, setUserIdInput] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [statusMin, setStatusMin] = useState("");
  const [statusMax, setStatusMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const userId = useMemo(() => {
    const n = parseInt(userIdInput, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [userIdInput]);

  const statusMinN = useMemo(() => {
    const n = parseInt(statusMin, 10);
    return Number.isFinite(n) ? n : undefined;
  }, [statusMin]);

  const statusMaxN = useMemo(() => {
    const n = parseInt(statusMax, 10);
    return Number.isFinite(n) ? n : undefined;
  }, [statusMax]);

  const { data, isLoading, isError, refetch } =
    trpc.admin.monitoring.requests.list.useQuery(
      {
        page,
        pageSize: PAGE_SIZE,
        requestId: requestId.trim() || undefined,
        userId,
        path: pathInput.trim() || undefined,
        statusMin: statusMinN,
        statusMax: statusMaxN,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
      { placeholderData: (prev) => prev, refetchInterval: 30_000 }
    );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const rows = data?.rows ?? [];

  const hasFilters =
    requestId.trim() !== "" ||
    userIdInput.trim() !== "" ||
    pathInput.trim() !== "" ||
    statusMin.trim() !== "" ||
    statusMax.trim() !== "" ||
    dateFrom !== "" ||
    dateTo !== "";

  function clearFilters() {
    setRequestId("");
    setUserIdInput("");
    setPathInput("");
    setStatusMin("");
    setStatusMax("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <div className="p-6 space-y-6 bg-[#FDFCFB] min-h-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">
          Request Logs
        </h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">
          API request history with latency and correlation IDs.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#4d4540] font-[Inter] font-medium">
            Request ID
          </span>
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
          <span className="text-xs text-[#4d4540] font-[Inter] font-medium">Status</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={statusMin}
              onChange={(e) => {
                setStatusMin(e.target.value);
                setPage(1);
              }}
              placeholder="Min"
              className="h-9 w-24 border-[#E5E2DE] bg-white font-[Inter]"
            />
            <Input
              type="number"
              value={statusMax}
              onChange={(e) => {
                setStatusMax(e.target.value);
                setPage(1);
              }}
              placeholder="Max"
              className="h-9 w-24 border-[#E5E2DE] bg-white font-[Inter]"
            />
          </div>
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
          <AlertTitle className="text-[#93000a]">Failed to load request logs</AlertTitle>
          <AlertDescription className="text-[#93000a]/80">
            <span>Could not fetch request logs.</span>
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

      <div className="rounded-lg border border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)] overflow-hidden">
        <Table>
          <TableHeader className="bg-[#FDFCFB]">
            <TableRow className="border-[#E5E2DE]">
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">
                Time
              </TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">
                Method
              </TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">
                Path
              </TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">
                Status
              </TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide text-right">
                Latency
              </TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">
                User
              </TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">
                Request ID
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-[#E5E2DE]">
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full rounded-md" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-[#7e756f] font-[Inter]">
                  No request logs found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="border-[#E5E2DE] hover:bg-[#FDFCFB] transition-colors"
                >
                  <TableCell className="text-xs text-[#7e756f] font-[Inter] tabular-nums whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-[#4d4540] font-[Inter] font-medium">
                    {r.method}
                  </TableCell>
                  <TableCell className="text-xs text-[#2D2926] font-[Inter] max-w-[520px] truncate">
                    {r.path}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-xs text-[#4d4540] font-[Inter] tabular-nums text-right">
                    {r.durationMs.toLocaleString()} ms
                  </TableCell>
                  <TableCell className="text-xs text-[#7e756f] font-[Inter] tabular-nums">
                    {r.userId ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-[#7e756f] font-[Inter] font-mono">
                    {r.requestId}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#7e756f] font-[Inter]">
            Page {page} of {totalPages} &mdash;{" "}
            <span className="text-[#4d4540]">{data.total.toLocaleString()} requests</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-[#E5E2DE] text-[#4d4540] hover:bg-[#FDFCFB] font-[Inter]"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-[#E5E2DE] text-[#4d4540] hover:bg-[#FDFCFB] font-[Inter]"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

