import { useState, useEffect, useRef } from "react";
import {
  Search,
  Eye,
  BookOpen,
  Users,
  Globe,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";

// ─── Types inferred from the tRPC router ────────────────────────────────────

type ProjectRow = {
  id: number;
  title: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  sceneCount: number;
  characterCount: number;
  totalWordCount: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function TableRowSkeleton() {
  return (
    <TableRow>
      {[140, 100, 120, 80, 60, 60, 70].map((w, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4" style={{ width: w }} />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

interface DetailDrawerProps {
  projectId: number | null;
  onClose: () => void;
}

function DetailDrawer({ projectId, onClose }: DetailDrawerProps) {
  const isOpen = projectId !== null;

  const { data, isLoading, isError, refetch } = trpc.admin.projects.inspect.useQuery(
    { projectId: projectId! },
    { enabled: isOpen }
  );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto bg-[#FDFCFB] border-l border-[#E5E2DE]"
      >
        {/* Header */}
        <SheetHeader className="pb-4 border-b border-[#E5E2DE]">
          <div className="flex items-center gap-2 text-[#D4A373]">
            <Eye className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-widest font-[Inter]">
              Read-only inspection
            </span>
          </div>
          <SheetTitle className="text-xl font-semibold text-[#2D2926] font-[Literata] leading-snug">
            {isLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : data ? (
              data.project.title
            ) : (
              "Project Details"
            )}
          </SheetTitle>
          {!isLoading && data && (
            <SheetDescription className="text-[#7e756f] font-[Inter] text-sm">
              {data.project.ownerName ?? "Unknown"} &middot;{" "}
              {data.project.ownerEmail ?? ""}
            </SheetDescription>
          )}
        </SheetHeader>

        {/* Error state */}
        {isError && (
          <div className="p-4">
            <Alert variant="destructive" className="border-[#ffdad6] bg-[#fff8f7]">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-[#93000a]">Failed to load project</AlertTitle>
              <AlertDescription className="text-[#93000a]/80">
                <span>Could not fetch project details.</span>
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
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="p-4 space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {!isLoading && data && (
          <div className="p-4 space-y-6">
            {/* ── Scenes ── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="h-4 w-4 text-[#D4A373]" />
                <h3 className="text-sm font-semibold text-[#2D2926] font-[Inter] uppercase tracking-wide">
                  Scenes
                </h3>
                <Badge
                  variant="secondary"
                  className="ml-auto bg-[#F5F0EB] text-[#4d4540] border-0 text-xs"
                >
                  {data.scenes.length}
                </Badge>
              </div>

              {data.scenes.length === 0 ? (
                <p className="text-sm text-[#7e756f] font-[Inter] italic">No scenes yet.</p>
              ) : (
                <div className="rounded-md border border-[#E5E2DE] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F5F0EB]">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-[#4d4540] uppercase tracking-wide font-[Inter]">
                          Title
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-[#4d4540] uppercase tracking-wide font-[Inter]">
                          Status
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-[#4d4540] uppercase tracking-wide font-[Inter]">
                          Words
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.scenes.map((scene, idx) => (
                        <tr
                          key={scene.id}
                          className={
                            idx % 2 === 0
                              ? "bg-white"
                              : "bg-[#FDFCFB]"
                          }
                        >
                          <td className="px-3 py-2 text-[#2D2926] font-[Inter] truncate max-w-[160px]">
                            {scene.title || <span className="italic text-[#7e756f]">Untitled</span>}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className="text-xs border-[#E5E2DE] text-[#4d4540] capitalize"
                            >
                              {scene.status ?? "draft"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right text-[#7e756f] font-[Inter] tabular-nums">
                            {(scene.wordCount ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── Characters ── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-[#D4A373]" />
                <h3 className="text-sm font-semibold text-[#2D2926] font-[Inter] uppercase tracking-wide">
                  Actors
                </h3>
                <Badge
                  variant="secondary"
                  className="ml-auto bg-[#F5F0EB] text-[#4d4540] border-0 text-xs"
                >
                  {data.actors.length}
                </Badge>
              </div>

              {data.actors.length === 0 ? (
                <p className="text-sm text-[#7e756f] font-[Inter] italic">No actors yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.actors.map((char) => (
                    <div
                      key={char.id}
                      className="rounded-md border border-[#E5E2DE] bg-white px-3 py-2"
                    >
                      <p className="text-sm font-medium text-[#2D2926] font-[Inter]">
                        {char.name}
                      </p>
                      {char.type && (
                        <p className="text-xs text-[#7e756f] font-[Inter] mt-0.5 line-clamp-2">
                          {char.type}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Environments ── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-[#D4A373]" />
                <h3 className="text-sm font-semibold text-[#2D2926] font-[Inter] uppercase tracking-wide">
                  Environments
                </h3>
                <Badge
                  variant="secondary"
                  className="ml-auto bg-[#F5F0EB] text-[#4d4540] border-0 text-xs"
                >
                  {data.environments.length}
                </Badge>
              </div>

              {data.environments.length === 0 ? (
                <p className="text-sm text-[#7e756f] font-[Inter] italic">No environments yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.environments.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-md border border-[#E5E2DE] bg-white px-3 py-2"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge
                          variant="outline"
                          className="text-xs border-[#E5E2DE] text-[#4d4540] capitalize"
                        >
                          {note.type ?? "location"}
                        </Badge>
                        <p className="text-sm font-medium text-[#2D2926] font-[Inter] truncate">
                          {note.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Systems ── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-[#D4A373]" />
                <h3 className="text-sm font-semibold text-[#2D2926] font-[Inter] uppercase tracking-wide">
                  Systems
                </h3>
                <Badge
                  variant="secondary"
                  className="ml-auto bg-[#F5F0EB] text-[#4d4540] border-0 text-xs"
                >
                  {data.systems.length}
                </Badge>
              </div>

              {data.systems.length === 0 ? (
                <p className="text-sm text-[#7e756f] font-[Inter] italic">No systems yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.systems.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-md border border-[#E5E2DE] bg-white px-3 py-2"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge
                          variant="outline"
                          className="text-xs border-[#E5E2DE] text-[#4d4540] capitalize"
                        >
                          {note.type ?? "system"}
                        </Badge>
                        <p className="text-sm font-medium text-[#2D2926] font-[Inter] truncate">
                          {note.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function ProjectInspection() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // Debounce search input by 300 ms
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1); // reset to first page on new search
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchInput]);

  const { data, isLoading, isError, refetch } = trpc.admin.projects.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">
          Projects
        </h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">
          Browse and inspect all projects across all users.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7e756f] pointer-events-none" />
        <Input
          type="search"
          placeholder="Search by title or owner name…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9 border-[#E5E2DE] bg-white text-[#2D2926] placeholder:text-[#7e756f] focus-visible:ring-[#D4A373]/40 font-[Inter]"
        />
      </div>

      {/* Error state */}
      {isError && (
        <Alert variant="destructive" className="border-[#ffdad6] bg-[#fff8f7]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-[#93000a]">Failed to load projects</AlertTitle>
          <AlertDescription className="text-[#93000a]/80">
            <span>Could not fetch the project list.</span>
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

      {/* Table */}
      <div className="rounded-lg border border-[#E5E2DE] bg-white shadow-[0_2px_8px_0_rgba(45,41,38,0.06)] overflow-hidden">
        <Table>
          <TableHeader className="bg-[#F5F0EB]">
            <TableRow className="border-b border-[#E5E2DE] hover:bg-transparent">
              <TableHead className="text-xs font-medium text-[#4d4540] uppercase tracking-wide font-[Inter]">
                Title
              </TableHead>
              <TableHead className="text-xs font-medium text-[#4d4540] uppercase tracking-wide font-[Inter]">
                Owner
              </TableHead>
              <TableHead className="text-xs font-medium text-[#4d4540] uppercase tracking-wide font-[Inter]">
                Created
              </TableHead>
              <TableHead className="text-xs font-medium text-[#4d4540] uppercase tracking-wide font-[Inter]">
                Updated
              </TableHead>
              <TableHead className="text-xs font-medium text-[#4d4540] uppercase tracking-wide font-[Inter] text-right">
                Scenes
              </TableHead>
              <TableHead className="text-xs font-medium text-[#4d4540] uppercase tracking-wide font-[Inter] text-right">
                Chars
              </TableHead>
              <TableHead className="text-xs font-medium text-[#4d4540] uppercase tracking-wide font-[Inter] text-right">
                Words
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} />)
            ) : data && data.projects.length > 0 ? (
              data.projects.map((project: ProjectRow) => (
                <TableRow
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className="cursor-pointer border-b border-[#E5E2DE] hover:bg-[#F5F0EB]/60 transition-colors"
                >
                  <TableCell className="font-medium text-[#2D2926] font-[Inter] max-w-[200px] truncate">
                    <div className="flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5 text-[#D4A373] shrink-0" />
                      <span className="truncate">{project.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[#4d4540] font-[Inter]">
                    <div className="flex flex-col">
                      <span className="text-sm text-[#2D2926]">
                        {project.ownerName ?? "—"}
                      </span>
                      <span className="text-xs text-[#7e756f]">
                        {project.ownerEmail ?? ""}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-[#7e756f] font-[Inter]">
                    {formatDate(project.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-[#7e756f] font-[Inter]">
                    {formatDate(project.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-[#4d4540] font-[Inter] tabular-nums">
                    {project.sceneCount}
                  </TableCell>
                  <TableCell className="text-right text-sm text-[#4d4540] font-[Inter] tabular-nums">
                    {project.characterCount}
                  </TableCell>
                  <TableCell className="text-right text-sm text-[#4d4540] font-[Inter] tabular-nums">
                    {(project.totalWordCount ?? 0).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-12 text-center text-[#7e756f] font-[Inter] text-sm"
                >
                  {search
                    ? `No projects match "${search}".`
                    : "No projects found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#7e756f] font-[Inter]">
          {data
            ? `${data.total.toLocaleString()} project${data.total !== 1 ? "s" : ""} total`
            : ""}
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
            className="border-[#E5E2DE] text-[#4d4540] hover:bg-[#F5F0EB] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-[#4d4540] font-[Inter] tabular-nums">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
            className="border-[#E5E2DE] text-[#4d4540] hover:bg-[#F5F0EB] disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Detail drawer — read-only, no mutation controls */}
      <DetailDrawer
        projectId={selectedProjectId}
        onClose={() => setSelectedProjectId(null)}
      />
    </div>
  );
}
