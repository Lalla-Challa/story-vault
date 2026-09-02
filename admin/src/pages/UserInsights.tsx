import { useMemo, useState } from "react";
import { BarChart2, Clock, RefreshCw, AlertCircle, Users, BookOpen, Layers, History } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis, Legend, ResponsiveContainer } from "recharts";
import { subDays } from "date-fns";

type TimeRange = "7d" | "30d" | "90d" | "all";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All time" },
];

function formatEstimatedTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const topFeaturesChartConfig: ChartConfig = {
  count: {
    label: "Events",
    color: "#6B705C",
  },
};

function GlobalWritingAnalytics() {
  const { data, isLoading, isError, refetch } = trpc.admin.analytics.writingAnalytics.useQuery({
    from: subDays(new Date(), 30),
  });

  const chartData = useMemo(() => {
    if (!data) return { data: [], users: [] };
    
    // Group by project
    const projectGroups: Record<string, any> = {};
    const userMap: Record<number, { name: string, color: string }> = {};
    const colors = ["#D4A373", "#6B705C", "#2D2926", "#ba1a1a", "#7d562d", "#8f947e"];

    data.forEach((row) => {
      if (!projectGroups[row.projectTitle]) {
        projectGroups[row.projectTitle] = { projectTitle: row.projectTitle };
      }
      projectGroups[row.projectTitle][`user-${row.userId}`] = row.totalSeconds;
      
      if (!userMap[row.userId]) {
        userMap[row.userId] = { 
          name: row.userName || `User ${row.userId}`, 
          color: colors[Object.keys(userMap).length % colors.length] 
        };
      }
    });

    return {
      data: Object.values(projectGroups),
      users: Object.entries(userMap).map(([id, info]) => ({ id: `user-${id}`, ...info }))
    };
  }, [data]);

  const summary = useMemo(() => {
    if (!data) return { time: 0, words: 0, sessions: 0 };
    return data.reduce((acc, curr) => ({
      time: acc.time + curr.totalSeconds,
      words: acc.words + curr.wordDelta,
      sessions: acc.sessions + curr.sessionCount
    }), { time: 0, words: 0, sessions: 0 });
  }, [data]);

  if (isError) return (
    <Alert variant="destructive" className="border-[#ffdad6] bg-[#fff8f7]">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="text-[#93000a]">Failed to load global writing analytics</AlertTitle>
      <AlertDescription className="text-[#93000a]/80">
        <span>Could not fetch platform-wide writing data.</span>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2 border-[#93000a]/30 text-[#93000a]">Retry</Button>
      </AlertDescription>
    </Alert>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-[#E5E2DE] bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-[#7e756f] uppercase tracking-[0.2em] flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> Total Platform Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-[#2D2926] font-[Inter] tracking-tight">{formatEstimatedTime(summary.time)}</div>
            <p className="text-[11px] text-[#b0a89f] mt-1 italic">Combined effort across all projects</p>
          </CardContent>
        </Card>
        <Card className="border-[#E5E2DE] bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-[#7e756f] uppercase tracking-[0.2em] flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" /> Total Manuscript Delta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-[#2D2926] font-[Inter] tracking-tight">{summary.words.toLocaleString()} words</div>
            <p className="text-[11px] text-[#b0a89f] mt-1 italic">Total productivity gain (Last 30d)</p>
          </CardContent>
        </Card>
        <Card className="border-[#E5E2DE] bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold text-[#7e756f] uppercase tracking-[0.2em] flex items-center gap-2">
              <History className="w-3.5 h-3.5" /> Platform Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-[#2D2926] font-[Inter] tracking-tight">{summary.sessions.toLocaleString()}</div>
            <p className="text-[11px] text-[#b0a89f] mt-1 italic">Discrete writing periods detected</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#E5E2DE] bg-white shadow-sm overflow-hidden">
        <CardHeader className="border-b border-muted-border/40 bg-[#F9F7F5] pb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#7e756f]" />
            <CardTitle className="text-base font-semibold text-[#2D2926] font-[Literata]">Writing Intensity by Project & Author</CardTitle>
          </div>
          <p className="text-xs text-[#7e756f] italic mt-1">Visualization of writing effort across narratives (Last 30 days)</p>
        </CardHeader>
        <CardContent className="pt-8">
          {isLoading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : chartData.data.length === 0 ? (
            <div className="py-20 text-center text-[#b0a89f] italic">No active writing sessions recorded in this period.</div>
          ) : (
            <div className="h-[450px] w-full pr-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.data} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E2DE" />
                  <XAxis 
                    dataKey="projectTitle" 
                    angle={-45} 
                    textAnchor="end" 
                    interval={0}
                    tick={{ fill: "#7e756f", fontSize: 11, fontFamily: "Inter" }}
                    tickLine={{ stroke: '#E5E2DE' }}
                  />
                  <YAxis 
                    tickFormatter={v => `${Math.floor(v/3600)}h`}
                    tick={{ fill: "#7e756f", fontSize: 11, fontFamily: "Inter" }}
                    tickLine={{ stroke: '#E5E2DE' }}
                    axisLine={false}
                  />
                  <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 30, fontSize: 11, fontFamily: "Inter" }} />
                  <ChartTooltip 
                    cursor={{ fill: "rgba(107,112,92,0.05)" }}
                    content={<ChartTooltipContent />} 
                  />
                  {chartData.users.map((u) => (
                    <Bar 
                      key={u.id} 
                      dataKey={u.id} 
                      name={u.name} 
                      stackId="a" 
                      fill={u.color} 
                      radius={[0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function UserInsights() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [userIdInput, setUserIdInput] = useState("");

  const userId = useMemo(() => {
    const n = parseInt(userIdInput, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [userIdInput]);

  const { data, isLoading, isError, refetch } = trpc.admin.monitoring.userInsights.useQuery(
    userId ? { userId, timeRange } : (undefined as any),
    { enabled: !!userId, placeholderData: (prev) => prev }
  );

  const topFeaturesData = useMemo(() => {
    if (!data) return [];
    return [...data.topFeatures]
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
      .map((r) => ({ label: r.featureName, count: r.count }));
  }, [data]);

  return (
    <div className="p-6 space-y-6 bg-[#FDFCFB] min-h-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">
          User Insights
        </h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">
          Correlate beta feedback with real usage patterns (sessions, feature usage, writing).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
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

        <div className="flex flex-col gap-1">
          <label
            htmlFor="ui-userId"
            className="text-xs text-[#4d4540] font-[Inter] uppercase tracking-wide"
          >
            User ID
          </label>
          <input
            id="ui-userId"
            type="number"
            min={1}
            placeholder="Enter a user ID…"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            className="h-9 w-44 rounded-md border border-[#E5E2DE] bg-white px-3 text-sm text-[#2D2926] font-[Inter] placeholder:text-[#b0a89f] focus:outline-none focus:ring-2 focus:ring-[#6B705C]/30"
          />
        </div>
      </div>

      {isError && (
        <Alert variant="destructive" className="border-[#ffdad6] bg-[#fff8f7]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-[#93000a]">Failed to load user insights</AlertTitle>
          <AlertDescription className="text-[#93000a]/80">
            <span>Could not fetch user insights.</span>
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

      {!userId ? (
        <div className="space-y-12">
          <div className="rounded-lg border border-[#E5E2DE] bg-white py-12 text-center shadow-[0_2px_8px_0_rgba(45,41,38,0.06)] mb-12">
            <p className="text-[#4d4540] font-[Inter] font-medium italic opacity-60">Enter a User ID for granular insights, or view platform-wide analytics below.</p>
          </div>
          
          <GlobalWritingAnalytics />
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-[320px] w-full rounded-lg" />
          <Skeleton className="h-[260px] w-full rounded-lg" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#7e756f]" />
                  <CardTitle className="text-sm font-semibold text-[#2D2926] font-[Literata]">
                    User
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                <div className="text-sm text-[#2D2926] font-[Inter] font-medium">
                  {data.user.name ?? "—"}
                </div>
                <div className="text-xs text-[#7e756f] font-[Inter]">{data.user.email ?? "—"}</div>
                <div className="text-xs text-[#b0a89f] font-[Inter] tabular-nums">
                  id {data.user.id}
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#7e756f]" />
                  <CardTitle className="text-sm font-semibold text-[#2D2926] font-[Literata]">
                    Sessions
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                <div className="text-2xl font-semibold text-[#2D2926] font-[Inter] tabular-nums">
                  {data.sessions.count.toLocaleString()}
                </div>
                <div className="text-xs text-[#7e756f] font-[Inter]">
                  Total time {formatEstimatedTime(data.sessions.totalSeconds)}
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[#7e756f]" />
                  <CardTitle className="text-sm font-semibold text-[#2D2926] font-[Literata]">
                    Writing
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                <div className="text-2xl font-semibold text-[#2D2926] font-[Inter] tabular-nums">
                  {data.writingByProject
                    .reduce((sum, p) => sum + p.estimatedSeconds, 0)
                    .toLocaleString()}
                </div>
                <div className="text-xs text-[#7e756f] font-[Inter]">
                  Seconds (from heartbeats)
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-[#7e756f]" />
                <CardTitle className="text-base font-semibold text-[#2D2926] font-[Literata]">
                  Top features
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {topFeaturesData.length === 0 ? (
                <p className="text-sm text-[#7e756f] font-[Inter] py-8 text-center">
                  No feature usage recorded for this range.
                </p>
              ) : (
                <ChartContainer config={topFeaturesChartConfig} className="h-[320px] w-full">
                  <BarChart
                    data={topFeaturesData}
                    layout="vertical"
                    margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#E5E2DE" strokeDasharray="3 3" />
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
                      cursor={{ fill: "rgba(107,112,92,0.12)" }}
                      content={<ChartTooltipContent />}
                    />
                    <Bar dataKey="count" fill="#6B705C" radius={[0, 3, 3, 0]} maxBarSize={20}>
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

          <Card className="border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-[#2D2926] font-[Literata]">
                Writing by project
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.writingByProject.length === 0 ? (
                <p className="text-sm text-[#7e756f] font-[Inter] py-8 text-center">
                  No writing heartbeats recorded for this range.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#E5E2DE]">
                      <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">
                        Project
                      </TableHead>
                      <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide text-right">
                        Heartbeats
                      </TableHead>
                      <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide text-right">
                        Est. time
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.writingByProject.map((p) => (
                      <TableRow key={p.projectId} className="border-[#E5E2DE] hover:bg-[#F5F0EB]/60">
                        <TableCell className="text-[#2D2926] font-[Inter] text-sm font-medium">
                          {p.projectTitle ?? `Project ${p.projectId}`}
                        </TableCell>
                        <TableCell className="text-[#7e756f] font-[Inter] text-sm text-right tabular-nums">
                          {p.heartbeatCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-[#2D2926] font-[Inter] text-sm text-right tabular-nums font-medium">
                          {formatEstimatedTime(p.estimatedSeconds)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-[#2D2926] font-[Literata]">
                Recent writing (preview)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentWriting.length === 0 ? (
                <p className="text-sm text-[#7e756f] font-[Inter] py-8 text-center">
                  No scene versions saved for this range.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.recentWriting.map((v) => (
                    <div
                      key={v.versionId}
                      className="rounded-lg border border-[#E5E2DE] bg-[#FDFCFB] p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm text-[#2D2926] font-[Inter] font-medium truncate">
                            {v.projectTitle} · {v.sceneTitle}
                          </div>
                          <div className="mt-1 text-xs text-[#7e756f] font-[Inter] tabular-nums">
                            {new Date(v.createdAt).toLocaleString()} · {v.versionLabel.toUpperCase()} ·{" "}
                            {v.charCount.toLocaleString()} chars
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-sm text-[#4d4540] font-[Inter] leading-relaxed">
                        {v.preview.length > 0 ? v.preview : "—"}
                        {v.preview.length >= 280 ? "…" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

