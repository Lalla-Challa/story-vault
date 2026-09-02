import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

export default function BetaApply() {
  const [, navigate] = useLocation();
  const { vaultUnlocked, loading: authLoading } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", reason: "" });
  const submitMutation = trpc.beta.submit.useMutation({
    onSuccess: () => {
      toast.success("Application submitted successfully. We will be in touch!");
      navigate("/");
    },
    onError: (e) => toast.error(e.message || "Failed to submit application"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate(form);
  };

  const isDisabled = !vaultUnlocked || submitMutation.isPending;

  return (
    <div className="min-h-screen bg-paper-base flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full bg-white p-8 rounded-xl border border-muted-border shadow-sm">
        <h2 className="font-headline-md text-2xl text-ink-charcoal mb-2">Apply for Beta Access</h2>
        <p className="text-sage-slate text-sm mb-6">Join our private testing phase.</p>
        
        {!vaultUnlocked && !authLoading && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-800">
            Please unlock your vault first to submit a beta application.
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} disabled={isDisabled} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} disabled={isDisabled} />
          </div>
          <div className="space-y-2">
            <Label>Reason for applying</Label>
            <Textarea required value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} disabled={isDisabled} />
          </div>
          <Button type="submit" disabled={isDisabled} className="w-full bg-ink-charcoal text-paper-base">
            {submitMutation.isPending ? "Submitting..." : "Submit Application"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/")}>Cancel</Button>
        </form>
      </div>
    </div>
  );
}
