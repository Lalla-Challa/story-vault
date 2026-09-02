import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { cn, formatVersionTimestamp } from "@/lib/utils";
import { DocumentPreview } from "@/components/DocumentPreview";

const labelColors: Record<string, string> = {
  draft: "bg-surface-dim text-sage-slate",
  revised: "bg-stationery-amber text-ink-charcoal",
  final: "bg-ink-charcoal text-paper-base",
};

function StorySceneRow({
  item,
  index,
  sceneTitle,
  onRemove,
  removing,
  onUpdateVersion,
}: {
  item: { id: number; sceneId: number; versionId: number; order: number };
  index: number;
  sceneTitle: string;
  onRemove: () => void;
  removing: boolean;
  onUpdateVersion: (versionId: number) => void;
}) {
  const { data: versions, isLoading } = trpc.version.list.useQuery({ sceneId: item.sceneId });
  const version = versions?.find((v) => v.id === item.versionId);
  const versionMissing = !isLoading && versions !== undefined && !version;

  const contentPreview = version?.content 
    ? version.content.replace(/<[^>]*>?/gm, '').substring(0, 300) + '...'
    : "No content in this version.";

  return (
    <div className="bg-paper-base border border-muted-border rounded-xl p-6 shadow-[0_4px_20px_rgba(45,41,38,0.02)] hover:shadow-[0_8px_30px_rgba(45,41,38,0.05)] transition-shadow">
      <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
        <div>
          <h4 className="font-headline-md text-headline-md text-ink-charcoal">
            {index + 1}. {sceneTitle}
          </h4>
          <p className="font-caption text-caption text-sage-slate mt-1">
            Scene ID: {item.sceneId} · Version: {version?.versionLabel.toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="font-label-caps text-label-caps text-sage-slate uppercase tracking-widest mr-1">Version:</label>
          <div className="relative inline-block w-48">
            <Select 
              value={item.versionId.toString()} 
              onValueChange={(v) => onUpdateVersion(parseInt(v))}
            >
              <SelectTrigger className={cn(
                "w-full font-body-ui text-body-ui rounded focus:ring-2 focus:ring-stationery-amber",
                version?.versionLabel === 'final' ? "bg-ink-charcoal text-white" : "bg-surface-variant text-ink-charcoal"
              )}>
                <SelectValue />
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
          <button
            className="text-sage-slate hover:text-error transition-colors p-2"
            onClick={onRemove}
            disabled={removing}
          >
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>
      </div>

      <div className="relative">
        <p className="font-body-writing text-body-writing text-on-surface-variant line-clamp-3 opacity-80">
          {contentPreview}
        </p>
        <div className="absolute bottom-0 right-0 left-0 h-12 bg-gradient-to-t from-paper-base to-transparent pointer-events-none"></div>
      </div>

      {versionMissing && (
        <div className="mt-4 flex items-start gap-2 bg-error-container border border-error rounded px-3 py-2">
          <span className="material-symbols-outlined text-error shrink-0 text-[20px]">warning</span>
          <p className="font-caption text-caption text-on-error-container">
            The version assigned to this scene has been deleted.
          </p>
        </div>
      )}
    </div>
  );
}

export function MainStoryView({ projectId }: { projectId: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const utils = trpc.useUtils();
  const { data: mainStory, isLoading } = trpc.mainStory.get.useQuery({ projectId });
  const { data: scenes } = trpc.scene.list.useQuery({ projectId });
  const { data: versions } = trpc.version.list.useQuery(
    { sceneId: parseInt(selectedSceneId) },
    { enabled: !!selectedSceneId }
  );

  const addSceneMutation = trpc.mainStory.addScene.useMutation({
    onSuccess: () => {
      toast.success("Scene added to main story");
      setSelectedSceneId("");
      setSelectedVersionId("");
      setIsOpen(false);
      utils.mainStory.get.invalidate();
    },
  });

  const updateSceneMutation = trpc.mainStory.updateScene.useMutation({
    onSuccess: () => {
      utils.mainStory.get.invalidate();
    },
  });

  const removeSceneMutation = trpc.mainStory.removeScene.useMutation({
    onSuccess: () => {
      toast.success("Scene removed");
      utils.mainStory.get.invalidate();
    },
  });

  const handleAdd = () => {
    if (!selectedSceneId || !selectedVersionId) {
      toast.error("Select a scene and version");
      return;
    }
    addSceneMutation.mutate({
      projectId,
      sceneId: parseInt(selectedSceneId),
      versionId: parseInt(selectedVersionId),
      order: (mainStory?.length ?? 0) + 1,
    });
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-muted-border pb-6">
        <div>
          <h2 className="font-display-hero text-display-hero text-ink-charcoal mb-2">Manuscript Assembly</h2>
          <p className="font-body-writing text-body-writing text-sage-slate">
            Curate the final versions for your manuscript
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => setShowPreview(true)}
            className="border-muted-border text-ink-charcoal hover:bg-surface-container-low transition-colors flex items-center gap-2 active:scale-97"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              book
            </span>
            Preview Manuscript
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="bg-ink-charcoal text-paper-base hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2 active:scale-97">
                <span className="material-symbols-outlined text-[20px]">
                  add
                </span>
                Add Scene
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-headline-md text-headline-md">Add Scene to Main Story</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="font-body-ui text-body-ui text-ink-charcoal">Scene</label>
                  <Select
                    value={selectedSceneId}
                    onValueChange={(v) => {
                      setSelectedSceneId(v);
                      setSelectedVersionId("");
                    }}
                  >
                    <SelectTrigger className="bg-paper-base border-muted-border">
                      <SelectValue placeholder="Choose a scene..." />
                    </SelectTrigger>
                    <SelectContent>
                      {scenes?.map((s) => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedSceneId && (
                  <div className="space-y-2">
                    <label className="font-body-ui text-body-ui text-ink-charcoal">Version</label>
                    <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
                      <SelectTrigger className="bg-paper-base border-muted-border">
                        <SelectValue placeholder="Choose a version..." />
                      </SelectTrigger>
                      <SelectContent>
                        {versions?.map((v) => (
                          <SelectItem key={v.id} value={v.id.toString()}>
                            {v.versionLabel.toUpperCase()} — {formatVersionTimestamp(v.createdAt)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="bg-ink-charcoal text-paper-base hover:bg-primary-container"
                    onClick={handleAdd}
                    disabled={addSceneMutation.isPending}
                  >
                    {addSceneMutation.isPending && (
                      <span className="material-symbols-outlined animate-spin mr-2">refresh</span>
                    )}
                    Add to Story
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-sage-slate text-[32px]">refresh</span>
        </div>
      ) : mainStory && mainStory.length > 0 ? (
        <div className="space-y-8">
          {mainStory.map((item, index) => {
            const scene = scenes?.find((s) => s.id === item.sceneId);
            return (
              <StorySceneRow
                key={item.id}
                item={item}
                index={index}
                sceneTitle={scene?.title ?? `Scene #${item.sceneId}`}
                onRemove={() => removeSceneMutation.mutate({ mainStorySceneId: item.id })}
                removing={removeSceneMutation.isPending}
                onUpdateVersion={(versionId) => updateSceneMutation.mutate({
                  mainStorySceneId: item.id,
                  versionId,
                  order: item.order
                })}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 border border-dashed border-muted-border rounded-lg bg-surface-container-low">
          <span className="material-symbols-outlined text-[64px] text-sage-slate opacity-50 mb-4 block">
            menu_book
          </span>
          <p className="font-body-ui text-body-ui text-sage-slate">No scenes in main story yet</p>
          <p className="font-caption text-caption text-sage-slate mt-1">
            Add scenes to assemble your final script
          </p>
        </div>
      )}

      {showPreview && (
        <DocumentPreview
          projectId={projectId}
          open={showPreview}
          onOpenChange={setShowPreview}
        />
      )}
    </div>
  );
}
