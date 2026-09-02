# Harbor Lights — Seeded Demo World

The live demo project for the "AI Infrastructure for Narrative Canon" walkthrough. It already
exists in the vault — **do not recreate it by hand**; this document records what is in it and
what each piece is for. If it is ever lost, re-run the seed calls at the bottom (or ask the
assistant to rebuild it).

**Project:** `Harbor Lights` — **id 18**
**Scene:** "The Hourly Lamp Check" — **id 10** (description only, no versions — leave for the demo)
**Simulation:** "Harbor Lights — Demo Run" — **id 51** (worldSeed/simulationSeed default 1, hour granularity)
**Last engine run:** 12 ticks → 10 events, 9 episodes, 9 skeletons (14 candidates, 0 rejections)

## The cast

| Actor | ID | Role in the demo |
|---|---|---|
| **Elena Marsh** | 58 | Protagonist, lighthouse keeper. Drives: `keep the light burning every night`. Knowledge: whale oil, Tuesday ferry. Capabilities: climb/trim/row. State: `location: Keeper Quarters`, `lampWick: untrimmed`, `fatigue: 3`. |
| **Tomas Reyes** | 59 | Ferry captain. `attributes.role: "ferry captain"` (drives the supply-run rule). Knowledge: ferry schedule, reef shoals. |

**Relationship:** Elena ↔ Tomas (id 21, neutral — the engine develops it).

## World model

- **Environments:** Anchor Isle Lighthouse (id 22, `state.weather: clear`, storm approaching) · Harbor Docks (id 23)
- **System:** Weather (id 17 — rules/constraints/effects as prose lists)
- **Rules (3):**
  - *Hourly Lamp Check* (id 17) — actor scope, condition `attributes.age ≥ 30`, candidate `lamp.check` ("{name} climbs the tower…") → `state.lampWick = trimmed`, cooldown 3
  - *Fog Over the Isle* (id 18) — environment scope, condition `attributes.height exists`, candidate `fog.roll` → `state.weather = foggy`, cooldown 4
  - *Tuesday Supply Run* (id 19) — actor scope, condition `attributes.role == "ferry captain"`, candidate `boat.delivery` → `state.lastRun = completed`, cooldown 6
- **Narrative constraints (2):**
  - **The trap:** *The lamp must burn each night* (id 8) — class `forbidden`, target `{ actors: [Elena Marsh], field: drives, forbidden: [snuff, extinguish, lamp dark] }`. Any `propose_actor_change` whose summary mentions those keywords is rejected at **Layer 1** with the Non-Contradiction guidance. Do not widen the forbidden list to the bare word "lamp" — it would block the engine's own `lamp.check` candidate (substring match).
  - *Elena trims the wick hourly* (id 9) — class `hard`, satisfied when `state.lampWick == trimmed`.

## Demo script mapping (see chat for the full spoken script)

- **Phase 2 (MCP):** `list_actors` → 58/59; `list_rules` → the three rules; `list_constraints` → the trap.
- **Phase 3 (engine):** Simulation tab → Advance (12 ticks) → timeline + ancestry. Zero tokens.
- **Phase 4 (firewall):** `propose_actor_change` on actor 58 with summary "Elena snuffs the lamp for the night" → `rejectedLayer: 1`. Then a knowledge attack with `requires_knowledge` → `rejectedLayer: 4`. Then a legal proposal → accepted.
- **Phase 5 (render):** `render_skeleton { skeleton_id: <one of 60-68> }` → staged proposal → Accept.

> **GUI note:** every field above was created through the **friendly forms** (Actors / World tabs —
> chip lists, key/value rows, dropdowns — no JSON). The World tab's rule editor exposes one
> candidate event per rule, which covers this world; worlds needing multiple candidates per rule
> can still be seeded via MCP (`create_rule`).

## Re-seed (only if the vault is lost)

Unlock the app, then run the same tRPC calls the assistant used: `project.create` →
`actor.create` ×2 → `environment.create` ×2 → `worldSystem.create` → `rule.create` ×3 →
`constraint.create` ×2 → `relationship.create` → `scene.create` → `simulation.create` →
`simulation.advance { ticks: 12 }`. Field values are all in this document.
