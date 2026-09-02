import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, Trash2, Copy } from "lucide-react";

export default function EmailTemplates() {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  
  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.admin.emailTemplates.list.useQuery();
  
  const createTemplate = trpc.admin.emailTemplates.upsert.useMutation({
    onSuccess: () => {
      toast.success("Template saved");
      utils.admin.emailTemplates.list.invalidate();
      setName("");
      setSubject("");
      setBody("");
    },
    onError: (err) => toast.error(err.message)
  });

  const deleteTemplate = trpc.admin.emailTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.admin.emailTemplates.list.invalidate();
    }
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">Email Templates</h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">Manage automated system emails and styling.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="w-4 h-4" /> Create Template
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input placeholder="e.g. beta_invitation" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Subject Line</Label>
              <Input placeholder="Email Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Body (HTML supported)</Label>
              <Textarea 
                placeholder="Hello {{name}}..." 
                className="min-h-[200px] font-mono text-sm" 
                value={body} 
                onChange={(e) => setBody(e.target.value)} 
              />
              <p className="text-[10px] text-slate-400">Use double curly braces for variables: &#123;&#123;name&#125;&#125;</p>
            </div>
            <Button className="w-full" onClick={() => createTemplate.mutate({ name, subject, body, variables: [] })}>
                Save Template
            </Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {isLoading ? <div className="animate-pulse bg-slate-100 h-64 rounded-lg" /> : templates?.map((t) => (
            <div key={t.id} className="p-4 border rounded-lg bg-white shadow-sm flex items-start justify-between group">
              <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900">{t.name}</h3>
                    <Badge variant="outline" className="text-[10px] uppercase">{t.id}</Badge>
                  </div>
                  <p className="text-sm font-medium text-slate-600">{t.subject}</p>
                  <p className="text-xs text-slate-400 line-clamp-1 max-w-md">{t.body}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteTemplate.mutate(t.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setName(t.name); setSubject(t.subject); setBody(t.body); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
