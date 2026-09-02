import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function FeedbackInbox() {
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
  const [search, setSearch] = useState("");
  
  const { data: feedback, isLoading } = trpc.admin.feedback.list.useQuery();

  const filteredFeedback = feedback?.filter(f => 
    f.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
    f.userName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">Feedback Inbox</h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">Review beta tester survey results and bug reports.</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7e756f]" />
        <Input 
          placeholder="Search by user or email..." 
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-lg border border-[#E5E2DE] bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-[#FDFCFB]">
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wide">User</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Category</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Rating</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10">Loading feedback...</TableCell></TableRow>
            ) : filteredFeedback?.map((f) => (
              <TableRow key={f.id} className="hover:bg-slate-50 transition-colors">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-900">{f.userName || 'Anonymous'}</span>
                    <span className="text-xs text-slate-500">{f.userEmail}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">{f.category}</Badge>
                </TableCell>
                <TableCell>
                   <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className={`h-1.5 w-4 rounded-full ${i < (f.rating || 0) ? 'bg-amber-500' : 'bg-slate-200'}`} />
                      ))}
                   </div>
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {new Date(f.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFeedback(f)}>
                    <Eye className="w-4 h-4 mr-2" /> View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedFeedback} onOpenChange={() => setSelectedFeedback(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-600" />
              Feedback Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedFeedback && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] uppercase font-bold text-slate-400">User</p>
                  <p className="font-medium">{selectedFeedback.userName} ({selectedFeedback.userEmail})</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Category</p>
                  <p className="font-medium capitalize">{selectedFeedback.category}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold border-b pb-1 text-slate-900">Survey Responses</h3>
                {Object.entries(selectedFeedback.content || {}).map(([key, value]: [string, any]) => (
                  <div key={key} className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500">{key.replace(/_/g, ' ').toUpperCase()}</p>
                    <p className="text-sm bg-white border p-2 rounded italic text-slate-700">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
