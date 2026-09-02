# Story Vault — The Complete Guide

**Or: everything in the app explained, and why you only need to care about half of it.**

Story Vault is **AI infrastructure for narrative canon**. A deterministic symbolic engine (the **CCE**) owns the story's world state — characters, locations, rules, history — and *computes* what happens next. The LLM is firewalled behind a validation gate: it may render prose and *propose* changes, but it can never write canon. This guide walks through every feature in the app, what each one means to the engine, and when you should (or shouldn't) touch it.

> **New here and feeling overwhelmed?** Skip straight to [§14 — The 15-Minute Path](#14-the-15-minute-path-start-here). The UI is deep because it's *infrastructure* — like a database console. You don't need to master every panel; the engine does the heavy lifting, and the LLM only ever needs four tools.

---

## 1. The mental model (read this before clicking anything)

```
┌─────────────────────────────────────────────────────────────────────┐
│  YOU (the author)                                                   │
│  Builds the world model. Accepts or rejects every change.           │
└───────────────┬─────────────────────────────────────┬───────────────┘
                ▼                                     ▼
┌───────────────────────────────┐     ┌───────────────────────────────┐
│  WORLD MODEL (canon)          │     │  LLM (untrusted renderer)     │
│  actors · environments        │     │  renders skeletons into prose │
│  systems · rules · constraints│     │  proposes state changes       │
│  relationships · memory       │     │  CANNOT write canon directly  │
└───────────────┬───────────────┘     └──────────────┬────────────────┘
                ▼                                    │ proposed changes
┌───────────────────────────────┐                    ▼
│  CCE ENGINE (deterministic)   │◄──── 6-layer validation ──────────┐
│  seeded PRNG · pure TypeScript│                       reject ─────┘
│  zero LLM tokens              │
└───────────────┬───────────────┘
                ▼
      events → episodes → scene skeletons
                │
                ▼
      LLM renders skeleton → PROSE → staged diff → YOU accept
```

Three rules define the whole product:

1. **The engine owns canon.** Everything true about the story lives in the encrypted local database.
2. **The engine computes the plot.** Same world + same seeds = identical event history. Zero LLM tokens.
3. **The LLM proposes; the engine disposes.** Every LLM-originated change passes 6-layer validation. Rejections come back with machine-readable reasons *and* guidance the LLM can self-correct from.

---

## 2. Install & first launch

```bash
git clone <github.com/Lalla-Challa/story-vault.git>
pnpm install
pnpm dev        # starts the local server + the Electron window
```

- **Node ≥ 22, pnpm ≥ 10.** The encrypted SQLite driver ships prebuilt — no compiler needed.
- On first launch the app asks for a **PIN**. This derives the key that encrypts your entire vault (SQLCipher). There is no reset, no cloud, no recovery — it's local-first by design.
- Your data lives under the app's `userData/data` directory (or `./data` when running the bare server). Back it up by copying the folder, or export projects as `.svp` (see §10).

---

## 3. Projects dashboard

The first screen after unlocking. Each card shows title, description, draft badge, and counters (scenes / actors / words).

- **New Project** — title + optional description. Creates an empty world.
- **Click a card** — opens the workspace for that project.
- **`.svp` button** — exports the whole project (scenes, versions, world model, memory) as an **encrypted portable file** (AES-256-GCM). Electron opens its native Save-As dialog; pick a location.
- **Import .svp** — restores an exported project as a *new* project. Full round-trip: versions, entity references, and memory all survive.

> **Infrastructure note:** `.svp` files are the interchange format. They're how you hand a narrative world to another machine — or to another person running the same engine.

---

## 4. Ideation tab — brainstorming without tools

A dedicated chat where the AI has **no tools at all**. It cannot read your scenes, cannot propose anything — it's a pure sounding board.

- Chat freely about premise, theme, structure.
- **Select any text → 📌 Pin as Core Concept.** Pinned lines are highlighted and collected in a sidebar.
- **Initialize Working Agent** — compiles your pins into a cohesive **Project Brief** (one LLM call), saves it to project memory as `project_brief` + one `core_directive` per pin, and creates a working scene. From then on, *every* agent run in this project already knows your brief — you never re-explain the premise.

> Use this before touching anything else. A project with a brief gives the agent direction; without one it just reads the world cold.

---

## 5. Scenes / Drafts — the Writing Studio

The prose workspace. Each scene is a card; opening one enters the studio.

- **The editor** is TipTap (a rich-text ProseMirror editor) with autosave. Every save snapshots a **version**.
- **`@` entity references** — type `@` to insert actors, environments, or systems as bold inline tokens. Hover one to see its full profile. References are *live*: if you hover `@Elena Marsh` you see her current engine state, not a stale copy. Deleting an entity cleans up dangling references automatically.
- **Version history** — the dropdown in the studio lists every saved version with label (draft/revised/final) and timestamp. Picking a version loads it for reading; versions are immutable snapshots (git for prose).
- **Word count** updates live and feeds the dashboard counters.

> **Infrastructure note:** versions are how accepted AI proposals materialize — an accepted proposal creates a *new version*, never an overwrite. Nothing in your manuscript is ever silently mutated.

---

## 6. Main Story — assembling the manuscript

Drag-order assembly of the scenes that make up the actual book.

- **Add scenes** and choose **which version** of each goes into the manuscript (draft 3 of scene 2, final of scene 7 — your call).
- **Reorder / remove** entries. Removing from the assembly never deletes the scene.
- **Preview Manuscript** — paginated preview with a title page and author name (defaults to your pen name from Settings).

> The Preview & Export button (top bar) builds on this assembly — see §10.

---

## 7. Actors — the cast, field by field

Actors are the world model's characters. Every field below is *read by the engine* — this is the most important tab to understand. The forms are chip lists and key/value rows; no JSON.

| Field | Stable or volatile | What the engine does with it |
|---|---|---|
| **Attributes** | Stable | Key/value facts (age, abilities, appearance). Rules can *condition* on them (`attributes.age ≥ 30`) and the Layer-6 validity check guards types. |
| **Current State** | Volatile | Where the character is, mood, fatigue. This is what the simulation *mutates* every tick. |
| **Goals** (6 buckets) | Stable | Survival / Functional / Social / Emotional / Long-term / Narrative. Goals generate **pressure** — the force that makes events happen. |
| **Drives** | Stable | Deep motivations ("keep the light burning every night"). Strong pressure source; rules can require a drive keyword to fire. |
| **Habits** | Stable | Routines ("hourly lamp check"). The engine falls back on habits when nothing else pressures the actor. |
| **Knowledge** | Grows | Facts the actor *knows*. **Layer 4 (knowledge legality)** rejects any event where an actor acts on knowledge they don't have. This is the anti-hallucination field. |
| **Capabilities** | Stable | What the actor is *able* to do. **Layer 3 (actor legality)** rejects events requiring missing capabilities. |
| **Constraints** | Stable | Personal restraints — things this actor will not do. Matched against candidate events. |
| **Beliefs** (4 buckets) | Grows | Known (verified) / Believed (unverified) / Uncertain / Misconceptions. Beliefs can be wrong — that's a feature: the engine tracks what's true separately from what the character *thinks* is true. |
| **Plans** | Volatile | What the actor is currently pursuing. The engine can **interrupt plans** when the world changes under them. |

Cards on the Actors tab show a preview of attributes plus the actor's drives as chips. Click **edit** to change anything.

> **Infrastructure note:** this table *is* the LLM's context schema. When Claude connects via MCP and calls `get_actor`, this is the typed structure it gets back — not a wall of prose to re-interpret every session.

---

## 8. World Model tab — environments, systems, rules, relationships, constraints

### 8.1 Environments
Locations as first-class objects: stable **attributes** (height, rooms), volatile **state** (weather, occupancy), **inhabitants**, and **active processes** ("storm front approaching") — ongoing changes the engine can advance. Rules scoped to `environment` fire against these records.

### 8.2 Systems
World mechanics as prose lists: **rules** ("fog thickens at dawn"), **constraints** ("ferries do not sail in a full storm"), **active conditions**, **effects**, **exceptions**. Systems are background law — Layer 2 (system legality) consults them.

### 8.3 Rules — the engine's DSL
This is where plot comes from. A rule says: **WHEN** these conditions hold, **CANDIDATE** events may fire.

- **Conditions** — rows of `field / operator / value` against an entity's record. Operators: `equals`, `not equals`, `>`, `≥`, `<`, `≤`, `is one of`, `is not one of`, `exists`, `is missing`. Field paths like `state.fatigue` or `attributes.role`.
- **Pressure keyword** (optional) — the rule only fires for entities whose drives/goals/habits/plans mention it (e.g. keyword `lamp` matches the habit "hourly lamp check").
- **Candidate event** — `id`, `summary` (`{name}` is replaced with the actor's name), `level` (micro = background tick, event = notable beat), `narrativeWeight`, `probability`, and **state changes** (`field / op / value` — set, increment, append, remove).
- **Priority, probability, cooldown** — how candidates compete and how often a rule may fire.

> **Gotcha:** conditions can only see the fields the engine exposes per entity — `attributes.*`, `state.*`, plus the flat lists above. `type` and `name` are *not* condition fields.
> **Gotcha 2:** state changes that would be no-ops (setting a field to its current value) are skipped for `transitionOnly` candidates — start your actor in the *pre-change* state so the event actually happens.

### 8.4 Relationships
Pick two actors — the bond starts neutral and **the engine develops it** as events unfold (trust, affection, resentment, obligation…). Rules can be scoped to relationships, so social consequences become causal.

### 8.5 Narrative constraints — the firewall's lawbook
Constraints are **destinations, not events** — statements about what must (or must never) become true:

- **Hard** — must be respected; blocks contradictions.
- **Soft** — steering, not blocking.
- **Forbidden** — keywords that must never appear in any proposed change. **This is the Layer-1 gate the LLM keeps hitting.** When an LLM proposal's text contains a forbidden keyword, it's rejected with the constraint's description as guidance.
- **Range** — a field must stay between min and max.
- **Temporal** — must be reached by a deadline (escalates pressure as it approaches).

> ⚠️ Forbidden keywords are substring-matched against *any* candidate — including the engine's own rules. Forbid the phrase "lamp dark", not the bare word "lamp", or you'll block your own lamp-check rule.

---

## 9. Simulation tab — the engine at work

Press **Advance** (choose ticks, up to 500 per run) and watch:

- **Event timeline** — every event with timestamp, participants, and location. Generated with **zero LLM tokens**: the loop is clock → queue → rule evaluation → seeded rolls → validation → state mutation → emission.
- **Determinism** — world seed + simulation seed are stored on the run. **Reset and re-advance produces a bit-identical event history.** Different seed, different but equally valid history.
- **Causal ancestry** — select any event and trace its parents: why it happened, recursively. (Also available over MCP: `event_ancestry`.)
- **Episodes** — the extractor groups related events into story-shaped units.
- **Scene skeletons** — the extractor distills notable stretches into neutral scene structures: beats, participants, entry/exit state. **This is what the LLM renders into prose** (see §11). Skeletons never contain invented causality — the engine wrote the story.
- **Snapshots** — branch a run at any point to explore alternate histories.

> **Infrastructure note:** this tab is the answer to "why not just prompt GPT for the plot?" The plot is computed, causal, and reproducible — like CI for narrative.

---

## 10. Agent tab — the AI partner, firewalled

The agent chats, reads your world, and *proposes*. Everything lands behind an Accept button.

### 10.1 Modes (the badge next to the chat)
| Mode | The LLM can… | Use when |
|---|---|---|
| **Observer** (default) | Read everything, render prose (staged), advise | You want zero risk of canon drift |
| **Baked-in** | All of the above **+ propose structured state changes** (`propose_actor_change`, etc.) that pass 6-layer validation | You want the LLM inside the loop — with the firewall on |
| **Research** | Read-only subset, isolated thread | Side-questions without polluting the main chat |
| **Ideation** | Nothing — pure chat | Brainstorming (see §4) |

Click the badge to toggle Observer ↔ Baked-in. Watch for the toast describing the switch.

### 10.2 The chat
- **Tool pills** show each call and a one-line result (`Rejected (Layer 1): violates narrative constraint … — NON-CONTRADICTION CHECK`).
- **AI Thinking** — expandable reasoning stream (when the provider exposes it).
- **Proposals** render as **Original / Proposed diffs** with Accept / Reject. Accepting creates a new scene version through the normal pipeline. Nothing else writes.
- **Usage** — the run's token usage (input/output) is reported when the stream completes. The LLM is metered.

### 10.3 Memory panel
Project memory entries (`fact`, `rule`, `hypothesis`) are injected into every agent run. `project_brief` and `core_directive` entries (from Ideation) are injected *first*. This is how the agent knows your world without you re-pasting it.

### 10.4 AI Settings
Provider (`openai` / `anthropic` / `openai-compatible`), base URL, model, API key. The key is stored **encrypted inside your vault** (`system_settings.agent_settings`) — never in a config file, never returned by the API, never logged. Optional context-window override for gateways whose models the auto-detector can't size. Use the built-in **Test** button to verify connectivity.

### 10.5 Research threads
Branch any message into an isolated thread that only sees context up to that point. Explore the tangent, then **Synthesize & Merge** (an LLM condenses the thread into the main chat) or **Discard**. The main conversation stays clean.

---

## 11. Rendering a skeleton into prose — the payoff

1. **Simulation tab** → run until skeletons appear → click **Render** on one (or ask any MCP client: `render_skeleton { skeleton_id }`).
2. The LLM receives the neutral skeleton — beats, participants, entry/exit state, *no invented causality* — and writes the scene.
3. The result is **staged as a proposal**: a diff card in the Agent tab. Nothing is saved yet.
4. **Accept** → a new scene version appears in version history. **Reject** → discarded.

> **Infrastructure note:** this is the only step where tokens are spent on the story itself — and it's metered, staged, and reversible. The engine wrote the story; the LLM wrote the words.

---

## 12. Ideas — the unidirectional vault

A sandbox for sudden plot ideas. Ideas can be *linked* to a scene, but the Writing Studio and manuscript never see them — ideas cannot leak into canon. An idea can be **evaluated by the AI in a research thread** ("would this break causality?") without ever touching the world model.

---

## 13. Preview & Export

- **Manuscript** — Markdown, DOCX (title page, running header, page numbers), or PDF, assembled from the Main Story. Author/title fields are sanitized against injection.
- **Project ZIP** — structured DOCX bundle of the whole world.
- **Single item** — one scene version / actor / environment / system as MD or PDF.
- **.svp backup** — the encrypted whole-project file (see §3). Import restores it as a new project.

---

## 14. The 15-minute path — start here

You do **not** need the whole app to feel the architecture. This is the shortest path that exercises the thesis:

1. **Create a project** (dashboard → New Project).
2. **Actors tab → New Actor.** Give her an age, a **drive** ("keep the light burning every night"), a **knowledge** fact, a **capability**, and a state field (`state.lampWick: untrimmed`).
3. **World tab → Rules → New Rule.** Condition: `attributes.age ≥ 30`. Candidate event: summary `{name} climbs the tower for the hourly lamp check`, state change `state.lampWick` = `trimmed`. Cooldown 3.
4. **World tab → Constraints → New.** Class **Forbidden**, forbidden keyword `lamp dark`. This is your firewall.
5. **Simulation tab → Advance** (12 ticks). Watch events appear. Reset → Advance again — identical history, zero tokens.
6. **Simulation tab → Render** a skeleton. Check the Agent tab: a staged diff. Accept it. Open version history — a new version exists.
7. **Agent tab** — ask: *"Can you change Elena's drives right now?"* In Observer mode it will tell you it can't.
8. Switch to **Baked-in**, then (from Claude Desktop over MCP) propose: *"Elena snuffs the lamp for the night."* Watch the engine reject it at Layer 1 with guidance. Propose something canon-legal — accepted, applied, visible on the actor card.

Everything else in this guide — ideation pinning, research threads, snapshots, DOCX export — is depth you can grow into. The core loop is 8 steps.

---

## 15. Connecting external AI clients (MCP)

Story Vault publishes the whole narrative world as an MCP server. Claude Desktop, Cursor, Cline, or any MCP client can read canon, query events, and *propose* changes — through the same firewall as the built-in agent.

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "story-vault": {
      "command": "node",
      "args": ["<repo>/dist/mcp.js"],
      "env": { "STORY_VAULT_PIN": "<your-pin>", "STORY_VAULT_PROJECT_ID": "18" }
    }
  }
}
```
Or with zero setup: `npx story-vault-mcp` (npm) / `uvx story-vault-mcp` (PyPI).

**The running app also serves MCP over HTTP** at `http://127.0.0.1:3100/mcp` (auto-starts on unlock) for clients that speak Streamable HTTP.

**Tool families (78 total):** CRUD for every world-model entity · `list_events` / `get_event` / `event_ancestry` / `list_episodes` / `list_skeletons` / `advance_simulation` / `snapshot_simulation` · `propose_actor_change` & friends (validated) · `render_skeleton` (staged) · `get_ccm_guidance` / `check_semantic_consistency` / `suggest_tags` (advisory) · memory, ideas, search.

**Security:** the PIN only derives the DB key and is never exposed to the model; ownership checks on every call; DTOs strip metadata; the vault stays encrypted at rest.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **Canon** | What is true in the story. Owned by the engine, stored encrypted, never LLM-writable. |
| **Tick** | One step of the simulation clock. |
| **Pressure** | The force that makes events happen — built from goals, drives, habits, plans, constraints, deadlines. |
| **Candidate event** | A possibility a rule generates when its conditions hold; the seeded PRNG decides. |
| **Causal ancestry** | The chain of parent events that caused an event. |
| **Episode** | A story-shaped grouping of related events (extractor output). |
| **Skeleton** | A neutral scene structure (beats, participants, entry/exit state) awaiting prose. |
| **Staged proposal** | LLM output parked behind Accept/Reject. The only way AI output enters the manuscript. |
| **Narrative constraint** | A law about what must/must-not become true. The firewall's rulebook. |
| **Validation layers** | 1 non-contradiction · 2 system legality · 3 actor legality · 4 knowledge legality · 5 state compatibility · 6 consequence validity. |

---

## 17. Troubleshooting

- **"Vault is locked"** — the app needs the PIN after a restart. API/MCP calls fail until it's unlocked.
- **Port 3000 busy** — a zombie dev server. Kill the stale node process; the server also auto-increments ports on a healthy boot.
- **MCP client shows no tools** — on Windows, some clients' STDIO transport is broken (a known Qwen Studio bug affects *all* MCP servers). Use the HTTP endpoint (`http://127.0.0.1:3100/mcp`) instead.
- **Simulation produces no events** — check that rule conditions target fields the engine exposes (`attributes.*`, `state.*`, drives/habits lists — not `type`/`name`); check cooldowns; remember no-op state changes are skipped, so start actors in the pre-change state.
- **An LLM proposal keeps getting rejected** — read the rejection: layer + reason + guidance. The guidance is the CCM rule it violated. That's the system working.
- **.svp export leaves a `.tmp` file** — Electron's native Save-As dialog is still open; pick a location. The toast fires before you confirm (cosmetic).
- **Conversation exceeds the model's window** — the agent compresses and trims automatically; if even that fails, start a new chat or set a context-window override in AI Settings.

---

## 18. Where to go deeper

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how it's built: topology, data model, agent framework, MCP.
- **[CCM.md](CCM.md)** — the Causal Continuity Model, the theory behind the engine.
- **[CCM_CCE_IMPLEMENTATION.md](CCM_CCE_IMPLEMENTATION.md)** — how the theory became code.
- **[docs/HARBOR_LIGHTS_DEMO.md](docs/HARBOR_LIGHTS_DEMO.md)** — the pre-seeded demo world, field by field.
