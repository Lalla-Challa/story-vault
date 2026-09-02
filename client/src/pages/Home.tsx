import { getLoginUrl } from "@/const";
import { Link, useLocation } from "wouter";

export default function Home() {
  const [, navigate] = useLocation();
  return (
    <div className="antialiased min-h-screen flex flex-col selection:bg-stationery-amber selection:text-paper-base">
      {/* TopAppBar */}
      <header className="bg-paper-base text-ink-charcoal font-body-ui text-body-ui sticky top-0 z-50 transition-colors duration-300">
        <div className="flex justify-between items-center h-16 px-gutter w-full max-w-7xl mx-auto">
          <div className="font-headline-md text-headline-md font-bold tracking-tight cursor-pointer flex items-center gap-2">
            <img src="/images/logo.png" alt="Story Vault" className="h-16 w-auto" />
            Story Vault
          </div>
          <nav className="hidden md:flex gap-8">
            <Link href="/about" className="text-sage-slate hover:text-stationery-amber transition-colors duration-200">Features</Link>
            <Link href="/about" className="text-sage-slate hover:text-stationery-amber transition-colors duration-200">Philosophy</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/beta-apply" className="font-label-caps text-label-caps uppercase tracking-widest text-sage-slate hover:text-stationery-amber transition-colors">
              Apply for Beta
            </Link>
            <a href={getLoginUrl()}>
              <button className="font-body-ui text-body-ui bg-transparent border border-muted-border text-ink-charcoal px-4 py-2 rounded hover:border-ink-charcoal transition-all active:scale-97">Login</button>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="flex-grow flex flex-col items-center w-full px-canvas-margin py-20">
        {/* Hero Section */}
        <section className="w-full max-w-3xl text-center space-y-8 mb-32 mt-10 md:mt-20">
          <h1 className="font-display-hero text-display-hero text-ink-charcoal">
            The Professional Workspace for the <span className="text-stationery-amber italic font-normal">Modern Storyteller.</span>
          </h1>
          <p className="font-body-writing text-body-writing text-sage-slate max-w-2xl mx-auto">
            A sanctuary for your prose. Combining the robust version control of a "Git for Stories" with intuitive character and world-building tools, all within a distraction-free environment.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-8">
            <a href={getLoginUrl()}>
              <button className="bg-ink-charcoal text-paper-base font-label-caps text-label-caps uppercase tracking-widest px-8 py-4 rounded hover:bg-opacity-90 transition-all active:scale-97">
                Start Writing for Free
              </button>
            </a>
            <button 
              onClick={() => navigate("/about")}
              className="bg-transparent text-ink-charcoal border border-muted-border font-label-caps text-label-caps uppercase tracking-widest px-8 py-4 rounded hover:border-ink-charcoal transition-all active:scale-97"
            >
              Explore Features
            </button>
          </div>
        </section>

        {/* Image Break / Aesthetic Anchor */}
        <div className="w-full max-w-5xl h-[400px] md:h-[600px] mb-32 rounded-xl overflow-hidden paper-shadow relative group">
          <div className="absolute inset-0 bg-gradient-to-t from-paper-base via-transparent to-transparent z-10"></div>
          <img
            alt="Writer's Desk"
            className="w-full h-full object-cover transform transition-transform duration-1000 group-hover:scale-105"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBvDTUWZZrvaV_VA4hDOvFzvQh0RR8QtcLfKAtvntiXeIa1l6g0QgFEW28bzvbmPtj5G01OujIvbYCSV4_36AzYnVphnt1sgxBk5_yw2DITN_QQqYsauOpZ01gAGkTZms5hVzl-unbFNnSBUotKz0bKnZKOHZtYjxxLmRxbqZhYaRoBMImSuEcxOBOKxbK0prfzM7wGLvOE3LK1HfvB-TxNBiOJtwmXz72O4qsG4kAE2THr3JYDPX3ix5zxJe0QhbtF7N73pWvu0Q0"
          />
        </div>

        {/* Features Bento Grid */}
        <section className="w-full max-w-5xl space-y-16" id="features">
          <div className="text-center space-y-4 mb-16">
            <h2 className="font-headline-lg text-headline-lg md:font-display-hero md:text-display-hero text-ink-charcoal">Architect Your Narrative</h2>
            <p className="font-body-ui text-body-ui text-sage-slate max-w-xl mx-auto">Tools designed for deep focus and structural clarity, allowing you to build complex narratives without losing the thread.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Feature 1: Versioning (Large) */}
            <div className="md:col-span-8 bg-surface-container-low border border-muted-border rounded-xl p-8 md:p-12 paper-shadow flex flex-col justify-between group hover:bg-surface-container transition-colors duration-500">
              <div className="space-y-4 max-w-md">
                <span className="material-symbols-outlined text-stationery-amber text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>history</span>
                <h3 className="font-headline-md text-headline-md text-ink-charcoal font-semibold">Scene Versioning</h3>
                <p className="font-body-ui text-body-ui text-sage-slate">Never lose a brilliant discarded paragraph. Track drafts, revisions, and final polishes with an elegant, visual timeline inspired by code version control, tailored for prose.</p>
              </div>
              {/* Decorative UI Element representing versioning */}
              <div className="mt-12 flex flex-col gap-3 pl-4 border-l border-muted-border relative">
                <div className="absolute -left-[5px] top-2 w-2 h-2 rounded-full bg-sage-slate"></div>
                <div className="font-caption text-caption text-sage-slate">DRAFT • 2 days ago</div>
                <div className="absolute -left-[5px] top-14 w-2 h-2 rounded-full bg-stationery-amber"></div>
                <div className="font-caption text-caption text-on-surface-variant mt-2">REVISED • Yesterday</div>
                <div className="absolute -left-[5px] top-[104px] w-2 h-2 rounded-full bg-ink-charcoal"></div>
                <div className="font-body-ui text-body-ui text-ink-charcoal font-medium mt-2">FINAL • Just now</div>
              </div>
            </div>

            {/* Feature 2: Main Story (Small) */}
            <div className="md:col-span-4 bg-surface border border-muted-border rounded-xl p-8 paper-shadow flex flex-col group hover:bg-surface-container-low transition-colors duration-500">
              <span className="material-symbols-outlined text-sage-slate text-4xl mb-4">menu_book</span>
              <h3 className="font-headline-md text-headline-md text-ink-charcoal font-semibold mb-3">Seamless Assembly</h3>
              <p className="font-body-ui text-body-ui text-sage-slate mb-8">Stitch isolated scenes together effortlessly. Focus on the micro without losing sight of the macro structure of your manuscript.</p>
              <div className="mt-auto h-24 bg-paper-base rounded border border-muted-border p-3 opacity-70 group-hover:opacity-100 transition-opacity">
                <div className="h-2 w-3/4 bg-surface-container-highest rounded mb-2"></div>
                <div className="h-2 w-full bg-surface-container-highest rounded mb-2"></div>
                <div className="h-2 w-5/6 bg-surface-container-highest rounded"></div>
              </div>
            </div>

            {/* Feature 3: Characters (Small) */}
            <div className="md:col-span-5 bg-surface border border-muted-border rounded-xl p-8 paper-shadow flex flex-col group hover:bg-surface-container-low transition-colors duration-500">
              <span className="material-symbols-outlined text-sage-slate text-4xl mb-4">group</span>
              <h3 className="font-headline-md text-headline-md text-ink-charcoal font-semibold mb-3">Living Profiles</h3>
              <p className="font-body-ui text-body-ui text-sage-slate mb-8">Keep motivations, arcs, and details accessible alongside your manuscript. Your cast, meticulously documented.</p>
            </div>

            {/* Feature 4: World Lore (Large) */}
            <div className="md:col-span-7 bg-surface-container-low border border-muted-border rounded-xl p-8 md:p-12 paper-shadow flex flex-col justify-between group hover:bg-surface-container transition-colors duration-500">
              <div className="space-y-4">
                <span className="material-symbols-outlined text-stationery-amber text-4xl">public</span>
                <h3 className="font-headline-md text-headline-md text-ink-charcoal font-semibold">Expansive World Lore</h3>
                <p className="font-body-ui text-body-ui text-sage-slate max-w-md">Construct the foundational rules, geography, and history of your universe in a structured, searchable vault that never interrupts your flow state.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-surface-container-lowest text-sage-slate font-caption text-caption py-12 border-t border-muted-border mt-20">
        <div className="flex flex-col md:flex-row justify-between items-center px-canvas-margin max-w-7xl mx-auto w-full gap-6">
          <div className="font-label-caps text-label-caps uppercase tracking-widest text-ink-charcoal opacity-80">
            © 2026 Story Vault. Crafted for professional writers.
          </div>
          <nav className="flex gap-6">
            <Link href="/terms" className="text-sage-slate hover:text-stationery-amber transition-colors">Terms</Link>
            <Link href="/privacy" className="text-sage-slate hover:text-stationery-amber transition-colors">Privacy</Link>
            <Link href="/support" className="text-sage-slate hover:text-stationery-amber transition-colors">Support</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
