import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Support() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-paper-base flex flex-col font-body-ui text-ink-charcoal">
      <header className="h-20 border-b border-muted-border flex items-center justify-between px-gutter bg-paper-base">
        <h1 className="font-headline-md text-2xl font-bold tracking-tight cursor-pointer" onClick={() => navigate("/")}>Story Vault</h1>
        <Button variant="ghost" onClick={() => navigate("/")}>Back to Home</Button>
      </header>

      <main className="flex-1 max-w-3xl mx-auto py-20 px-gutter space-y-16">
        <header className="text-center space-y-4">
          <h2 className="font-display-hero text-5xl">How can we help?</h2>
          <p className="text-sage-slate text-lg max-w-xl mx-auto">
            Whether you're facing a technical hurdle or have a suggestion for our sanctuary, we're here for you.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8">
          <div className="p-8 bg-surface-container-low rounded-xl border border-muted-border/40 space-y-4 shadow-sm">
            <span className="material-symbols-outlined text-stationery-amber text-3xl">help_center</span>
            <h3 className="font-headline-md text-xl">Technical Support</h3>
            <p className="text-sage-slate text-sm leading-relaxed">
              Facing issues with your vault? Reach out to our technical team for help with account recovery, backup restoration, or performance issues.
            </p>
            <p className="text-ink-charcoal font-bold text-sm">support@storyvault.app</p>
          </div>

          <div className="p-8 bg-surface-container-low rounded-xl border border-muted-border/40 space-y-4 shadow-sm">
            <span className="material-symbols-outlined text-stationery-amber text-3xl">lightbulb</span>
            <h3 className="font-headline-md text-xl">Feature Requests</h3>
            <p className="text-sage-slate text-sm leading-relaxed">
              Have an idea to make Story Vault even better? We love hearing from our community of writers. Share your dreams for the perfect sanctuary.
            </p>
            <p className="text-ink-charcoal font-bold text-sm">feedback@storyvault.app</p>
          </div>
        </div>

        <section className="bg-paper-base border border-muted-border p-12 rounded-xl text-center space-y-6 shadow-sm">
          <h3 className="font-headline-md text-2xl">Frequent Inquiries</h3>
          <div className="space-y-8 text-left max-w-2xl mx-auto pt-4">
            <div className="space-y-2">
              <h4 className="font-bold text-sm text-ink-charcoal">How do I backup my work?</h4>
              <p className="text-sm text-sage-slate">You can use the "Full Project Backup" option in the Preview & Export modal to download your entire project as a structured .zip file with .docx documents.</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-sm text-ink-charcoal">Can I work offline?</h4>
              <p className="text-sm text-sage-slate">Story Vault currently requires an internet connection for real-time synchronization. We recommend exporting your latest drafts to Markdown or Word for offline editing.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-surface-container-low border-t border-muted-border py-12 px-gutter">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-sage-slate uppercase tracking-widest font-bold">© 2026 Story Vault</p>
        </div>
      </footer>
    </div>
  );
}
