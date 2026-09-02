import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Server, Database, ShieldAlert, Flag, HardDrive, Cpu } from "lucide-react";

export default function SystemPanel() {
  const { data: health, isLoading: loadingHealth } = trpc.admin.monitoring.health.useQuery(undefined, { refetchInterval: 10000 });
  const { data: settings } = trpc.admin.systemSettings.get.useQuery();
  const utils = trpc.useUtils();

  const updateSetting = trpc.admin.systemSettings.set.useMutation({
    onSuccess: () => {
      toast.success("System setting updated");
      utils.admin.systemSettings.get.invalidate();
    }
  });

  const isMaintenanceMode = settings?.find(s => s.key === "maintenance_mode")?.value === true;
  const betaFeatureFlag = settings?.find(s => s.key === "beta_features_enabled")?.value === true;

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">System & Infrastructure</h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">Critical app controls and infrastructure monitoring.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Operations Section */}
        <Card className="border-red-100 bg-red-50/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-red-900">
                <ShieldAlert className="w-5 h-5" /> Safety & Maintenance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm">
                <div>
                    <h3 className="font-bold text-slate-900">Maintenance Mode</h3>
                    <p className="text-xs text-slate-500">Redirects all non-admin users to a maintenance screen.</p>
                </div>
                <Switch 
                    checked={isMaintenanceMode} 
                    onCheckedChange={(val) => updateSetting.mutate({ key: "maintenance_mode", value: val })} 
                />
            </div>
            <div className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm opacity-50 cursor-not-allowed">
                <div>
                    <h3 className="font-bold text-slate-900">Force Global Logout</h3>
                    <p className="text-xs text-slate-500">Invalidate all active user sessions immediately.</p>
                </div>
                <Button size="sm" variant="destructive" disabled>Execute</Button>
            </div>
          </CardContent>
        </Card>

        {/* Feature Flags */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
                <Flag className="w-5 h-5 text-amber-600" /> Feature Flags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
                <span className="font-medium text-sm">Beta Features (Experimental)</span>
                <Switch 
                    checked={betaFeatureFlag} 
                    onCheckedChange={(val) => updateSetting.mutate({ key: "beta_features_enabled", value: val })} 
                />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg opacity-60">
                <span className="font-medium text-sm">AI Writing Assistant</span>
                <Badge variant="outline">Coming Soon</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Infrastructure Health */}
      <Card>
        <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
                <Server className="w-5 h-5" /> Live Server Status
            </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1"><Cpu className="w-3 h-3"/> CPU Load</p>
                    <p className="text-xl font-mono">{health?.ok ? 'Stable' : 'Unknown'}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1"><HardDrive className="w-3 h-3"/> Memory Usage</p>
                    <p className="text-xl font-mono">{health ? `${Math.round(health.memory.rss / 1024 / 1024)} MB` : '--'}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1"><Database className="w-3 h-3"/> Database</p>
                    <Badge className={health?.dbAvailable ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                        {health?.dbAvailable ? 'CONNECTED' : 'DISCONNECTED'}
                    </Badge>
                </div>
                <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Uptime</p>
                    <p className="text-xl font-mono">{health ? `${Math.floor(health.uptimeSeconds / 3600)}h ${Math.floor((health.uptimeSeconds % 3600) / 60)}m` : '--'}</p>
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
