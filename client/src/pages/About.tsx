import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function About() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-paper-base flex flex-col font-body-ui text-ink-charcoal selection:bg-stationery-amber selection:text-paper-base">
      <header className="h-20 border-b border-muted-border flex items-center justify-between px-gutter sticky top-0 bg-paper-base/90 backdrop-blur-sm z-50">
        <h1 className="font-headline-md text-2xl font-bold tracking-tight">Story Vault</h1>
        <div className="flex gap-4">
          <Button variant="ghost" onClick={() => navigate("/")}>Home</Button>
          <Button className="bg-ink-charcoal text-paper-base" onClick={() => navigate("/login")}>Enter Vault</Button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto py-20 px-gutter space-y-24">
        {/* Philosophy Section */}
        <section className="text-center space-y-6">
          <h2 className="font-display-hero text-5xl tracking-tight">Your Creative Sanctuary.</h2>
          <p className="font-body-writing text-2xl text-sage-slate italic leading-relaxed">
            "A writer is a world in a single soul."
          </p>
          <div className="max-w-2xl mx-auto pt-4">
            <p className="font-body-ui text-lg text-sage-slate leading-relaxed">
              Story Vault was born from a simple observation: software engineers have precision tools for their logic, but writers are often left with cluttered digital canvases that fight against focus. We built a space where version control meets artistry.
            </p>
          </div>
        </section>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <FeatureCard 
            icon="auto_stories" 
            title="GIT for Stories" 
            description="Treat your scenes like units of work. Save versions, track revisions, and curate the perfect final manuscript without ever losing a discarded line."
          />
          <FeatureCard 
            icon="edit_note" 
            title="Writing Studio" 
            description="A minimalist sanctuary with Literata typography and paper-like textures. Deep focus by design, intelligent by nature with @smart mentions."
          />
          <FeatureCard 
            icon="group" 
            title="Dynamic Cast" 
            description="Profile your characters with precision. Define custom attributes that adapt to your world's unique requirements."
          />
          <FeatureCard 
            icon="public" 
            title="World Lore" 
            description="Construct the history, magic, and geography of your universe. Search and reference your lore instantly as you write."
          />
        </div>

        {/* Call to Action */}
        <section className="bg-ink-charcoal text-paper-base p-16 rounded-2xl text-center space-y-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <span className="material-symbols-outlined text-[120px]">auto_awesome</span>
          </div>
          <h3 className="font-headline-lg text-4xl relative z-10">Ready to start your next narrative?</h3>
          <p className="text-paper-base/60 max-w-xl mx-auto relative z-10">
            Join a community of professional storytellers who value focus, structure, and the tactile beauty of the written word.
          </p>
          <div className="pt-4 relative z-10">
            <Button 
              onClick={() => navigate("/login")}
              className="bg-stationery-amber text-ink-charcoal px-10 h-14 text-lg font-bold hover:bg-stationery-amber/90 transition-all active:scale-95"
            >
              Start Writing for Free
            </Button>
          </div>
        </section>
      </main>

      <footer className="bg-surface-container-low border-t border-muted-border py-12 px-gutter">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs text-sage-slate uppercase tracking-widest font-bold">© 2026 Story Vault</p>
          <div className="flex gap-8">
            <button onClick={() => navigate("/terms")} className="text-sm text-sage-slate hover:text-ink-charcoal transition-colors">Terms</button>
            <button onClick={() => navigate("/privacy")} className="text-sm text-sage-slate hover:text-ink-charcoal transition-colors">Privacy</button>
            <button onClick={() => navigate("/support")} className="text-sm text-sage-slate hover:text-ink-charcoal transition-colors">Support</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string, title: string, description: string }) {
  return (
    <div className="space-y-4 group">
      <div className="w-14 h-14 bg-surface-container rounded-xl flex items-center justify-center text-stationery-amber group-hover:bg-stationery-amber group-hover:text-paper-base transition-all duration-300 shadow-sm border border-muted-border/40">
        <span className="material-symbols-outlined text-3xl">{icon}</span>
      </div>
      <h4 className="font-headline-md text-xl">{title}</h4>
      <p className="font-body-ui text-sage-slate leading-relaxed">{description}</p>
    </div>
  );
}
