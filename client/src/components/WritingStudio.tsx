import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { RichTextEditor } from "./RichTextEditor";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useWritingHeartbeat } from "@/hooks/useWritingHeartbeat";
import { cn, formatVersionTimestamp } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WritingStudioProps {
  projectId: number;
  sceneId: number;
  initialVersionId?: number | null;
  onBack: () => void;
}

export function WritingStudio({ projectId, sceneId, initialVersionId, onBack }: WritingStudioProps) {
  const [content, setContent] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [versionLabel, setVersionLabel] = useState<"draft" | "revised" | "final">("draft");
  const [autoStatus, setAutoStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Document Layout State
  const [layout, setLayout] = useState({
    direction: "ltr" as "ltr" | "rtl" | "auto",
    orientation: "horizontal" as "horizontal" | "vertical",
    fontFamily: "Literata",
    viewMode: "sanctuary" as "sanctuary" | "professional"
  });

  const { noteKeystroke } = useWritingHeartbeat({ projectId });

  const utils = trpc.useUtils();
  const { data: scene } = trpc.scene.get.useQuery({ sceneId });
  const { data: versions, isLoading: loadingVersions } = trpc.version.list.useQuery({ sceneId });

  // Auto-save: persist content shortly after the user stops typing.
  const isInitialLoadRef = useRef(false);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const lastAutoSavedRef = useRef<string>("");
  const autoSaveMut = trpc.version.create.useMutation({
    onSuccess: (result) => {
      if (result?.id) setSelectedVersionId(result.id.toString());
      utils.version.list.invalidate({ sceneId });
      setAutoStatus("saved");
      setTimeout(() => setAutoStatus("idle"), 1400);
    },
    onError: () => {
      setAutoStatus("error");
      setTimeout(() => setAutoStatus("idle"), 2000);
    },
  });
  useEffect(() => {
    if (!isInitialLoadRef.current) {
      if (content) lastAutoSavedRef.current = content;
      isInitialLoadRef.current = true;
      return;
    }
    const html = content;
    if (!html.trim() || html === lastAutoSavedRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setAutoStatus("saving");
      lastAutoSavedRef.current = html;
      autoSaveMut.mutate({ sceneId, content: html, versionLabel });
    }, 1800);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [content, sceneId, versionLabel]);
  
  const exportMutation = trpc.export.singleItem.useMutation({
    onSuccess: (data) => {
      const byteCharacters = atob(data.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.contentType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`${data.filename} exported`);
    },
    onError: (e) => toast.error(e.message || "Export failed"),
  });

  const createVersionMutation = trpc.version.create.useMutation({
    onSuccess: (newVersion) => {
      toast.success("Version saved");
      utils.version.list.invalidate({ sceneId });
      if (newVersion?.id) {
        setSelectedVersionId(newVersion.id.toString());
      }
    }
  });

  const updateSceneMutation = trpc.scene.update.useMutation({
    onSuccess: () => {
      utils.scene.list.invalidate({ projectId });
    }
  });

  // Load initial or latest version
  useEffect(() => {
    if (versions && versions.length > 0) {
      const versionToLoad = initialVersionId 
        ? versions.find(v => v.id === initialVersionId) 
        : versions[versions.length - 1];
        
      if (versionToLoad) {
        setContent(versionToLoad.content);
        setSelectedVersionId(versionToLoad.id.toString());
        setVersionLabel(versionToLoad.versionLabel);
      }
    }
  }, [versions, initialVersionId]);

  const handleSave = () => {
    createVersionMutation.mutate({
      sceneId,
      content,
      versionLabel
    });
    // Also update scene status if it changed
    if (scene && scene.status !== versionLabel) {
      updateSceneMutation.mutate({
        sceneId,
        title: scene.title,
        status: versionLabel
      });
    }
  };

  const handleVersionChange = (id: string) => {
    const v = versions?.find(v => v.id.toString() === id);
    if (v) {
      setContent(v.content);
      setSelectedVersionId(id);
      setVersionLabel(v.versionLabel);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-[900px] mx-auto">
      {/* Integrated Minimalist Header */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-sage-slate hover:text-ink-charcoal transition-colors group px-2 py-1 -ml-2"
          >
            <span className="material-symbols-outlined transition-transform group-hover:-translate-x-1">arrow_back</span>
            <span className="font-label-caps text-[10px] uppercase tracking-[0.2em]">Back to Scenes</span>
          </button>
          
          <div className="flex items-center gap-3">
             {createVersionMutation.isPending && (
               <span className="text-[10px] font-label-caps uppercase text-stationery-amber animate-pulse">Saving version…</span>
             )}
             {!createVersionMutation.isPending && autoStatus !== "idle" && (
               <span className={`text-[10px] font-label-caps uppercase animate-pulse ${autoStatus === "error" ? "text-error" : autoStatus === "saved" ? "text-green-600" : "text-stationery-amber"}`}>
                 {autoStatus === "saving" ? "Auto-saving…" : autoStatus === "saved" ? "Auto-saved" : "Auto-save error — will retry"}
               </span>
             )}
             
             {/* Document Layout Settings */}
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-sage-slate hover:text-ink-charcoal transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-muted-border/30 bg-surface-container-low/20 shadow-sm hover:shadow transition-all">
                    <span className="material-symbols-outlined text-sm">settings_suggest</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest">Document Layout</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-paper-base border-muted-border min-w-[240px] p-2 shadow-2xl">
                  <div className="px-2 py-1.5 text-[9px] font-bold text-sage-slate uppercase tracking-widest border-b border-muted-border/40 mb-2 font-body-ui">Editor Engine Config</div>
                  
                  <div className="space-y-4 p-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-sage-slate uppercase font-body-ui">Text Direction</label>
                      <div className="flex bg-surface-container-low p-0.5 rounded-md">
                        <button 
                          onClick={() => setLayout({...layout, direction: 'ltr'})}
                          className={cn("flex-1 text-[10px] py-1 rounded font-body-ui transition-all", layout.direction === 'ltr' ? "bg-white shadow-sm text-ink-charcoal font-bold" : "text-sage-slate hover:text-ink-charcoal")}
                        >LTR</button>
                        <button 
                          onClick={() => setLayout({...layout, direction: 'rtl'})}
                          className={cn("flex-1 text-[10px] py-1 rounded font-body-ui transition-all", layout.direction === 'rtl' ? "bg-white shadow-sm text-ink-charcoal font-bold" : "text-sage-slate hover:text-ink-charcoal")}
                        >RTL</button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-sage-slate uppercase font-body-ui">Writing Orientation</label>
                      <div className="flex bg-surface-container-low p-0.5 rounded-md">
                        <button 
                          onClick={() => setLayout({...layout, orientation: 'horizontal'})}
                          className={cn("flex-1 text-[10px] py-1 rounded font-body-ui transition-all", layout.orientation === 'horizontal' ? "bg-white shadow-sm text-ink-charcoal font-bold" : "text-sage-slate hover:text-ink-charcoal")}
                        >HORIZONTAL</button>
                        <button 
                          onClick={() => setLayout({...layout, orientation: 'vertical'})}
                          className={cn("flex-1 text-[10px] py-1 rounded font-body-ui transition-all", layout.orientation === 'vertical' ? "bg-white shadow-sm text-ink-charcoal font-bold" : "text-sage-slate hover:text-ink-charcoal")}
                        >VERTICAL</button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-sage-slate uppercase font-body-ui">View Mode</label>
                      <div className="flex bg-surface-container-low p-0.5 rounded-md">
                        <button 
                          onClick={() => setLayout({...layout, viewMode: 'sanctuary'})}
                          className={cn("flex-1 text-[10px] py-1 rounded font-body-ui transition-all", layout.viewMode === 'sanctuary' ? "bg-white shadow-sm text-ink-charcoal font-bold" : "text-sage-slate hover:text-ink-charcoal")}
                        >SANCTUARY</button>
                        <button 
                          onClick={() => setLayout({...layout, viewMode: 'professional'})}
                          className={cn("flex-1 text-[10px] py-1 rounded font-body-ui transition-all", layout.viewMode === 'professional' ? "bg-white shadow-sm text-ink-charcoal font-bold" : "text-sage-slate hover:text-ink-charcoal")}
                        >PAGE VIEW</button>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-muted-border/30">
                      <label className="text-[10px] font-bold text-sage-slate uppercase font-body-ui">Language Typography</label>
                      <Select value={layout.fontFamily} onValueChange={(v) => setLayout({...layout, fontFamily: v})}>
                        <SelectTrigger className="h-7 text-[10px] bg-transparent border-muted-border/40 font-body-ui">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-paper-base border-muted-border">
                          <SelectItem value="Literata" className="text-xs font-body-ui">Literata (Serif/Latin)</SelectItem>
                          <SelectItem value="Inter" className="text-xs font-body-ui">Inter (Sans/Latin)</SelectItem>
                          <SelectItem value="Noto Sans Arabic" className="text-xs font-arabic">Noto Sans Arabic</SelectItem>
                          <SelectItem value="Noto Sans JP" className="text-xs font-body-ui font-jp">Noto Sans JP (CJK)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </DropdownMenuContent>
             </DropdownMenu>

             {selectedVersionId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-sage-slate hover:text-stationery-amber transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-muted-border/30 bg-surface-container-low/20">
                      <span className="material-symbols-outlined text-sm">ios_share</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest">Export Version</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-paper-base border-muted-border">
                    <DropdownMenuItem onClick={() => exportMutation.mutate({ type: "scene_version", id: parseInt(selectedVersionId), format: "pdf" })} className="cursor-pointer">
                      Export as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportMutation.mutate({ type: "scene_version", id: parseInt(selectedVersionId), format: "md" })} className="cursor-pointer">
                      Export as Markdown
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
             )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-end gap-6 pb-6 border-b border-muted-border/60">
          <div className="flex-1 min-w-0">
            <h3 className="font-headline-lg text-3xl text-ink-charcoal truncate tracking-tight">{scene?.title}</h3>
            <p className="font-body-ui text-xs text-sage-slate mt-1 italic opacity-70">
              Last edited {scene?.updatedAt ? new Date(scene.updatedAt).toLocaleDateString() : 'recently'}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 shrink-0 mb-1">
            <div className="flex items-center gap-2 bg-surface-container-low/40 px-3 py-1.5 rounded-lg border border-muted-border/30">
              <span className="text-[10px] font-bold font-body-ui text-sage-slate uppercase tracking-wider">Version</span>
              <Select value={selectedVersionId} onValueChange={handleVersionChange}>
                <SelectTrigger className="w-36 border-none bg-transparent h-6 focus:ring-0 shadow-none px-1 text-ink-charcoal font-medium text-xs">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {versions?.map(v => (
                    <SelectItem key={v.id} value={v.id.toString()}>
                      {v.versionLabel.toUpperCase()} - {formatVersionTimestamp(v.createdAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 bg-surface-container-low/40 px-3 py-1.5 rounded-lg border border-muted-border/30">
              <span className="text-[10px] font-bold font-body-ui text-sage-slate uppercase tracking-wider">Status</span>
              <Select value={versionLabel} onValueChange={(v: any) => setVersionLabel(v)}>
                <SelectTrigger className="w-24 border-none bg-transparent h-6 focus:ring-0 shadow-none px-1 text-ink-charcoal font-medium text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">DRAFT</SelectItem>
                  <SelectItem value="revised">REVISED</SelectItem>
                  <SelectItem value="final">FINAL</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleSave} 
              disabled={createVersionMutation.isPending}
              className="bg-ink-charcoal text-paper-base hover:bg-primary-container h-9 px-5 active:scale-97 transition-all shadow-sm font-label-caps text-[11px] tracking-widest"
            >
              SAVE VERSION
            </Button>
          </div>
        </div>
      </div>

      <div className="relative group">
        <div className="absolute -inset-1.5 bg-muted-border/10 rounded-2xl -rotate-1 group-hover:rotate-0 transition-transform duration-700" />
        <div className="absolute -inset-1.5 bg-muted-border/10 rounded-2xl rotate-0.5 group-hover:rotate-0 transition-transform duration-700" />
        
        <RichTextEditor 
          projectId={projectId}
          value={content}
          onChange={(html) => {
            setContent(html);
            noteKeystroke();
          }}
          layout={layout}
          className={cn(
            "relative z-10 flex-1 min-h-[75vh] shadow-paper border-muted-border/30 rounded-xl",
            layout.viewMode === "professional" && "rounded-none border-none shadow-none"
          )}
          placeholder="Begin weaving your story..."
        />
      </div>
    </div>
  );
}
