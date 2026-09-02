import { useAuth } from "@/_core/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExportSvpButton, ImportSvpButton } from "@/components/SvpButtons";
import { UserSettings } from "@/components/UserSettings";

export default function ProjectDashboard() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.project.list.useQuery();

  const createMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      toast.success("Project created");
      setTitle("");
      setDescription("");
      setIsOpen(false);
      utils.project.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to create project"),
  });

  const deleteMutation = trpc.project.delete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted");
      setDeleteTarget(null);
      setDeleteConfirm("");
      utils.project.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to delete project"),
  });

  useEffect(() => {
    if (!loading && isAuthenticated === false) navigate("/");
  }, [isAuthenticated, loading, navigate]);

  if (loading || isAuthenticated === false) return null;

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("Project title is required");
      return;
    }
    createMutation.mutate({ title, description });
  };

  return (
    <>
      <div className="bg-paper-base text-ink-charcoal font-body-ui text-body-ui antialiased h-screen flex overflow-hidden">
        {/* Sidebar Navigation */}
        <nav className="hidden md:flex flex-col h-screen w-sidebar-width left-0 border-r border-muted-border bg-surface-container-low p-4 gap-component-gap shrink-0">
          <div className="mb-8">
            <h1 className="font-headline-md text-headline-md font-bold text-ink-charcoal mb-1">Story Vault</h1>
            <p className="text-sage-slate font-caption text-caption">Writer's Hub</p>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            {/* Active Tab: Projects */}
            <a className="bg-paper-base text-ink-charcoal font-semibold rounded-lg shadow-sm flex items-center gap-3 px-4 py-2 active:scale-97 transition-transform duration-100" href="#">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>library_books</span>
              <span>Projects</span>
            </a>
            <Link href="/feedback" className="text-sage-slate hover:bg-surface-container-high transition-all rounded-lg flex items-center gap-3 px-4 py-2 text-left w-full">
              <span className="material-symbols-outlined">feedback</span>
              <span>Feedback</span>
            </Link>
          </div>
          <div className="mt-auto flex flex-col gap-2 border-t border-muted-border pt-4">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="text-sage-slate hover:bg-surface-container-high transition-all rounded-lg flex items-center gap-3 px-4 py-2 text-left w-full"
            >
              <span className="material-symbols-outlined">settings</span>
              <span>Settings</span>
            </button>
            <div className="flex items-center gap-3 mt-4 px-2">
              <div className="w-10 h-10 rounded-full border border-muted-border bg-surface-container-highest flex items-center justify-center font-headline-md text-headline-md text-ink-charcoal">
                {user?.name?.[0]?.toUpperCase() ?? "W"}
              </div>
              <div className="flex flex-col">
                <span className="font-body-ui text-body-ui font-medium">{user?.name ?? "Writer"}</span>
                <button onClick={logout} className="font-caption text-caption text-sage-slate hover:text-stationery-amber transition-colors text-left">
                  Lock vault
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-surface flex flex-col relative" style={{ scrollbarWidth: "thin", scrollbarColor: "#6B705C transparent" }}>
          {/* Mobile Header */}
          <header className="md:hidden flex justify-between items-center h-16 px-gutter w-full bg-paper-base border-b border-muted-border sticky top-0 z-10">
            <h1 className="font-headline-md text-headline-md font-bold text-ink-charcoal">Story Vault</h1>
            <button className="text-sage-slate hover:text-stationery-amber transition-colors duration-200 active:scale-97 transition-transform duration-100">
              <span className="material-symbols-outlined">menu</span>
            </button>
          </header>

          {/* Canvas */}
          <div className="px-canvas-margin py-12 max-w-[1200px] mx-auto w-full flex-1">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
              <div>
                <h2 className="font-display-hero text-display-hero text-ink-charcoal mb-2">Your Projects</h2>
                <p className="font-body-writing text-body-writing text-sage-slate">
                  Continue shaping your worlds. {projects?.length ? `You have ${projects.length} active draft${projects.length !== 1 ? "s" : ""}.` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <ImportSvpButton />
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                  <DialogTrigger asChild>
                    <button className="bg-ink-charcoal text-paper-base px-6 py-3 rounded hover:bg-surface-tint transition-colors flex items-center gap-2 active:scale-97 transition-transform duration-100 shadow-[0_4px_14px_0_rgba(45,41,38,0.2)]">
                      <span className="material-symbols-outlined">add</span>
                      <span className="font-medium">New Project</span>
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Project</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Project Title</Label>
                        <Input placeholder="e.g., The Gilded Age" value={title} onChange={(e) => setTitle(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Description (Optional)</Label>
                        <Textarea placeholder="Describe your project..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                      </div>
                      <div className="flex gap-3 justify-end pt-2">
                        <button onClick={() => setIsOpen(false)} className="px-4 py-2 border border-muted-border rounded bg-transparent text-ink-charcoal hover:bg-surface-container-low transition-colors">
                          Cancel
                        </button>
                        <button onClick={handleCreate} disabled={createMutation.isPending} className="px-6 py-2 bg-ink-charcoal text-paper-base rounded hover:bg-surface-tint transition-colors disabled:opacity-50">
                          {createMutation.isPending ? "Creating..." : "Create Project"}
                        </button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Project Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-sage-slate border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : projects && projects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="bg-paper-base border border-muted-border rounded-lg p-6 flex flex-col hover:border-outline-variant hover:shadow-[0_20px_40px_rgba(45,41,38,0.05)] transition-all duration-300 group cursor-pointer h-[320px]"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="bg-surface-variant text-ink-charcoal px-2 py-1 rounded font-label-caps text-label-caps uppercase tracking-widest">DRAFT</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <ExportSvpButton projectId={project.id} projectTitle={project.title} />
                        <button
                          onClick={() => {
                            setDeleteTarget({ id: project.id, title: project.title });
                            setDeleteConfirm("");
                          }}
                          className="text-sage-slate hover:text-error transition-colors p-1"
                        >
                          <span className="material-symbols-outlined">more_vert</span>
                        </button>
                      </div>
                    </div>
                    <h3 className="font-headline-lg text-headline-lg text-ink-charcoal mb-3 group-hover:text-stationery-amber transition-colors">
                      {project.title}
                    </h3>
                    {project.description && (
                      <p className="font-body-ui text-body-ui text-sage-slate line-clamp-3 mb-6 flex-1">
                        {project.description}
                      </p>
                    )}
                    <div className="border-t border-muted-border pt-4 flex justify-between items-center mt-auto">
                      <div className="flex gap-4">
                        <div className="flex items-center gap-1 text-sage-slate font-caption text-caption" title="Scenes">
                          <span className="material-symbols-outlined text-[16px]">auto_stories</span>
                          <span>{Number((project as any).sceneCount) || 0}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sage-slate font-caption text-caption" title="Actors">
                          <span className="material-symbols-outlined text-[16px]">group</span>
                          <span>{Number((project as any).actorCount) || 0}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sage-slate font-caption text-caption" title="Total Words">
                          <span className="material-symbols-outlined text-[16px]">edit_document</span>
                          <span>{Number((project as any).totalWordCount) || 0} words</span>
                        </div>
                      </div>
                      <span className="font-caption text-caption text-sage-slate shrink-0 ml-4">
                        {new Date(project.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">📖</div>
                <h3 className="font-headline-lg text-headline-lg text-ink-charcoal mb-2">No projects yet</h3>
                <p className="font-body-ui text-body-ui text-sage-slate mb-6">Create your first project to get started</p>
                <button onClick={() => setIsOpen(true)} className="bg-ink-charcoal text-paper-base px-6 py-3 rounded hover:bg-surface-tint transition-colors">
                  + New Project
                </button>
              </div>
            )}
          </div>

          {/* Shared Footer Component */}
          <footer className="mt-auto bg-surface-container-lowest py-12 border-t border-muted-border">
            <div className="flex flex-col md:flex-row justify-between items-center px-canvas-margin max-w-7xl mx-auto w-full gap-4">
              <span className="font-caption text-caption text-sage-slate opacity-80 hover:opacity-100 transition-opacity">
                © 2026 Story Vault. Crafted for professional writers.
              </span>
              <div className="flex gap-6">
                <Link href="/terms">
                  <a className="font-caption text-caption text-sage-slate hover:text-stationery-amber transition-colors opacity-80 hover:opacity-100">Terms</a>
                </Link>
                <Link href="/privacy">
                  <a className="font-caption text-caption text-sage-slate hover:text-stationery-amber transition-colors opacity-80 hover:opacity-100">Privacy</a>
                </Link>
                <Link href="/support">
                  <a className="font-caption text-caption text-sage-slate hover:text-stationery-amber transition-colors opacity-80 hover:opacity-100">Support</a>
                </Link>
              </div>
            </div>
          </footer>
        </main>
      </div>

      {/* Author Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-[900px] h-[85vh] overflow-y-auto bg-paper-base">
          <DialogHeader>
            <DialogTitle className="font-headline-md text-3xl text-ink-charcoal mb-4">Author Preferences</DialogTitle>
          </DialogHeader>
          <UserSettings />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirm("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-error">Delete Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="font-body-ui text-body-ui text-ink-charcoal">
              This will permanently delete <strong>{deleteTarget?.title}</strong> and all its scenes, versions, characters, and world-building notes. This cannot be undone.
            </p>
            <div className="bg-error-container border border-error rounded p-3">
              <p className="font-body-ui text-body-ui text-on-error-container font-semibold mb-2">Type the project title to confirm:</p>
              <p className="font-body-ui text-body-ui text-on-error-container font-bold mb-2">{deleteTarget?.title}</p>
              <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Type project title here" autoFocus />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirm("");
                }}
                className="px-4 py-2 border border-muted-border rounded bg-transparent text-ink-charcoal hover:bg-surface-container-low transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={deleteConfirm !== deleteTarget?.title || deleteMutation.isPending}
                onClick={() => deleteTarget && deleteMutation.mutate({ projectId: deleteTarget.id })}
                className="px-6 py-2 bg-error text-on-error rounded hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Forever"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
