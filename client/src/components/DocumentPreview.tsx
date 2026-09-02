import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2 } from "lucide-react";

interface DocumentPreviewProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentPreview({ projectId, open, onOpenChange }: DocumentPreviewProps) {
  const [authorName, setAuthorName] = useState("");
  const { data: userSettings } = trpc.userSettings.get.useQuery(undefined, { enabled: open });
  
  useEffect(() => {
    if (userSettings?.penName && !authorName) {
      setAuthorName(userSettings.penName);
    }
  }, [userSettings, open]);

  const { data: project } = trpc.project.get.useQuery({ projectId }, { enabled: open });
  const { data: mainStory, isLoading: loadingStory } = trpc.mainStory.get.useQuery({ projectId }, { enabled: open });
  const { data: scenes } = trpc.scene.list.useQuery({ projectId }, { enabled: open });

  const exportManuscriptMutation = trpc.export.manuscript.useMutation({
    onSuccess: (data) => {
      downloadBase64(data.content, data.filename, data.contentType);
      toast.success(`${data.filename} exported successfully`);
    },
    onError: (e) => toast.error(e.message || "Export failed"),
  });

  const exportZipMutation = trpc.export.projectZip.useMutation({
    onSuccess: (data) => {
      downloadBase64(data.content, data.filename, data.contentType);
      toast.success("Project backup created");
    },
    onError: (e) => toast.error(e.message || "Backup failed"),
  });

  const downloadBase64 = (base64: string, filename: string, contentType: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const isExporting = exportManuscriptMutation.isPending || exportZipMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-[95vw] sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-[1000px] h-[94vh] flex flex-col bg-background p-0 gap-0 overflow-hidden border-muted-border shadow-2xl rounded-xl" 
        showCloseButton={false}
      >
        {/* Streamlined Quiet Header */}
        <header className="flex items-center justify-between px-8 py-3 border-b border-muted-border/40 bg-paper-base shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <span className="material-symbols-outlined text-sage-slate text-lg shrink-0">auto_stories</span>
              <DialogTitle className="font-headline-md text-lg text-ink-charcoal tracking-tight shrink-0">Manuscript</DialogTitle>
            </div>
            
            <div className="h-4 w-px bg-muted-border/60 mx-2 hidden sm:block shrink-0" />
            
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-bold text-sage-slate uppercase tracking-widest shrink-0">Author:</span>
              <input 
                placeholder="Name for title page..." 
                value={authorName} 
                onChange={(e) => setAuthorName(e.target.value)}
                className="bg-transparent border-none outline-none text-xs font-medium text-ink-charcoal placeholder:text-sage-slate/40 min-w-0 w-[180px] focus:ring-0"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  className="bg-ink-charcoal text-paper-base hover:bg-primary-container h-9 px-5 active:scale-97 transition-all flex items-center gap-2 shadow-sm font-label-caps text-[10px] tracking-widest shrink-0"
                  disabled={isExporting || !mainStory || mainStory.length === 0}
                >
                  {isExporting ? <span className="material-symbols-outlined animate-spin text-sm">refresh</span> : <span className="material-symbols-outlined text-sm">ios_share</span>}
                  EXPORT
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-paper-base border-muted-border min-w-[220px] p-2 shadow-2xl">
                <div className="px-2 py-1.5 text-[9px] font-bold text-sage-slate uppercase tracking-widest border-b border-muted-border/40 mb-1">Select Format</div>
                <DropdownMenuItem onClick={() => exportManuscriptMutation.mutate({ projectId, format: "pdf", authorName })} className="cursor-pointer rounded-md py-2 text-sm">
                  <span className="material-symbols-outlined mr-2.5 text-red-600 text-lg">picture_as_pdf</span>
                  PDF Manuscript
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportManuscriptMutation.mutate({ projectId, format: "docx", authorName })} className="cursor-pointer rounded-md py-2 text-sm">
                  <span className="material-symbols-outlined mr-2.5 text-blue-600 text-lg">description</span>
                  Word Document
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportManuscriptMutation.mutate({ projectId, format: "md", authorName })} className="cursor-pointer rounded-md py-2 text-sm">
                  <span className="material-symbols-outlined mr-2.5 text-sage-slate text-lg">article</span>
                  Markdown File
                </DropdownMenuItem>
                <div className="h-px bg-muted-border my-1.5" />
                <DropdownMenuItem onClick={() => exportZipMutation.mutate({ projectId, authorName })} className="cursor-pointer text-stationery-amber rounded-md py-2 text-sm">
                  <span className="material-symbols-outlined mr-2.5 text-lg">folder_zip</span>
                  Full Backup (.zip)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <button 
              onClick={() => onOpenChange(false)}
              className="p-1.5 text-sage-slate hover:text-ink-charcoal transition-colors rounded-full hover:bg-surface-container-low shrink-0"
              title="Close Preview"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto bg-surface-container-low/30 ink-scrollbar">
          <div className="max-w-[850px] mx-auto py-20 px-16 bg-paper-base my-10 shadow-2xl min-h-full border border-muted-border/20 relative rounded-sm">
            {/* Paper Texture Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.02] mix-blend-multiply" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' /%3E%3C/svg%3E")` }} />

            {loadingStory ? (
              <div className="flex items-center justify-center py-40">
                <span className="material-symbols-outlined animate-spin text-sage-slate text-[48px]">refresh</span>
              </div>
            ) : mainStory && mainStory.length > 0 ? (
              <div className="relative z-10">
                {/* Visual Title Page - Now Interactive */}
                <div className="h-[500px] flex flex-col items-center justify-center border-b border-muted-border/10 mb-20">
                  <span className="text-[10px] font-bold text-sage-slate uppercase tracking-[0.4em] mb-12 opacity-50">Draft Manuscript</span>
                  <h1 className="font-display-hero text-6xl text-ink-charcoal text-center mb-8 tracking-tighter">
                    {project?.title || "Your Narrative"}
                  </h1>
                  
                  <div className="flex flex-col items-center gap-2 group">
                    <label className="text-[9px] font-bold text-sage-slate uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-300">Author Name</label>
                    <input 
                      placeholder="Type your name here..." 
                      value={authorName} 
                      onChange={(e) => setAuthorName(e.target.value)}
                      className="font-body-writing text-2xl text-sage-slate italic text-center bg-transparent border-none outline-none focus:text-ink-charcoal placeholder:opacity-30 transition-colors"
                    />
                    <div className="w-12 h-px bg-stationery-amber/30 group-hover:w-24 transition-all duration-500"></div>
                  </div>
                </div>

                <div className="space-y-32">
                  {mainStory.map((item, index) => {
                    const scene = scenes?.find((s) => s.id === item.sceneId);
                    return (
                      <section key={item.id} className="space-y-12">
                        <div className="text-center relative">
                          <div className="flex items-center justify-center gap-4 mb-4 opacity-30">
                            <div className="h-px bg-muted-border w-8"></div>
                            <span className="font-label-caps text-[10px] tracking-[0.3em]">SCENE {index + 1}</span>
                            <div className="h-px bg-muted-border w-8"></div>
                          </div>
                          <h2 className="font-headline-lg text-4xl text-ink-charcoal tracking-tight">
                            {scene?.title || `Untitled Scene`}
                          </h2>
                        </div>
                        <div className="px-4 prose-literata">
                          <VersionContent versionId={item.versionId} />
                        </div>
                        {index < mainStory.length - 1 && (
                          <div className="flex justify-center pt-16">
                            <span className="material-symbols-outlined text-sage-slate/10 text-[40px]">more_horiz</span>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-40 relative z-10">
                <span className="material-symbols-outlined text-[80px] text-sage-slate opacity-20 mb-6 block">
                  menu_book
                </span>
                <p className="font-headline-md text-sage-slate italic opacity-40">
                  Your manuscript awaits its first lines.
                </p>
                <p className="text-xs font-label-caps text-sage-slate mt-4 tracking-widest uppercase">Add scenes in the Manuscript tab to curate your draft.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VersionContent({ versionId }: { versionId: number }) {
  const { data: version, isLoading, isError } = trpc.version.get.useQuery({ versionId });

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-sage-slate mx-auto" />
        <p className="font-caption text-caption text-sage-slate mt-2">Loading version…</p>
      </div>
    );
  }

  if (isError || !version) {
    return (
      <div className="text-center py-8">
        <p className="font-caption text-caption text-error">Version not found</p>
      </div>
    );
  }

  return (
    <div
      className="font-body-writing text-body-writing text-ink-charcoal leading-relaxed"
      dangerouslySetInnerHTML={{ __html: version.content }}
    />
  );
}
