import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Attribute {
  name: string;
  type: "String" | "Integer" | "Text Block";
  exposed: boolean;
  description: string;
}

interface ProjectSettingsProps {
  projectId: number;
}

export function ProjectSettings({ projectId }: ProjectSettingsProps) {
  const [isAddAttrOpen, setIsAddAttrOpen] = useState(false);
  const [newAttr, setNewAttr] = useState<Omit<Attribute, "exposed">>({
    name: "",
    type: "String",
    description: ""
  });

  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.projectSettings.list.useQuery({ projectId });

  const upsertMutation = trpc.projectSettings.upsert.useMutation({
    onSuccess: () => {
      utils.projectSettings.list.invalidate();
      toast.success("Settings updated");
    },
    onError: (e) => toast.error(e.message || "Failed to update setting"),
  });

  const getSetting = (key: string, defaultValue: any) => {
    const s = settings?.find(s => s.settingKey === key);
    return s ? s.settingValue : defaultValue;
  };

  const charAttributes: Attribute[] = getSetting("character_attributes", [
    { name: "Character Name", type: "String", exposed: true, description: "The primary identifier for the entity" },
    { name: "Age", type: "Integer", exposed: true, description: "Numerical age at start of scene" },
    { name: "Core Conflict", type: "Text Block", exposed: false, description: "The internal struggle driving the character" },
  ]);

  const loreSnippets = getSetting("lore_snippets", {
    historical: true,
    magic: false,
    economic: true
  });

  const advancedMapping = getSetting("advanced_mapping", {
    sync: false,
    locks: false,
    api: false
  });

  const updateSetting = (key: string, value: any) => {
    upsertMutation.mutate({
      projectId,
      settingKey: key,
      settingValue: value
    });
  };

  const handleToggleExposed = (index: number) => {
    const newAttributes = [...charAttributes];
    newAttributes[index].exposed = !newAttributes[index].exposed;
    updateSetting("character_attributes", newAttributes);
  };

  const handleAddAttribute = () => {
    if (!newAttr.name.trim()) {
      toast.error("Attribute name is required");
      return;
    }
    const newAttributes = [...charAttributes, { ...newAttr, exposed: true }];
    updateSetting("character_attributes", newAttributes);
    setIsAddAttrOpen(false);
    setNewAttr({ name: "", type: "String", description: "" });
  };

  const toggleLore = (key: keyof typeof loreSnippets) => {
    updateSetting("lore_snippets", { ...loreSnippets, [key]: !loreSnippets[key] });
  };

  const toggleAdvanced = (key: keyof typeof advancedMapping) => {
    updateSetting("advanced_mapping", { ...advancedMapping, [key]: !advancedMapping[key] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="material-symbols-outlined animate-spin text-sage-slate text-[32px]">refresh</span>
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] mx-auto py-12">
      {/* Header Section */}
      <header className="mb-12 border-b border-muted-border pb-8">
        <h1 className="font-headline-lg text-headline-lg text-ink-charcoal mb-4">Project References</h1>
        <p className="font-body-ui text-body-ui text-sage-slate max-w-2xl">
          Configure global attributes that can be referenced dynamically within your manuscript. Exposing a field allows it to be used as a 'smart variable' in the writing studio.
        </p>
      </header>

      {/* Reference Mapping Bento */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Character References */}
        <section className="md:col-span-8 flex flex-col gap-6 text-left">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-headline-md text-headline-md text-ink-charcoal flex items-center gap-2">
              <span className="material-symbols-outlined text-stationery-amber" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
              Character Attributes
            </h3>
            
            <Dialog open={isAddAttrOpen} onOpenChange={setIsAddAttrOpen}>
              <DialogTrigger asChild>
                <button className="text-caption font-semibold text-stationery-amber hover:underline transition-all">Add Custom Attribute</button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Custom Attribute</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Attribute Name</Label>
                    <Input 
                      placeholder="e.g. Motivation" 
                      value={newAttr.name} 
                      onChange={e => setNewAttr({...newAttr, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Type</Label>
                    <Select 
                      value={newAttr.type} 
                      onValueChange={(v: any) => setNewAttr({...newAttr, type: v})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="String">String</SelectItem>
                        <SelectItem value="Integer">Integer</SelectItem>
                        <SelectItem value="Text Block">Text Block</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input 
                      placeholder="e.g. What drives this character's choices" 
                      value={newAttr.description} 
                      onChange={e => setNewAttr({...newAttr, description: e.target.value})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddAttrOpen(false)}>Cancel</Button>
                  <Button className="bg-ink-charcoal text-paper-base" onClick={handleAddAttribute}>Add Attribute</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="bg-surface-container-lowest border border-muted-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-muted-border">
                <tr>
                  <th className="p-4 font-label-caps text-label-caps text-sage-slate uppercase tracking-wider">Attribute Name</th>
                  <th className="p-4 font-label-caps text-label-caps text-sage-slate uppercase tracking-wider">Data Type</th>
                  <th className="p-4 font-label-caps text-label-caps text-sage-slate uppercase tracking-wider text-right">Expose to Studio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted-border">
                {charAttributes.map((attr, idx) => (
                  <tr key={idx} className="hover:bg-paper-base transition-colors group">
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink-charcoal">{attr.name}</span>
                        <span className="text-caption text-sage-slate italic">{attr.description}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="bg-primary-fixed text-on-primary-fixed-variant px-2 py-1 rounded text-[11px] font-bold uppercase">{attr.type}</span>
                    </td>
                    <td className="p-4 text-right">
                      <Switch checked={attr.exposed} onCheckedChange={() => handleToggleExposed(idx)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Status / Usage Sidebar */}
        <section className="md:col-span-4 flex flex-col gap-6 text-left">
          <div className="bg-ink-charcoal text-paper-base p-6 rounded-xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <span className="material-symbols-outlined text-[80px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            </div>
            <h4 className="font-headline-md text-headline-md mb-2">Studio Context</h4>
            <p className="text-caption opacity-80 mb-6">These fields will appear in the studio autocomplete menu using the <span className="font-mono bg-paper-base/10 px-1 rounded">@</span> command.</p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-[14px]">
                <span className="opacity-60">Exposed Fields</span>
                <span className="font-bold">{charAttributes.filter(a => a.exposed).length} / 20</span>
              </div>
              <div className="w-full bg-paper-base/20 h-1 rounded-full overflow-hidden">
                <div className="bg-stationery-amber h-full transition-all duration-500" style={{ width: `${(charAttributes.filter(a => a.exposed).length / 20) * 100}%` }}></div>
              </div>
            </div>
          </div>

          {/* World Lore Snippets */}
          <div className="bg-surface-container border border-muted-border p-6 rounded-xl">
            <h4 className="font-label-caps text-label-caps text-ink-charcoal uppercase mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-sage-slate">public</span>
              World Lore Snippets
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-caption font-medium">Historical Timeline</span>
                <Switch checked={loreSnippets.historical} onCheckedChange={() => toggleLore("historical")} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-caption font-medium">Magic Systems</span>
                <Switch checked={loreSnippets.magic} onCheckedChange={() => toggleLore("magic")} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-caption font-medium">Economic Data</span>
                <Switch checked={loreSnippets.economic} onCheckedChange={() => toggleLore("economic")} />
              </div>
            </div>
          </div>
        </section>

        {/* Advanced Configuration */}
        <section className="md:col-span-12 mt-8 text-left">
          <h3 className="font-headline-md text-headline-md text-ink-charcoal mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-stationery-amber">tune</span>
            Advanced Mapping
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div 
              onClick={() => toggleAdvanced("sync")}
              className={`p-6 rounded-xl border transition-all cursor-pointer group ${advancedMapping.sync ? "bg-paper-base border-stationery-amber shadow-md" : "bg-paper-base border-muted-border hover:shadow-md"}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 transition-colors ${advancedMapping.sync ? "bg-stationery-amber/20" : "bg-surface-container-low group-hover:bg-stationery-amber/10"}`}>
                <span className="material-symbols-outlined text-ink-charcoal">link</span>
              </div>
              <div className="flex justify-between items-start mb-2">
                <h5 className="font-semibold text-ink-charcoal">Cross-Project Sync</h5>
                {advancedMapping.sync && <span className="text-[10px] bg-stationery-amber text-ink-charcoal px-2 py-0.5 rounded-full font-bold">ACTIVE</span>}
              </div>
              <p className="text-caption text-sage-slate">Inherit global attributes from a master project template.</p>
            </div>

            <div 
              onClick={() => toggleAdvanced("locks")}
              className={`p-6 rounded-xl border transition-all cursor-pointer group ${advancedMapping.locks ? "bg-paper-base border-stationery-amber shadow-md" : "bg-paper-base border-muted-border hover:shadow-md"}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 transition-colors ${advancedMapping.locks ? "bg-stationery-amber/20" : "bg-surface-container-low group-hover:bg-stationery-amber/10"}`}>
                <span className="material-symbols-outlined text-ink-charcoal">lock</span>
              </div>
              <div className="flex justify-between items-start mb-2">
                <h5 className="font-semibold text-ink-charcoal">Read-Only Locks</h5>
                {advancedMapping.locks && <span className="text-[10px] bg-stationery-amber text-ink-charcoal px-2 py-0.5 rounded-full font-bold">ACTIVE</span>}
              </div>
              <p className="text-caption text-sage-slate">Prevent writers from modifying reference values in-scene.</p>
            </div>

            <div 
              onClick={() => toggleAdvanced("api")}
              className={`p-6 rounded-xl border transition-all cursor-pointer group ${advancedMapping.api ? "bg-paper-base border-stationery-amber shadow-md" : "bg-paper-base border-muted-border hover:shadow-md"}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 transition-colors ${advancedMapping.api ? "bg-stationery-amber/20" : "bg-surface-container-low group-hover:bg-stationery-amber/10"}`}>
                <span className="material-symbols-outlined text-ink-charcoal">terminal</span>
              </div>
              <div className="flex justify-between items-start mb-2">
                <h5 className="font-semibold text-ink-charcoal">Metadata API</h5>
                {advancedMapping.api && <span className="text-[10px] bg-stationery-amber text-ink-charcoal px-2 py-0.5 rounded-full font-bold">ACTIVE</span>}
              </div>
              <p className="text-caption text-sage-slate">Export your character and world data via structured JSON.</p>
            </div>
          </div>
        </section>
      </div>

      {/* Action Footer */}
      <div className="mt-16 pt-8 border-t border-muted-border flex justify-end gap-4">
        <Button variant="outline" className="px-6 py-2 border border-muted-border text-ink-charcoal rounded-lg font-semibold hover:bg-surface-container-low transition-colors active:scale-97 transition-transform duration-100">
          Discard Changes
        </Button>
        <Button className="px-8 py-2 bg-ink-charcoal text-paper-base rounded-lg font-semibold hover:opacity-90 transition-opacity active:scale-97 transition-transform duration-100">
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
