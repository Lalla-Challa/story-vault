import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { SceneManager } from "@/components/SceneManager";
import { MainStoryView } from "@/components/MainStoryView";
import { ActorManager } from "@/components/ActorManager";
import { WorldModelManager } from "@/components/WorldModelManager";
import { SimulationWorkspace } from "@/components/simulation/SimulationWorkspace";
import { ProjectSettings } from "@/components/ProjectSettings";
import { UserSettings } from "@/components/UserSettings";
import { WritingStudio } from "@/components/WritingStudio";
import { DocumentPreview } from "@/components/DocumentPreview";
import { AgentWorkspace } from "@/components/agent/AgentWorkspace";
import { IdeaManager } from "@/components/ideas/IdeaManager";
import { IdeationChat } from "@/components/ideation/IdeationChat";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

type Tab =
  | "scenes"
  | "main-story"
  | "actors"
  | "world"
  | "simulation"
  | "agent"
  | "ideas"
  | "ideation"
  | "settings";

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "ideation", label: "Ideation", icon: "psychology" },
  { id: "scenes", label: "Scenes", icon: "auto_stories" },
  { id: "main-story", label: "Main Story", icon: "menu_book" },
  { id: "actors", label: "Actors", icon: "group" },
  { id: "world", label: "World", icon: "public" },
  { id: "simulation", label: "Simulation", icon: "neurology" },
  { id: "agent", label: "Agent", icon: "auto_awesome" },
  { id: "ideas", label: "Ideas", icon: "lightbulb" },
];

export default function ProjectWorkspace() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/projects/:projectId");
  const projectId = params?.projectId ? parseInt(params.projectId) : null;

  const [activeTab, setActiveTab] = useState<Tab>("scenes");
  const [settingsSubTab, setSettingsSubTab] = useState<"project" | "user">("project");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [agentOpenThreadId, setAgentOpenThreadId] = useState<number | null>(null);

  /** Idea Vault → "Evaluate with AI": open the Agent tab with that research thread. */
  const handleIdeaEvaluate = (threadId: number) => {
    setAgentOpenThreadId(threadId);
    setActiveTab("agent");
  };

  /** Ideation → "Initialize Working Agent": open the new scene in the Writing Studio. */
  const handleIdeationInitialized = (sceneId: number) => {
    setSelectedSceneId(sceneId);
    setSelectedVersionId(null);
    setActiveTab("scenes");
  };

  const { data: project, isLoading } = trpc.project.get.useQuery(
    { projectId: projectId ?? 0 },
    { enabled: !!projectId && isAuthenticated === true }
  );

  const { data: storageUsage } = trpc.storage.getUsage.useQuery(undefined, {
    enabled: !!projectId && isAuthenticated === true
  });
  
  const storagePercent = storageUsage 
    ? (storageUsage.usedBytes / storageUsage.limitBytes) * 100 
    : 0;

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, loading, navigate]);

  if (isLoading || !project) {
    return (
      <div className="h-screen flex items-center justify-center bg-paper-base">
        <span className="material-symbols-outlined animate-spin text-sage-slate text-[40px]">refresh</span>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-paper-base overflow-hidden selection:bg-stationery-amber/30">
      {/* TopAppBar - Brand & Global Actions */}
      <header className="bg-paper-base dark:bg-ink-charcoal text-ink-charcoal dark:text-paper-base font-body-ui text-body-ui border-b border-muted-border dark:border-on-surface-variant flex justify-between items-center h-16 px-gutter w-full sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-headline-md text-headline-md font-bold text-ink-charcoal dark:text-paper-base">Story Vault</span>
          <div className="hidden md:flex items-center gap-6 ml-8">
            <button 
              onClick={() => setActiveTab("scenes")}
              className={cn(
                "transition-colors duration-200 py-1",
                activeTab === "scenes" ? "text-ink-charcoal font-bold border-b-2 border-stationery-amber" : "text-sage-slate hover:text-stationery-amber"
              )}
            >
              Drafts
            </button>
            <button 
              onClick={() => setActiveTab("main-story")}
              className={cn(
                "transition-colors duration-200 py-1",
                activeTab === "main-story" ? "text-ink-charcoal font-bold border-b-2 border-stationery-amber" : "text-sage-slate hover:text-stationery-amber"
              )}
            >
              Manuscript
            </button>
            <button 
              onClick={() => setActiveTab("settings")}
              className={cn(
                "transition-colors duration-200 py-1",
                activeTab === "settings" ? "text-ink-charcoal font-bold border-b-2 border-stationery-amber" : "text-sage-slate hover:text-stationery-amber"
              )}
            >
              Settings
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 text-sage-slate hover:text-ink-charcoal transition-colors p-2 rounded-full hover:bg-surface-container-low"
            title="Global Search (Ctrl+K)"
          >
            <span className="material-symbols-outlined">search</span>
          </button>
          <Button 
            onClick={() => setPreviewOpen(true)}
            className="bg-paper-base dark:bg-stationery-amber text-ink-charcoal px-4 py-2 text-caption font-bold rounded hover:opacity-90 active:scale-97 transition-all flex items-center gap-2 border border-muted-border shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">ios_share</span>
            Preview & Export
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SideNavBar - Secondary Navigation */}
        <aside className="hidden lg:flex flex-col h-full p-4 gap-component-gap bg-surface-container-low dark:bg-primary-container text-ink-charcoal dark:text-paper-base border-r border-muted-border dark:border-on-surface-variant w-sidebar-width shrink-0">
          <div className="mb-6 px-2">
            <button onClick={() => navigate("/projects")} className="flex items-center gap-2 text-sage-slate hover:text-ink-charcoal transition-colors mb-2 text-xs uppercase tracking-widest font-label-caps text-left w-full">
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              <span>All Projects</span>
            </button>
            <p className="text-caption text-sage-slate">Drafting: {project.title}</p>
          </div>
          <nav className="flex-1 flex flex-col gap-2">
            {tabs.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex items-center gap-3 p-3 transition-all rounded-lg text-left group",
                  activeTab === id
                    ? "bg-paper-base text-ink-charcoal font-semibold shadow-sm"
                    : "text-sage-slate dark:text-on-primary-container hover:bg-surface-container-high"
                )}
              >
                <span className="material-symbols-outlined" style={activeTab === id ? { fontVariationSettings: "'FILL' 1" } : {}}>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <footer className="mt-auto flex flex-col gap-2 pt-4 border-t border-muted-border">
            <button
              onClick={() => setActiveTab("settings")}
              className={cn(
                "flex items-center gap-3 p-3 transition-all rounded-lg text-left group",
                activeTab === "settings"
                  ? "bg-paper-base text-ink-charcoal font-semibold shadow-sm"
                  : "text-sage-slate dark:text-on-primary-container hover:bg-surface-container-high"
              )}
            >
              <span className="material-symbols-outlined" style={activeTab === "settings" ? { fontVariationSettings: "'FILL' 1" } : {}}>settings</span>
              <span className="text-caption">Settings</span>
            </button>
            <button onClick={() => navigate("/projects")} className="flex items-center gap-3 p-3 text-sage-slate hover:bg-surface-container-high transition-all rounded-lg text-left">
              <span className="material-symbols-outlined">swap_horiz</span>
              <span className="text-caption">Project Switcher</span>
            </button>
          </footer>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-surface relative ink-scrollbar">
          {/* AI + simulation tabs get the full width; the rest keep the
              readable manuscript column. */}
          <div
            className={cn(
              "mx-auto w-full py-10",
              ["agent", "ideation", "ideas", "simulation"].includes(activeTab)
                ? "max-w-none px-4 sm:px-6 lg:px-8"
                : "max-w-5xl px-canvas-margin py-12"
            )}
          >
            {storagePercent > 90 && (
              <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                <Alert variant="destructive" className="bg-red-50 border-red-200">
                  <span className="material-symbols-outlined text-red-600 mr-2">cloud_off</span>
                  <AlertTitle className="text-red-900 font-bold">Storage Almost Full</AlertTitle>
                  <AlertDescription className="text-red-700">
                    You have used {storagePercent.toFixed(1)}% of your local vault. Please manage your versions or upgrade your storage limit.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {activeTab === "scenes" && (
              selectedSceneId ? (
                <WritingStudio 
                  projectId={projectId!}
                  sceneId={selectedSceneId}
                  initialVersionId={selectedVersionId}
                  onBack={() => { setSelectedSceneId(null); setSelectedVersionId(null); }}
                />
              ) : (
                <SceneManager
                  projectId={projectId!}
                  onSceneSelect={(id) => setSelectedSceneId(id)}
                />
              )
            )}

            {activeTab === "main-story" && <MainStoryView projectId={projectId!} />}
            {activeTab === "actors" && <ActorManager projectId={projectId!} />}
            {activeTab === "world" && <WorldModelManager projectId={projectId!} />}
            {activeTab === "simulation" && <SimulationWorkspace projectId={projectId!} />}
            {activeTab === "agent" && (
              <AgentWorkspace
                projectId={projectId!}
                initialResearchThreadId={agentOpenThreadId}
                onResearchThreadConsumed={() => setAgentOpenThreadId(null)}
              />
            )}
            {activeTab === "ideas" && (
              <IdeaManager projectId={projectId!} onEvaluate={handleIdeaEvaluate} />
            )}
            {activeTab === "ideation" && (
              <IdeationChat projectId={projectId!} onInitialized={handleIdeationInitialized} />
            )}
            {activeTab === "settings" && (
              <div className="space-y-12 text-left">
                <div className="flex overflow-x-auto scrollbar-hide gap-8 border-b border-muted-border/40 pb-px mb-8">
                  <button
                    onClick={() => setSettingsSubTab("project")}
                    className={cn(
                      "px-4 py-2 font-label-caps text-[10px] tracking-[0.2em] whitespace-nowrap transition-all text-left",
                      settingsSubTab === "project"
                        ? "text-ink-charcoal border-b-2 border-stationery-amber font-bold"
                        : "text-sage-slate hover:text-ink-charcoal opacity-60"
                    )}
                  >
                    PROJECT REFERENCES
                  </button>
                  <button
                    onClick={() => setSettingsSubTab("user")}
                    className={cn(
                      "px-4 py-2 font-label-caps text-[10px] tracking-[0.2em] whitespace-nowrap transition-all text-left",
                      settingsSubTab === "user"
                        ? "text-ink-charcoal border-b-2 border-stationery-amber font-bold"
                        : "text-sage-slate hover:text-ink-charcoal opacity-60"
                    )}
                  >
                    AUTHOR PREFERENCES
                  </button>
                </div>
                {settingsSubTab === "project" ? (
                  <ProjectSettings projectId={projectId!} />
                ) : (
                  <UserSettings />
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Document Preview Panel */}
      <DocumentPreview
        projectId={projectId!}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      {/* Global Search Modal */}
      <SearchModal 
        projectId={projectId!} 
        open={searchOpen} 
        onOpenChange={setSearchOpen}
        onSelectScene={(id) => {
          setActiveTab("scenes");
          setSelectedSceneId(id);
          setSearchOpen(false);
        }}
      />
    </div>
  );
}

import { Dialog, DialogContent } from "@/components/ui/dialog";

function SearchModal({ 
  projectId, 
  open, 
  onOpenChange,
  onSelectScene
}: { 
  projectId: number; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSelectScene: (id: number) => void;
}) {
  const [query, setSearchQuery] = useState("");
  const { data: scenes } = trpc.scene.list.useQuery({ projectId }, { enabled: open });
  const { data: actors } = trpc.actor.list.useQuery({ projectId }, { enabled: open });
  const { data: environments } = trpc.environment.list.useQuery({ projectId }, { enabled: open });
  const { data: systems } = trpc.worldSystem.list.useQuery({ projectId }, { enabled: open });

  const q = query.toLowerCase();
  const filteredScenes = scenes?.filter(s => s.title.toLowerCase().includes(q)).slice(0, 5);
  const filteredActors = actors?.filter(a => a.name.toLowerCase().includes(q)).slice(0, 5);
  const filteredEnvs = environments?.filter(e => e.name.toLowerCase().includes(q)).slice(0, 5);
  const filteredSystems = systems?.filter(s => s.name.toLowerCase().includes(q)).slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl top-[20%] translate-y-0 p-0 overflow-hidden bg-paper-base border-muted-border shadow-2xl">
        <div className="p-4 border-b border-muted-border bg-surface-container-low flex items-center gap-3">
          <span className="material-symbols-outlined text-sage-slate">search</span>
          <input
            autoFocus
            placeholder="Search scenes, actors, or world model..."
            value={query}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none font-body-ui text-lg text-ink-charcoal placeholder:text-sage-slate/50"
          />
          <kbd className="hidden sm:block px-2 py-1 bg-paper-base border border-muted-border rounded text-[10px] text-sage-slate font-mono">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-6 ink-scrollbar text-left">
          {query.length > 0 ? (
            <>
              {filteredScenes && filteredScenes.length > 0 && (
                <section>
                  <h4 className="font-label-caps text-[10px] uppercase tracking-widest text-sage-slate mb-3 px-2 text-left">Scenes</h4>
                  <div className="space-y-1">
                    {filteredScenes.map(s => (
                      <button 
                        key={s.id}
                        onClick={() => onSelectScene(s.id)}
                        className="w-full text-left p-3 hover:bg-surface-container-high rounded-lg transition-colors flex items-center gap-3 group"
                      >
                        <span className="material-symbols-outlined text-sage-slate group-hover:text-ink-charcoal">auto_stories</span>
                        <span className="font-medium text-ink-charcoal">{s.title}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {filteredActors && filteredActors.length > 0 && (
                <section>
                  <h4 className="font-label-caps text-[10px] uppercase tracking-widest text-sage-slate mb-3 px-2 text-left">Actors</h4>
                  <div className="space-y-1">
                    {filteredActors.map(c => (
                      <div 
                        key={c.id}
                        className="w-full text-left p-3 hover:bg-surface-container-high rounded-lg transition-colors flex items-center gap-3 group"
                      >
                        <span className="material-symbols-outlined text-sage-slate">group</span>
                        <span className="font-medium text-ink-charcoal">{c.name}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {filteredEnvs && filteredEnvs.length > 0 && (
                <section>
                  <h4 className="font-label-caps text-[10px] uppercase tracking-widest text-sage-slate mb-3 px-2 text-left">Environments</h4>
                  <div className="space-y-1">
                    {filteredEnvs.map(e => (
                      <div 
                        key={e.id}
                        className="w-full text-left p-3 hover:bg-surface-container-high rounded-lg transition-colors flex items-center gap-3 group"
                      >
                        <span className="material-symbols-outlined text-sage-slate">place</span>
                        <span className="font-medium text-ink-charcoal">{e.name}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {filteredSystems && filteredSystems.length > 0 && (
                <section>
                  <h4 className="font-label-caps text-[10px] uppercase tracking-widest text-sage-slate mb-3 px-2 text-left">Systems</h4>
                  <div className="space-y-1">
                    {filteredSystems.map(s => (
                      <div 
                        key={s.id}
                        className="w-full text-left p-3 hover:bg-surface-container-high rounded-lg transition-colors flex items-center gap-3 group"
                      >
                        <span className="material-symbols-outlined text-sage-slate">auto_fix_high</span>
                        <span className="font-medium text-ink-charcoal">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {(!filteredScenes?.length && !filteredActors?.length && !filteredEnvs?.length && !filteredSystems?.length) && (
                <div className="py-12 text-center text-sage-slate italic">
                  No matches found for "{query}"
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-sage-slate/50">
              <span className="material-symbols-outlined text-[48px] mb-2 block">manage_search</span>
              <p className="font-body-ui text-sm italic">Type to search your project...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
