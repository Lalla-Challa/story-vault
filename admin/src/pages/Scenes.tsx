import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { 
  Search, 
  BookOpen, 
  Clock, 
  Activity, 
  ChevronLeft, 
  ChevronRight,
  User,
  History
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 20;

export default function Scenes() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = trpc.admin.scenes.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">Global Scene Search</h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">Find any scene across the entire platform by title or author.</p>
      </div>

      <form onSubmit={handleSearch} className="relative max-w-md flex gap-2">
        <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7e756f]" />
            <Input
                placeholder="Search scene title or author email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
            />
        </div>
        <Button type="submit">Search</Button>
      </form>

      <div className="rounded-lg border border-[#E5E2DE] bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-[#FDFCFB]">
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wide">Scene Title</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Author</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-right">Words</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell colSpan={5}><Skeleton className="h-4 w-full"/></TableCell>
                    </TableRow>
                ))
            ) : data?.scenes.map((scene) => (
              <TableRow key={scene.id} className="hover:bg-slate-50 transition-colors">
                <TableCell className="font-medium text-slate-900">
                    <div className="flex flex-col">
                        <span>{scene.title}</span>
                        <span className="text-[10px] text-slate-400">ID: {scene.id} · Project: {scene.projectId}</span>
                    </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{scene.ownerName || '—'}</span>
                    <span className="text-xs text-slate-500">{scene.ownerEmail}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">{scene.status}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{(scene.wordCount ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-xs text-slate-500">{new Date(scene.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{data?.total.toLocaleString()} total scenes</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
