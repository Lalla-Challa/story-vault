import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";

interface SceneManagerProps {
  projectId: number;
  onSceneSelect?: (sceneId: number) => void;
}

export function SceneManager({ projectId, onSceneSelect }: SceneManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sceneTitle, setSceneTitle] = useState("");
  const [sceneDescription, setSceneDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const utils = trpc.useUtils();
  const { data: scenes, isLoading } = trpc.scene.list.useQuery({ projectId });

  const createSceneMutation = trpc.scene.create.useMutation({
    onSuccess: (scene) => {
      toast.success("Scene created");
      setSceneTitle("");
      setSceneDescription("");
      setIsDialogOpen(false);
      utils.scene.list.invalidate();
      if (scene?.id && onSceneSelect) {
        onSceneSelect(scene.id);
      }
    },
  });

  const deleteSceneMutation = trpc.scene.delete.useMutation({
    onSuccess: () => {
      toast.success("Scene deleted");
      utils.scene.list.invalidate();
    },
  });

  const filteredScenes = scenes?.filter((scene) => {
    const matchesSearch = scene.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || scene.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-ink-charcoal">Scenes</h2>
          <p className="font-body-ui text-body-ui text-sage-slate mt-1">
            Organize and track your manuscript scenes
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-ink-charcoal text-paper-base hover:bg-primary-container transition-all hover:scale-97 active:scale-95 shadow-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">add</span>
              <span className="hidden sm:inline">New Scene</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-headline-md text-headline-md">Create New Scene</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="font-body-ui text-body-ui">Scene Title</Label>
                <Input
                  placeholder="e.g., The Arrival at Waverly Place"
                  value={sceneTitle}
                  onChange={(e) => setSceneTitle(e.target.value)}
                  className="bg-paper-base border-muted-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-body-ui text-body-ui">Description (Optional)</Label>
                <Input
                  placeholder="Brief scene summary..."
                  value={sceneDescription}
                  onChange={(e) => setSceneDescription(e.target.value)}
                  className="bg-paper-base border-muted-border"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-ink-charcoal text-paper-base hover:bg-primary-container"
                  onClick={() => {
                    if (!sceneTitle.trim()) {
                      toast.error("Title is required");
                      return;
                    }
                    createSceneMutation.mutate({
                      projectId,
                      title: sceneTitle,
                      description: sceneDescription,
                    });
                  }}
                  disabled={createSceneMutation.isPending}
                >
                  {createSceneMutation.isPending && (
                    <span className="material-symbols-outlined animate-spin mr-2">refresh</span>
                  )}
                  Create Scene
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sage-slate">
            search
          </span>
          <Input
            placeholder="Search scenes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-paper-base border-muted-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-paper-base border-muted-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="revised">Revised</SelectItem>
            <SelectItem value="final">Final</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scene List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="material-symbols-outlined animate-spin text-sage-slate text-[32px]">
            refresh
          </span>
        </div>
      ) : filteredScenes && filteredScenes.length > 0 ? (
        <div className="space-y-4">
          {filteredScenes.map((scene) => (
            <div
              key={scene.id}
              className="bg-paper-base border border-muted-border rounded p-6 shadow-[0_4px_20px_rgba(45,41,38,0.02)] hover:shadow-[0_8px_30px_rgba(45,41,38,0.05)] transition-shadow cursor-pointer group"
              onClick={() => onSceneSelect?.(scene.id)}
            >
              <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
                <div className="flex-1">
                  <h4 className="font-headline-md text-headline-md text-ink-charcoal group-hover:text-stationery-amber transition-colors">
                    {scene.title}
                  </h4>
                  {scene.description && (
                    <p className="font-caption text-caption text-sage-slate mt-1 line-clamp-2">
                      {scene.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-label-caps text-label-caps px-2 py-1 rounded ${
                      scene.status === "final"
                        ? "bg-ink-charcoal text-paper-base"
                        : scene.status === "revised"
                        ? "bg-stationery-amber text-ink-charcoal"
                        : "bg-surface-dim text-sage-slate"
                    }`}
                  >
                    {scene.status?.toUpperCase() || "DRAFT"}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSceneSelect?.(scene.id);
                      }}
                      className="text-sage-slate hover:text-ink-charcoal p-2 rounded-full hover:bg-surface-container-high transition-all"
                      title="Edit Scene"
                    >
                      <span className="material-symbols-outlined text-[20px]">edit</span>
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="text-sage-slate hover:text-error p-2 rounded-full hover:bg-surface-container-high transition-all"
                          title="Delete Scene"
                        >
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Scene</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{scene.title}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteSceneMutation.mutate({ sceneId: scene.id })}
                            className="bg-error text-on-error"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-muted-border">
                <div className="flex gap-4 text-sage-slate font-caption text-caption">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">description</span>
                    <span>{scene.wordCount || 0} words</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    <span>
                      {scene.updatedAt ? format(new Date(scene.updatedAt), "MMM d, yyyy") : "Never"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border border-dashed border-muted-border rounded-lg bg-surface-container-low">
          <span className="material-symbols-outlined text-[48px] text-sage-slate opacity-50 mb-4 block">
            auto_stories
          </span>
          <p className="font-body-ui text-body-ui text-sage-slate">
            {searchQuery || statusFilter !== "all" ? "No scenes match your filters" : "No scenes yet"}
          </p>
          {!searchQuery && statusFilter === "all" && (
            <Button
              onClick={() => setIsDialogOpen(true)}
              variant="outline"
              className="mt-4"
            >
              Create your first scene
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
