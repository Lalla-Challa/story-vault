import { Users, FolderOpen, Activity, Wifi, AlertCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
}

function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <Card className="border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-[#4d4540] font-[Inter] tracking-wide uppercase text-xs">
            {title}
          </CardTitle>
          <span className="text-[#6B705C]">{icon}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-[#2D2926] font-[Literata] leading-none">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {description && (
          <p className="mt-1 text-xs text-[#7e756f] font-[Inter]">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-4 rounded" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mt-1" />
        <Skeleton className="h-3 w-32 mt-2" />
      </CardContent>
    </Card>
  );
}

export default function AdminOverview() {
  const { data, isLoading, isError, refetch } = trpc.admin.overview.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">
          Overview
        </h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">
          Platform summary — refreshes every 60 seconds.
        </p>
      </div>

      {isError && (
        <Alert variant="destructive" className="border-[#ffdad6] bg-[#fff8f7]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-[#93000a]">Failed to load overview</AlertTitle>
          <AlertDescription className="text-[#93000a]/80">
            <span>Could not fetch platform statistics.</span>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : data ? (
          <>
            <StatCard
              title="Total Users"
              value={data.totalUsers}
              icon={<Users className="h-4 w-4" />}
              description="Registered accounts"
            />
            <StatCard
              title="Total Projects"
              value={data.totalProjects}
              icon={<FolderOpen className="h-4 w-4" />}
              description="Across all users"
            />
            <StatCard
              title="Events (24h)"
              value={data.events24h}
              icon={<Activity className="h-4 w-4" />}
              description="Activity in the last 24 hours"
            />
            <StatCard
              title="Active Sessions"
              value={data.activeSessions}
              icon={<Wifi className="h-4 w-4" />}
              description="Within inactivity window"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
