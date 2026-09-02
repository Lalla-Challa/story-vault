import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Privacy() {
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
            <h2 className="font-display-hero text-4xl">Privacy Policy</h2>
            <p className="text-sage-slate text-sm font-label-caps tracking-widest uppercase">Last updated: May 2026</p>
          </header>

          <article className="prose-literata space-y-8 text-sage-slate leading-relaxed">
            <section className="space-y-4">
              <h3 className="font-headline-md text-xl text-ink-charcoal">1. Information We Collect</h3>
              <p>
                We collect your email address and name to manage your account. We also store the content you write (scenes, characters, notes) solely for the purpose of providing you with the Story Vault service.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="font-headline-md text-xl text-ink-charcoal">2. How We Use Your Data</h3>
              <p>
                Your data is used exclusively to facilitate your writing process. We do not sell your personal information or your story content to third parties. We do not use your stories to train AI models without your explicit, separate consent.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="font-headline-md text-xl text-ink-charcoal">3. Security</h3>
              <p>
                We implement robust security measures including salted password hashing and secure session management to protect your account. Your data is encrypted at rest and in transit.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="font-headline-md text-xl text-ink-charcoal">4. Your Rights</h3>
              <p>
                You have the right to access, edit, and delete your data at any time. You can use our export features to download your work in open formats (Markdown, Word, PDF) or our proprietary .svp format.
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
