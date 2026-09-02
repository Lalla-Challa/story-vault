import { useState, useMemo } from "react";
import { BarChart2, Clock, CalendarDays, AlertCircle, RefreshCw, X } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeRange = "7d" | "30d" | "90d" | "all";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format seconds as Xh Ym — always shows both components. */
function formatEstimatedTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Generate all 365 dates from today-364 to today (YYYY-MM-DD). */
function generateLast365Dates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Merge server heatmap data with zero-filled 365-day grid. */
function buildHeatmapGrid(
  serverData: { date: string; count: number }[]
): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (const row of serverData) {
    map.set(row.date, row.count);
  }
  return generateLast365Dates().map((date) => ({
    date,
    count: map.get(date) ?? 0,
  }));
}

/** Compute heatmap cell color based on count. */
function heatmapColor(count: number): string {
  if (count === 0) return "#E5E2DE";
  if (count <= 2) return "#f0d9b5";
  if (count <= 5) return "#D4A373";
  if (count <= 10) return "#b8864e";
  return "#8B5E3C";
}

const HEATMAP_LEGEND_COLORS = ["#E5E2DE", "#f0d9b5", "#D4A373", "#b8864e", "#8B5E3C"];

// ─── Section: Feature Usage Bar Chart ─────────────────────────────────────────

const featureUsageChartConfig: ChartConfig = {
  count: {
    label: "Events",
    color: "#D4A373",
  },
};

function FeatureUsageSection({
  timeRange,
  userId,
}: {
  timeRange: TimeRange;
  userId: number | undefined;
}) {
  const { data, isLoading, isError, refetch } =
    trpc.admin.analytics.featureUsage.useQuery({ timeRange, userId });

  const chartData = useMemo(() => {
    if (!data) return [];
    return [...data]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map((row) => ({
        label: row.featureName ?? row.eventType,
        count: row.count,
      }));
  }, [data]);

  return (
    <Card className="border-[#E5E2DE] bg-[#FDFCFB] shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-[#7e756f]" />
          <CardTitle className="text-base font-semibold text-[#2D2926] font-[Literata]">
            Feature Usage
          </CardTitle>
        </div>
        <p className="text-xs text-[#7e756f] font-[Inter] mt-0.5">
          Top 15 features by event count
        </p>
      </CardHeader>
      <CardContent>
        {isError && (
          <SectionError message="Failed to load feature usage data." onRetry={() => refetch()} />
        )}

        {isLoading && <Skeleton className="h-[220px] w-full rounded-md" />}

        {!isLoading && !isError && chartData.length === 0 && (
          <p className="text-sm text-[#7e756f] font-[Inter] py-8 text-center">
            No events recorded for this time range.
          </p>
        )}

        {!isLoading && !isError && chartData.length > 0 && (
          <ChartContainer config={featureUsageChartConfig} className="h-[320px] w-full">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="#E5E2DE"
                strokeDasharray="3 3"
              />
              <XAxis
                type="number"
                tick={{ fill: "#7e756f", fontSize: 11, fontFamily: "Inter" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={140}
                tick={{ fill: "#7e756f", fontSize: 11, fontFamily: "Inter" }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                cursor={{ fill: "rgba(212,163,115,0.12)" }}
                content={<ChartTooltipContent />}
              />
              <Bar
                dataKey="count"
                fill="#D4A373"
                radius={[0, 3, 3, 0]}
                maxBarSize={20}
              >
                <LabelList
                  dataKey="count"
                  position="right"
                  style={{ fill: "#7e756f", fontSize: 11, fontFamily: "Inter" }}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section: Writing Time Table ──────────────────────────────────────────────

function WritingTimeSection({ userId }: { userId: number | undefined }) {
  const { data, isLoading, isError, refetch } =
    trpc.admin.analytics.writingTime.useQuery({ userId });

  return (
    <Card className="border-[#E5E2DE] bg-[#FDFCFB] shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#7e756f]" />
          <CardTitle className="text-base font-semibold text-[#2D2926] font-[Literata]">
            Writing Time per User
          </CardTitle>
        </div>
        <p className="text-xs text-[#7e756f] font-[Inter] mt-0.5">
          Estimated from writing session heartbeats (each heartbeat ≈ 60 s)
        </p>
      </CardHeader>
      <CardContent>
        {isError && (
          <SectionError message="Failed to load writing time data." onRetry={() => refetch()} />
        )}

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        )}

        {!isLoading && !isError && (!data || data.length === 0) && (
          <p className="text-sm text-[#7e756f] font-[Inter] py-8 text-center">
            No writing time data available.
          </p>
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="border-[#E5E2DE]">
                <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">
                  User
                </TableHead>
                <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">
                  Email
                </TableHead>
                <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide text-right">
                  Heartbeats
                </TableHead>
                <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide text-right">
                  Estimated Time
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow
                  key={row.userId}
                  className="border-[#E5E2DE] hover:bg-[#F5F0EB]/60"
                >
                  <TableCell className="text-[#2D2926] font-[Inter] text-sm font-medium">
                    {row.userName ?? "—"}
                  </TableCell>
                  <TableCell className="text-[#7e756f] font-[Inter] text-sm">
                    {row.userEmail}
                  </TableCell>
                  <TableCell className="text-[#7e756f] font-[Inter] text-sm text-right tabular-nums">
                    {row.heartbeatCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-[#2D2926] font-[Inter] text-sm font-medium text-right tabular-nums">
                    {formatEstimatedTime(row.estimatedSeconds)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section: Activity Heatmap ────────────────────────────────────────────────

function ActivityHeatmapSection({ userId }: { userId: number | undefined }) {
  const { data, isLoading, isError, refetch } =
    trpc.admin.analytics.heatmap.useQuery({ userId });

  const grid = useMemo(() => {
    if (!data) return [];
    return buildHeatmapGrid(data);
  }, [data]);

  // Split into week columns (53 max), each column = 7 days (Mon→Sun)
  const weeks = useMemo(() => {
    const result: { date: string; count: number }[][] = [];
    for (let i = 0; i < grid.length; i += 7) {
      result.push(grid.slice(i, i + 7));
    }
    return result;
  }, [grid]);

  return (
    <Card className="border-[#E5E2DE] bg-[#FDFCFB] shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#7e756f]" />
          <CardTitle className="text-base font-semibold text-[#2D2926] font-[Literata]">
            365-Day Activity Heatmap
          </CardTitle>
        </div>
        <p className="text-xs text-[#7e756f] font-[Inter] mt-0.5">
          Daily event count over the past year. Hover a cell for details.
        </p>
      </CardHeader>
      <CardContent>
        {isError && (
          <SectionError message="Failed to load heatmap data." onRetry={() => refetch()} />
        )}

        {isLoading && <Skeleton className="h-[100px] w-full rounded-md" />}

        {!isLoading && !isError && (
          <div className="overflow-x-auto">
            {/* 53 columns × 7 rows, 12×12px cells, 2px gap */}
            <div
              className="inline-grid"
              style={{
                gridTemplateColumns: `repeat(${weeks.length}, 12px)`,
                gridTemplateRows: "repeat(7, 12px)",
                gap: "2px",
              }}
            >
              {weeks.map((week, wi) =>
                week.map((day, di) => (
                  <div
                    key={`${wi}-${di}`}
                    title={`${day.date}: ${day.count} event${day.count !== 1 ? "s" : ""}`}
                    className="rounded-[2px] cursor-default"
                    style={{
                      width: 12,
                      height: 12,
                      backgroundColor: heatmapColor(day.count),
                      gridColumn: wi + 1,
                      gridRow: di + 1,
                    }}
                  />
                ))
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-[#7e756f] font-[Inter]">Less</span>
              {HEATMAP_LEGEND_COLORS.map((c) => (
                <div
                  key={c}
                  className="rounded-[2px]"
                  style={{ width: 12, height: 12, backgroundColor: c }}
                />
              ))}
              <span className="text-xs text-[#7e756f] font-[Inter]">More</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Shared: Section Error ─────────────────────────────────────────────────────

function SectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Alert
      variant="destructive"
      className="border-[#ffdad6] bg-[#fff8f7] mb-4"
    >
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="text-[#93000a]">Error</AlertTitle>
      <AlertDescription className="text-[#93000a]/80">
        <span>{message}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 border-[#93000a]/30 text-[#93000a] hover:bg-[#ffdad6]/40"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All time" },
];

export default function Analytics() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [userIdInput, setUserIdInput] = useState<string>("");

  const userId = useMemo(() => {
    const n = parseInt(userIdInput, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [userIdInput]);

  return (
    <div className="p-6 space-y-6 bg-[#FDFCFB] min-h-full">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">
          Analytics
        </h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">
          Feature usage statistics, writing time, and activity heatmaps.
        </p>
      </div>

      {/* Global filters */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Time range toggle — styled like tabs */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#4d4540] font-[Inter] uppercase tracking-wide">
            Time Range
          </span>
          <div className="flex rounded-md border border-[#E5E2DE] bg-[#F5F0EB] p-0.5 gap-0.5">
            {TIME_RANGES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTimeRange(value)}
                className={[
                  "px-3 py-1.5 rounded text-xs font-[Inter] transition-colors",
                  timeRange === value
                    ? "bg-white text-[#2D2926] shadow-sm font-medium"
                    : "text-[#7e756f] hover:text-[#2D2926]",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* User ID filter with clear button */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="userId-filter"
            className="text-xs text-[#4d4540] font-[Inter] uppercase tracking-wide"
          >
            User ID
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="userId-filter"
              type="number"
              min={1}
              placeholder="All users"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              className="h-9 w-32 rounded-md border border-[#E5E2DE] bg-white px-3 text-sm text-[#2D2926] font-[Inter] placeholder:text-[#b0a89f] focus:outline-none focus:ring-2 focus:ring-[#D4A373]/50"
            />
            {userIdInput !== "" && (
              <button
                type="button"
                onClick={() => setUserIdInput("")}
                aria-label="Clear user filter"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-[#E5E2DE] bg-white text-[#7e756f] hover:text-[#2D2926] hover:bg-[#F5F0EB] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Three independent sections — all queries run in parallel */}
      <FeatureUsageSection timeRange={timeRange} userId={userId} />
      <WritingTimeSection userId={userId} />
      <ActivityHeatmapSection userId={userId} />
    </div>
  );
}
