import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function BetaRequests() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [provisionUser, setProvisionUser] = useState<number | null>(null);

  const { data: requests, isLoading, isError, error, refetch } = trpc.beta.list.useQuery();
  
  const updateStatus = trpc.beta.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      utils.beta.list.invalidate();
      setSelectedIds([]);
    },
    onError: (err) => {
      toast.error(`Failed to update status: ${err.message}`);
    },
  });

  const provisionMutation = trpc.adminUser.provisionBetaAccount.useMutation({
    onSuccess: (data: { email: string; password: string }) => {
      toast.success(`Account provisioned for ${data.email}. Password: ${data.password}`);
      setProvisionUser(null);
    },
    onError: (err: any) => {
      toast.error(`Failed to provision account: ${err.message}`);
    }
  });

  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    return requests.filter(r => statusFilter === "all" || r.status === statusFilter);
  }, [requests, statusFilter]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRequests.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRequests.map(r => r.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleStatusChange = (id: number, status: "approved" | "denied", waveName?: string, rejectionReason?: string) => {
    updateStatus.mutate({ id, status, waveName, rejectionReason });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">
            Beta Requests
          </h1>
          <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">
            Review and manage beta access applications.
          </p>
        </div>
        <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="denied">Denied</SelectItem>
                    <SelectItem value="invited">Invited</SelectItem>
                </SelectContent>
            </Select>
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-[#ffdad6] bg-[#fff8f7] px-4 py-3 text-sm text-[#93000a] font-[Inter]">
          Failed to load beta requests: {error?.message}
          <button onClick={() => refetch()} className="ml-3 underline">Retry</button>
        </div>
      )}

      <div className="rounded-lg border border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)] overflow-hidden">
        <Table>
          <TableHeader className="bg-[#FDFCFB]">
            <TableRow className="border-[#E5E2DE]">
              <TableHead><Checkbox checked={selectedIds.length === filteredRequests.length && filteredRequests.length > 0} onCheckedChange={toggleSelectAll}/></TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Name</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Email</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Reason</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Wave</TableHead>
              <TableHead className="text-[#4d4540] font-[Inter] text-xs uppercase tracking-wide">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-[#E5E2DE]">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-[#E5E2DE] rounded animate-pulse w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredRequests.length > 0 ? (
              filteredRequests.map((req) => (
                <TableRow key={req.id} className="border-[#E5E2DE] hover:bg-[#FDFCFB]">
                  <TableCell><Checkbox checked={selectedIds.includes(req.id)} onCheckedChange={() => toggleSelect(req.id)}/></TableCell>
                  <TableCell className="text-[#2D2926] font-[Inter] font-medium">{req.name}</TableCell>
                  <TableCell className="text-[#4d4540] font-[Inter]">{req.email}</TableCell>
                  <TableCell className="text-[#4d4540] font-[Inter] max-w-xs truncate">{req.reason}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-[Inter] capitalize ${
                      req.status === 'approved' ? 'bg-green-100 text-green-800' :
                      req.status === 'denied' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {req.status}
                    </span>
                  </TableCell>
                  <TableCell>{req.waveName || "-"}</TableCell>
                  <TableCell className="flex gap-2">
                    {req.status === "pending" && (
                        <>
                            <Button size="sm" onClick={() => handleStatusChange(req.id, "approved", "Wave 1")}>Approve</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleStatusChange(req.id, "denied")}>Deny</Button>
                        </>
                    )}
                    {req.status === "approved" && (
                        <Button size="sm" onClick={() => setProvisionUser(req.id)}>Provision</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-[#7e756f] font-[Inter]">
                  No beta requests found for this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!provisionUser} onOpenChange={(o) => !o && setProvisionUser(null)}>
        <DialogContent>
            <DialogHeader><DialogTitle>Provision Beta Account</DialogTitle></DialogHeader>
            {provisionUser && (
                <div className="space-y-4">
                    <Button onClick={() => provisionMutation.mutate({
                        name: requests?.find(r => r.id === provisionUser)?.name || "",
                        email: requests?.find(r => r.id === provisionUser)?.email || "",
                        betaTier: "beta",
                        daysToExpiry: 30
                    })}>Confirm Provisioning</Button>
                </div>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
