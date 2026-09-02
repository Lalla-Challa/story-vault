import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function UserSettings() {
  const { setTheme } = useTheme();
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.userSettings.get.useQuery();
  const [form, setForm] = useState({
    penName: "",
    bio: "",
    theme: "light" as "light" | "dark" | "sepia",
    defaultExportFormat: "pdf" as "md" | "docx" | "pdf",
    writingGoalDaily: 500,
  });

  const updateMutation = trpc.userSettings.update.useMutation({
    onSuccess: () => {
      toast.success("Profile updated successfully");
      utils.userSettings.get.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to update profile"),
  });

  useEffect(() => {
    if (settings) {
      setForm({
        penName: settings.penName || "",
        bio: settings.bio || "",
        theme: settings.theme as any,
        defaultExportFormat: settings.defaultExportFormat as any,
        writingGoalDaily: settings.writingGoalDaily || 500,
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  const handleThemeChange = (newTheme: "light" | "dark" | "sepia") => {
    setForm({ ...form, theme: newTheme });
    setTheme(newTheme);
  };

  const { data: storageUsage } = trpc.storage.getUsage.useQuery();
  const storagePercent = storageUsage 
    ? Math.min(100, Math.round((storageUsage.usedBytes / storageUsage.limitBytes) * 100)) 
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-symbols-outlined animate-spin text-sage-slate text-[32px]">refresh</span>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto space-y-12">
      <section className="space-y-6">
        <header className="border-b border-muted-border/60 pb-4">
          <h3 className="font-headline-md text-2xl text-ink-charcoal">Author Profile</h3>
          <p className="font-body-ui text-sm text-sage-slate">Your identity in the Story Vault</p>
        </header>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <Label className="font-bold text-[10px] uppercase tracking-widest text-sage-slate">Pen Name</Label>
            <Input 
              value={form.penName}
              onChange={(e) => setForm({ ...form, penName: e.target.value })}
              className="bg-paper-base border-muted-border"
              placeholder="e.g. Ernest Hemingway"
            />
            <p className="text-[10px] text-sage-slate italic opacity-60">This name will appear on your exported manuscripts.</p>
          </div>
          
          <div className="space-y-2">
            <Label className="font-bold text-[10px] uppercase tracking-widest text-sage-slate">Daily Writing Goal (Words)</Label>
            <Input 
              type="number"
              value={form.writingGoalDaily}
              onChange={(e) => setForm({ ...form, writingGoalDaily: parseInt(e.target.value) || 0 })}
              className="bg-paper-base border-muted-border"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="font-bold text-[10px] uppercase tracking-widest text-sage-slate">Author Bio</Label>
          <Textarea 
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            className="bg-paper-base border-muted-border min-h-[120px] resize-none"
            placeholder="A brief note about your writing journey..."
          />
        </div>
      </section>

      <section className="space-y-6">
        <header className="border-b border-muted-border/60 pb-4">
          <h3 className="font-headline-md text-2xl text-ink-charcoal">Preferences</h3>
          <p className="font-body-ui text-sm text-sage-slate">Customise your writing sanctuary</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <Label className="font-bold text-[10px] uppercase tracking-widest text-sage-slate">Interface Theme</Label>
            <Select value={form.theme} onValueChange={handleThemeChange}>
              <SelectTrigger className="bg-paper-base border-muted-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Classic Paper (Light)</SelectItem>
                <SelectItem value="sepia">Vintage Linen (Sepia)</SelectItem>
                <SelectItem value="dark">Midnight Ink (Dark)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="font-bold text-[10px] uppercase tracking-widest text-sage-slate">Default Export Format</Label>
            <Select value={form.defaultExportFormat} onValueChange={(v: any) => setForm({ ...form, defaultExportFormat: v })}>
              <SelectTrigger className="bg-paper-base border-muted-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">Professional PDF</SelectItem>
                <SelectItem value="docx">Microsoft Word (.docx)</SelectItem>
                <SelectItem value="md">Markdown (.md)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Local Storage Section */}
      <section className="space-y-6">
        <header className="border-b border-muted-border/60 pb-4">
          <h3 className="font-headline-md text-2xl text-ink-charcoal">Local Vault</h3>
          <p className="font-body-ui text-sm text-sage-slate">Your encrypted-on-disk storage</p>
        </header>

        <Card className="border-muted-border bg-surface-container-low/30 p-6 shadow-sm">
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <p className="text-xs font-bold font-body-ui text-sage-slate uppercase tracking-widest text-left">Storage Used</p>
                <p className="text-2xl font-semibold text-ink-charcoal tracking-tight text-left">
                  {storageUsage ? (storageUsage.usedBytes / 1024 / 1024).toFixed(1) : "0"} MB
                  <span className="text-sm text-sage-slate font-normal ml-2 text-left">of 500 MB</span>
                </p>
              </div>
              <p className="text-sm font-medium text-ink-charcoal font-[Inter]">{storagePercent}%</p>
            </div>
            
            <div className="w-full bg-muted-border/30 h-2 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-1000 ease-out",
                  storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-amber-500" : "bg-ink-charcoal"
                )} 
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            
            <p className="text-[10px] text-sage-slate italic text-left">
              Your narratives are stored securely in your local encrypted vault. Every scene version, character, and world detail counts toward your limit.
            </p>
          </div>
        </Card>
      </section>

      <div className="pt-8 flex justify-end">
        <Button 
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="bg-ink-charcoal text-paper-base hover:bg-primary-container px-8 h-12 shadow-lg active:scale-97 transition-all font-label-caps tracking-widest"
        >
          {updateMutation.isPending && <span className="material-symbols-outlined animate-spin mr-2">refresh</span>}
          SAVE PREFERENCES
        </Button>
      </div>
    </div>
  );
}
