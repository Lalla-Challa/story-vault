import { Activity, AlertCircle, RefreshCw, Timer, TrendingUp, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#7e756f]" />
          <CardTitle className="text-sm font-semibold text-[#2D2926] font-[Literata]">
            {label}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-semibold text-[#2D2926] font-[Inter] tabular-nums">
          {value}
        </div>
        {sub && <div className="text-xs text-[#7e756f] font-[Inter] mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function MonitoringHealth() {
  const { data, isLoading, isError, refetch } = trpc.admin.monitoring.health.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  return (
    <div className="p-6 space-y-6 bg-[#FDFCFB] min-h-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">
          Monitoring
        </h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">
          System health, request volume, and error signals.
        </p>
      </div>

      {isError && (
        <Alert variant="destructive" className="border-[#ffdad6] bg-[#fff8f7]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-[#93000a]">Failed to load monitoring data</AlertTitle>
          <AlertDescription className="text-[#93000a]/80">
            <span>Could not fetch server health.</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[108px] w-full rounded-lg" />
          ))}
        </div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              icon={TrendingUp}
              label="Requests (5m)"
              value={data.last5mRequests.toLocaleString()}
              sub={data.dbAvailable ? "From request logs" : "DB unavailable"}
            />
            <StatCard
              icon={Activity}
              label="Errors (5m)"
              value={data.last5mErrors.toLocaleString()}
              sub="tRPC + server errors"
            />
            <StatCard
              icon={Timer}
              label="P95 latency (5m)"
              value={`${data.last5mP95Ms.toLocaleString()} ms`}
              sub="Approx from recent requests"
            />
            <StatCard
              icon={Users}
              label="Active users (5m)"
              value={data.last5mActiveUsers.toLocaleString()}
              sub="Distinct userIds in requests"
            />
          </div>

          <Card className="border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-[#2D2926] font-[Literata]">
                Server details
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-[#4d4540] font-[Inter] space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#7e756f]">Server time</span>
                <span className="tabular-nums">{new Date(data.serverTime).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#7e756f]">Uptime</span>
                <span className="tabular-nums">{data.uptimeSeconds.toLocaleString()}s</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#7e756f]">Database</span>
                <span className={data.dbAvailable ? "text-[#6B705C]" : "text-[#93000a]"}>
                  {data.dbAvailable ? "Available" : "Unavailable"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#7e756f]">Memory (RSS)</span>
                <span className="tabular-nums">
                  {Math.round(data.memory.rss / (1024 * 1024)).toLocaleString()} MB
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

