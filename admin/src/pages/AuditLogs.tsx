import { trpc } from "@/lib/trpc";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Shield, Clock, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLogs() {
  const { data: logs, isLoading } = trpc.admin.audit.list.useQuery();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">Audit Logs</h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">Transparent record of all administrative actions.</p>
      </div>

      <div className="rounded-lg border border-[#E5E2DE] bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-[#FDFCFB]">
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wide">Staff Member</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Action</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Target</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-24"/></TableCell>
                        <TableCell><Skeleton className="h-4 w-32"/></TableCell>
                        <TableCell><Skeleton className="h-4 w-20"/></TableCell>
                        <TableCell><Skeleton className="h-4 w-24"/></TableCell>
                    </TableRow>
                ))
            ) : logs?.map((log) => (
              <TableRow key={log.id} className="hover:bg-slate-50 transition-colors">
                <TableCell className="font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>User #{log.userId}</span>
                    </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px]">{log.action}</Badge>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-slate-500">{log.entityType} #{log.entityId}</span>
                </TableCell>
                <TableCell className="text-xs text-slate-400">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
