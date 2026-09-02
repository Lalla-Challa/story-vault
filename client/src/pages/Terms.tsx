import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Terms() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-paper-base flex flex-col font-body-ui text-ink-charcoal">
      <header className="h-20 border-b border-muted-border flex items-center justify-between px-gutter bg-paper-base">
        <h1 className="font-headline-md text-2xl font-bold tracking-tight cursor-pointer" onClick={() => navigate("/")}>Story Vault</h1>
        <Button variant="ghost" onClick={() => navigate("/")}>Back to Home</Button>
      </header>

      <main className="flex-1 max-w-3xl mx-auto py-16 px-gutter">
        <div className="space-y-12">
          <header className="space-y-4">
            <h2 className="font-display-hero text-4xl">Terms of Service</h2>
            <p className="text-sage-slate text-sm font-label-caps tracking-widest uppercase">Last updated: May 2026</p>
          </header>

          <article className="prose-literata space-y-8 text-sage-slate leading-relaxed">
            <section className="space-y-4">
              <h3 className="font-headline-md text-xl text-ink-charcoal">1. Intellectual Property</h3>
              <p>
                Your stories belong to you. Always. Story Vault claims no ownership over any content you write, upload, or store within our platform. You retain full copyright and all intellectual property rights to your work.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="font-headline-md text-xl text-ink-charcoal">2. Data & Privacy</h3>
              <p>
                We treat your data with the same respect we give our own drafts. Your work is stored in a private database and is only accessible by you. We use industry-standard encryption for sessions and sensitive data.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="font-headline-md text-xl text-ink-charcoal">3. Responsible Use</h3>
              <p>
                By using Story Vault, you agree not to use the platform for any illegal activities or to distribute harmful content. We reserve the right to suspend accounts that violate these terms to protect the community.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="font-headline-md text-xl text-ink-charcoal">4. Service Availability</h3>
              <p>
                While we strive for 100% uptime, Story Vault is provided "as is." We recommend using our ".svp" and ".zip" backup features regularly to maintain your own copies of your work.
              </p>
            </section>
          </article>
        </div>
      </main>

      <footer className="bg-surface-container-low border-t border-muted-border py-12 px-gutter">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-sage-slate uppercase tracking-widest font-bold">© 2026 Story Vault</p>
        </div>
      </footer>
    </div>
  );
}
