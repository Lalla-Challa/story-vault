import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type GuideSection = {
  title: string;
  icon: string;
  points: string[];
};

const SECTIONS: GuideSection[] = [
  {
    title: "Agent — the working copilot",
    icon: "auto_awesome",
    points: [
      "This is where the AI works on your manuscript. Ask it to outline, rewrite a scene, fix continuity, or brainstorm a passage.",
      "It can read scenes and characters, so just name them — no need to paste content.",
      "When the AI proposes a draft or a precise edit, a card appears with a diff. Click Accept to save it as a new scene version, or Reject to discard. Nothing is written automatically.",
      "Click 🧠 AI thinking to expand the model's reasoning and see why it made a suggestion.",
    ],
  },
  {
    title: "Research Threads — explore without polluting the main chat",
    icon: "fork_right",
    points: [
      "On any message, click 🧭 Branch to Research Thread to open a split screen: main chat on the left (read-only), an isolated thread on the right.",
      "Chat freely in the thread — the AI there only sees that thread's context, so it won't drag the whole conversation in.",
      "Done exploring? Click Synthesize & Merge to Main to condense the thread into a summary and inject it into the main chat. Or Discard to drop it untouched.",
      "The AI can also suggest opening a thread itself when you wander off on a tangent — just confirm the prompt.",
    ],
  },
  {
    title: "Ideation — brainstorm before you write",
    icon: "psychology",
    points: [
      "Use this tab to pitch rough ideas. The AI acts as a sounding board: it asks questions and flags plot holes instead of writing scenes.",
      "Highlight any text in a message and click 📌 Pin as Core Concept. Pinned concepts appear in the right sidebar.",
      "When you're happy, click Move to Workspace. Your pinned concepts are compiled into a Project Brief, saved to project memory, and a working scene is created with the brief already in the AI's context.",
    ],
  },
  {
    title: "Project Memory — the AI's long-term canon",
    icon: "database",
    points: [
      "Facts, rules, and hypotheses the AI stores are injected into every conversation — in all tabs.",
      "Open the Memory panel from the Agent header to review what's saved, add entries yourself, or delete stale ones.",
      "Ask the AI to 'remember this' and it will use its add_to_memory tool.",
    ],
  },
  {
    title: "Idea Vault — a safe place for sudden ideas",
    icon: "lightbulb",
    points: [
      "Dump plot ideas and hypotheses without touching your manuscript. Ideas are unidirectional: they can point at a scene, but scenes never show them back.",
      "Link an idea to a scene and filter by it to see related ideas.",
      "Click ✨ Evaluate with AI on any idea to open a research thread dedicated to exploring it.",
    ],
  },
  {
    title: "Inline references — @ characters & lore",
    icon: "alternate_email",
    points: [
      "In the Writing Studio, type @ and pick a character or world note to insert a bold reference.",
      "Hover the reference to see the full entity profile without leaving the editor.",
    ],
  },
  {
    title: "Pro tips",
    icon: "tips_and_updates",
    points: [
      "Reasoning models (like mimo) 'think' first — responses can start slowly. The 🧠 block shows that thinking.",
      "Be specific: 'Rewrite Chapter 1's opening with more tension' beats 'make it better'.",
      "Use the Agent's Focus dropdown to point the AI at a specific scene.",
      "Accept proposals you like — they become normal scene versions you can continue editing.",
    ],
  },
];

export function AIGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-paper-base max-h-[85vh] overflow-y-auto ink-scrollbar">
        <DialogHeader>
          <DialogTitle className="font-headline-md text-headline-md text-ink-charcoal">
            Using the AI features
          </DialogTitle>
          <DialogDescription className="font-body-ui text-body-ui text-sage-slate">
            A quick tour of the Agent, Research Threads, Ideation, Memory, and the Idea Vault.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="flex items-center gap-2 font-headline-md text-headline-md text-ink-charcoal mb-2">
                <span className="material-symbols-outlined text-[20px] text-stationery-amber">
                  {section.icon}
                </span>
                {section.title}
              </h3>
              <ul className="space-y-1.5 pl-1">
                {section.points.map((point, i) => (
                  <li key={i} className="flex gap-2 font-body-ui text-body-ui text-on-surface-variant text-[15px]">
                    <span className="text-stationery-amber shrink-0 mt-0.5">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}