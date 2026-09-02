import { useState, useEffect, useCallback } from "react";
import { Activity, AlertCircle, RefreshCw, Filter, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─── Event type definitions ───────────────────────────────────────────────────

const ALL_EVENT_TYPES = [
  "user_signup",
  "user_login",
  "user_logout",
  "project_created",
  "project_deleted",
  "project_exported_svp",
  "project_imported_svp",
  "scene_created",
  "scene_deleted",
  "scene_version_saved",
  "scene_version_deleted",
  "character_created",
  "character_deleted",
  "world_note_created",
  "world_note_deleted",
  "document_exported",
  "ai_chat_message_sent",
  "search_performed",
  "main_story_scene_added",
  "main_story_scene_removed",
  "writing_session_heartbeat",
] as const;

/** Human-readable label: underscores → spaces, title-case */
function eventLabel(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Category → dot color ─────────────────────────────────────────────────────

type Category = "auth" | "project" | "scene" | "character" | "world" | "export" | "other";

function getCategory(type: string): Category {
  if (["user_signup", "user_login", "user_logout"].includes(type)) return "auth";
  if (
    ["project_created", "project_deleted", "project_exported_svp", "project_imported_svp"].includes(
      type
    )
  )
    return "project";
  if (
    [
      "scene_created",
      "scene_deleted",
      "scene_version_saved",
      "scene_version_deleted",
      "main_story_scene_added",
      "main_story_scene_removed",
    ].includes(type)
  )
    return "scene";
  if (["character_created", "character_deleted"].includes(type)) return "character";
  if (["world_note_created", "world_note_deleted"].includes(type)) return "world";
  if (
    ["document_exported", "project_exported_svp", "project_imported_svp"].includes(type)
  )
    return "export";
  return "other";
}

// Exact hex values per spec
const CATEGORY_COLOR: Record<Category, string> = {
  auth: "#6B9FD4",      // blue
  project: "#6B705C",   // sage
  scene: "#D4A373",     // amber
  character: "#9B7FD4", // purple
  world: "#5BA08A",     // teal
  export: "#D4875A",    // orange
  other: "#b0a89f",     // gray
};

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// ─── Metadata formatter ───────────────────────────────────────────────────────

function formatMetadata(meta: Record<string, unknown>): string {
  return Object.entries(meta)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("  ");
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-lg border border-[#E5E2DE] bg-white p-4"
        >
          <Skeleton className="mt-1.5 h-2 w-2 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-28 rounded-md" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────────

interface FeedEvent {
  id: number;
  userId: number;
  eventType: string;
  featureName?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string | Date;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

interface EventRowProps {
  event: FeedEvent;
  now: Date;
}

function EventRow({ event, now }: EventRowProps) {
  const category = getCategory(event.eventType);
  const dotColor = CATEGORY_COLOR[category];
  const createdAt =
    event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt);

  const metaSummary =
    event.metadata && Object.keys(event.metadata).length > 0
      ? formatMetadata(event.metadata)
      : null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#E5E2DE] bg-white p-4 hover:bg-[#FDFCFB] transition-colors">
      {/* 8 px colored dot */}
      <span
        className="mt-1.5 shrink-0 rounded-full"
        style={{ width: 8, height: 8, backgroundColor: dotColor }}
        aria-hidden="true"
      />

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        {/* Badge + user */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-[#E5E2DE] text-[#4d4540] font-[Inter] text-xs"
          >
            {eventLabel(event.eventType)}
          </Badge>
          {event.user && (
            <span className="text-xs font-[Inter] truncate">
              <span className="font-semibold text-[#2D2926]">
                {event.user.name ?? "Unknown"}
              </span>
              {event.user.email && (
                <>
                  <span className="text-[#b0a89f]"> · </span>
                  <span className="text-[#7e756f] text-[11px]">{event.user.email}</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* Feature name */}
        {event.featureName && (
          <p className="text-xs text-[#7e756f] italic font-[Inter] truncate">
            {event.featureName}
          </p>
        )}

        {/* Metadata key=value */}
        {metaSummary && (
          <p className="text-xs text-[#b0a89f] font-mono truncate">{metaSummary}</p>
        )}
      </div>

      {/* Relative timestamp */}
      <span className="shrink-0 text-xs text-[#7e756f] font-[Inter] whitespace-nowrap">
        {relativeTime(createdAt, now)}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActivityFeed() {
  // Filter state
  const [userIdInput, setUserIdInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  // Tick state for relative timestamps and "X seconds ago"
  const [now, setNow] = useState(() => new Date());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  // Derived filter values
  const userId =
    userIdInput.trim() !== "" && !isNaN(parseInt(userIdInput, 10))
      ? parseInt(userIdInput, 10)
      : undefined;
  const eventTypes = selectedTypes.length > 0 ? selectedTypes : undefined;

  const { data, isLoading, isError, refetch, dataUpdatedAt } =
    trpc.admin.feed.list.useQuery(
      {
        userId,
        eventTypes,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
      { refetchInterval: 30_000 }
    );

  // Reset "seconds ago" counter whenever data refreshes
  useEffect(() => {
    if (dataUpdatedAt) {
      setSecondsSinceUpdate(0);
    }
  }, [dataUpdatedAt]);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
      setSecondsSinceUpdate((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const toggleType = useCallback((type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  function clearFilters() {
    setUserIdInput("");
    setDateFrom("");
    setDateTo("");
    setSelectedTypes([]);
  }

  const hasFilters =
    userIdInput.trim() !== "" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    selectedTypes.length > 0;

  const events: FeedEvent[] = (data as FeedEvent[] | undefined) ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#6B705C]" />
            <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">
              Activity Feed
            </h1>
          </div>
          <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">
            100 most recent events · auto-refreshes every 30 s
          </p>
        </div>
        {/* "Last updated X seconds ago" counter */}
        <p className="shrink-0 text-xs text-[#b0a89f] font-[Inter] mt-1 self-start">
          {secondsSinceUpdate < 5
            ? "Last updated just now"
            : `Last updated ${secondsSinceUpdate}s ago`}
        </p>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-end gap-3">
        {/* User ID */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="af-user-id"
            className="text-xs text-[#4d4540] font-[Inter] font-medium"
          >
            User ID
          </label>
          <input
            id="af-user-id"
            type="number"
            placeholder="All users"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            className="h-9 w-36 rounded-md border border-[#E5E2DE] bg-white px-3 text-sm text-[#2D2926] placeholder:text-[#b0a89f] font-[Inter] focus:outline-none focus:ring-2 focus:ring-[#D4A373]/40 focus:border-[#D4A373]"
            aria-label="Filter by user ID"
          />
        </div>

        {/* Date From */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="af-date-from"
            className="text-xs text-[#4d4540] font-[Inter] font-medium"
          >
            From
          </label>
          <input
            id="af-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-40 rounded-md border border-[#E5E2DE] bg-white px-3 text-sm text-[#2D2926] font-[Inter] focus:outline-none focus:ring-2 focus:ring-[#D4A373]/40 focus:border-[#D4A373]"
            aria-label="Filter from date"
          />
        </div>

        {/* Date To */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="af-date-to"
            className="text-xs text-[#4d4540] font-[Inter] font-medium"
          >
            To
          </label>
          <input
            id="af-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-40 rounded-md border border-[#E5E2DE] bg-white px-3 text-sm text-[#2D2926] font-[Inter] focus:outline-none focus:ring-2 focus:ring-[#D4A373]/40 focus:border-[#D4A373]"
            aria-label="Filter to date"
          />
        </div>

        {/* Event Types popover */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#4d4540] font-[Inter] font-medium">
            Event Types
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 border-[#E5E2DE] text-[#4d4540] hover:bg-[#FDFCFB] font-[Inter] gap-1.5 min-w-[148px] justify-between"
                aria-label="Select event types"
              >
                <span className="flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-[#7e756f]" />
                  {selectedTypes.length === 0
                    ? "All types"
                    : `${selectedTypes.length} types selected`}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-64 p-2 border-[#E5E2DE] bg-white shadow-[0_4px_16px_0_rgba(45,41,38,0.10)]"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-medium text-[#4d4540] font-[Inter]">
                  Filter by event type
                </span>
                {selectedTypes.length > 0 && (
                  <button
                    onClick={() => setSelectedTypes([])}
                    className="text-xs text-[#7e756f] hover:text-[#2D2926] font-[Inter] underline"
                    aria-label="Clear event type selection"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto space-y-0.5">
                {ALL_EVENT_TYPES.map((type) => (
                  <label
                    key={type}
                    htmlFor={`et-${type}`}
                    className="flex items-center gap-2.5 rounded px-1.5 py-1.5 cursor-pointer hover:bg-[#FDFCFB] select-none"
                  >
                    <Checkbox
                      id={`et-${type}`}
                      checked={selectedTypes.includes(type)}
                      onCheckedChange={() => toggleType(type)}
                      className="border-[#E5E2DE] data-[state=checked]:bg-[#6B705C] data-[state=checked]:border-[#6B705C]"
                    />
                    <span className="text-xs text-[#2D2926] font-[Inter]">
                      {eventLabel(type)}
                    </span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Clear all */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 text-[#7e756f] hover:text-[#2D2926] hover:bg-[#f0ede9] font-[Inter] gap-1.5 self-end"
            aria-label="Clear all filters"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </Button>
        )}
      </div>

      {/* ── Inline error ── */}
      {isError && (
        <Alert variant="destructive" className="border-[#ffdad6] bg-[#fff8f7]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-[#93000a]">Failed to load activity feed</AlertTitle>
          <AlertDescription className="text-[#93000a]/80">
            <span>Could not fetch recent events.</span>
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

      {/* ── Feed list ── */}
      {isLoading ? (
        <FeedSkeleton />
      ) : events.length === 0 && !isError ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#E5E2DE] bg-white py-16 text-center">
          <p className="text-[#4d4540] font-[Inter] font-medium">
            No events match your filters.
          </p>
          {hasFilters && (
            <p className="mt-1 text-sm text-[#7e756f] font-[Inter]">
              Try adjusting or clearing the filters above.
            </p>
          )}
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto space-y-2 pr-1">
          {events.map((event) => (
            <EventRow key={event.id} event={event} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
