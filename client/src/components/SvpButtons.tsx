import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── Export a single project as .svp ─────────────────────────────────────────

export function ExportSvpButton({ projectId, projectTitle, size = "sm" }: {
  projectId: number;
  projectTitle: string;
  size?: "sm" | "default";
}) {
  const [loading, setLoading] = useState(false);

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation(); // don't navigate into project when clicking on card
    setLoading(true);
    try {
      const res = await fetch(`/api/rest/svp/export/${projectId}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectTitle.replace(/[^a-z0-9]/gi, "_")}.svp`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${projectTitle}.svp`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to export project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size={size}
      variant="outline"
      className="gap-1.5 text-xs border-violet-300 text-violet-700 hover:bg-violet-50"
      onClick={handleExport}
      disabled={loading}
      title="Export as .svp (Story Vault Project file)"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {size === "default" ? (loading ? "Exporting…" : "Export .svp") : ".svp"}
    </Button>
  );
}

// ─── Import a .svp file as a new project ─────────────────────────────────────

export function ImportSvpButton({ onImported }: { onImported?: (projectId: number) => void }) {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".svp")) {
      toast.error("Please select a valid .svp file");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/rest/svp/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast.success(`Imported "${data.title}" successfully`);
      utils.project.list.invalidate();
      onImported?.(data.projectId);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to import project");
    } finally {
      setLoading(false);
      // reset so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".svp"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="outline"
        className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        title="Import a .svp Story Vault Project file"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {loading ? "Importing…" : "Import .svp"}
      </Button>
    </>
  );
}
