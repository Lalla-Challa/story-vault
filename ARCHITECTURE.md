# Story Vault — Architecture & Developer Guide

**Story Vault** is a local-first, professional writing workspace. The desktop app is built on
Electron; the renderer is a React 19 SPA served by an in-process Express + tRPC server, and all
data lives in a single SQLCipher-encrypted SQLite database gated by a user-chosen PIN. The
**Causal Continuity Model (CCM) / Causal Continuity Engine (CCE)** is the canonical core:
project-scoped world model (actors/environments/systems/rules/relationships/constraints) +
simulation-scoped event history (events/episodes/skeletons) + engine-owned canon that the LLM
only reads or proposes through validation.

This document is generated from the source tree and is the single source of truth for the
codebase. It supersedes all older documentation. For the framework theory see [CCM.md](CCM.md);
for the refactor narrative (Phases A–C, engine internals, current reality & caveats) see
[CCM_CCE_IMPLEMENTATION.md](CCM_CCE_IMPLEMENTATION.md).

---

## 1. Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 33, electron-vite 4 (main/preload bundling) |
| UI | React 19, Vite 7, Tailwind CSS 4, Radix UI (shadcn-style components), wouter 3.7.1 (patched; pinned, not caret — see `patches/wouter@3.7.1.patch`) |
| Editor | TipTap 3 (ProseMirror) — custom `EntityReference` node + suggestion plugin |
| Backend | Node.js + Express 4, tRPC 11 (superjson), TanStack Query 5 on the client |
| Data | SQLite via `better-sqlite3-multiple-ciphers` (SQLCipher N-API prebuilts; plain `better-sqlite3` is `devDep` for types only), Drizzle ORM 0.44 (sync driver) |
| AI | Vercel AI SDK 6 (`ai` + `@ai-sdk/openai` / `@ai-sdk/anthropic` / `@ai-sdk/openai-compatible`) — OpenAI, Anthropic, or any OpenAI-compatible endpoint (Ollama, LM Studio). Models expose `reasoning_content` for the thinking viewer. |
| Engine semantics | `@huggingface/transformers` ^4.2.0 (ONNX, CPU-only, lazy singleton) — `Xenova/all-MiniLM-L6-v2` (bi-encoder, retrieval) + `Xenova/nli-deberta-v3-small` q8 (cross-encoder NLI, advisory only) |
| Export | `docx`, `pdfkit`, `jszip`, markdown, encrypted `.svp` backups (AES-256-GCM, `SVP\x01` header) |

---

## 2. Repository Layout

```
story-vault/
├── electron/
│   ├── main.ts               # Electron main: window lifecycle, boots the in-process server (prod)
│   └── preload.ts            # Minimal contextBridge (platform/versions only)
├── server/
│   ├── _core/
│   │   ├── index.ts          # CLI entry (tsx dev server / node dist)
│   │   ├── bootstrap.ts      # startServer(): Express + tRPC + REST + SSE/MCP + static serving
│   │   ├── env.ts            # Packaging-safe path resolution (dataDir, migrationsDir, ccmIndexPath, logDir)
│   │   ├── localAuth.ts      # PIN vault: setup / unlock / lock / changePin (atomic rekey-verify loop)
│   │   ├── context.ts        # tRPC context — local user when vault is unlocked
│   │   ├── trpc.ts           # public/protected/admin procedures + audit-wrapped logAction
│   │   ├── agentSse.ts       # POST /api/agent/run — SSE stream for the agent loop
│   │   ├── mcpServer.ts      # Embedded MCP HTTP server (per-initialize fresh Server+transport)
│   │   ├── systemRouter.ts   # system.health, system.vaultState
│   │   ├── monitoring.ts     # request/error middleware + retention cleanup
│   │   └── vite.ts           # dev-only Vite middleware (never bundled for production)
│   ├── ccm/                  # THE ENGINE — pure, deterministic, CPU-only semantics
│   │   ├── types.ts          # Domain types: Actor/Env/System/Rule/Relationship/Constraint, EngineEvent, World, Episode, Skeleton …
│   │   ├── rng.ts            # Seeded PRNG (mulberry32) — ALL randomness flows through this
│   │   ├── time.ts           # World clock {day, minute} + helpers
│   │   ├── state.ts          # Dotted-path get/set, evaluateCondition, applyStateChange
│   │   ├── rules.ts          # Rule matching, candidate generation, entity records, pressure hooks
│   │   ├── pressure.ts       # Engine pressure multiplier
│   │   ├── validation.ts     # 6-layer validation (non-contradiction … consequence validity)
│   │   ├── causality.ts      # Causal graph + deferred causal load
│   │   ├── simulator.ts      # Pure step loop: loadWorld → step(tick) → events (no DB, no RNG leak)
│   │   ├── extractor.ts      # Story extractor: episodes + scene skeletons from events
│   │   ├── loader.ts         # Hydrate World from project-scoped tables + simulation config
│   │   ├── persister.ts      # Persist run deltas transactionally
│   │   ├── semantics.ts      # Lazy ONNX singleton (NLI + zero-shot); PURE/READ-ONLY — never imported by simulator
│   │   ├── guidance.ts       # Tiered CCM retrieval: file index + cosine search under tokenBudget
│   │   ├── embeddings.ts     # Bi-encoder for the ccm-index build only
│   │   ├── ccm-index.json    # Committed build artifact — the embedded retrieval index
│   │   ├── __smoke__.ts      # Determinism smoke (Kaden scenario: same seed → identical events)
│   │   ├── __emergent__.ts   # Emergence smoke (Mara/Finn: cross-actor events, relationship + weather rules, seed reproducibility)
│   │   └── __multiactor__.ts # CCE v1.1 smoke (Harmon Creek: observation→knowledge, counterfactuals, multi-seed)
│   ├── modules/
│   │   ├── projects/         # project router+data (CRUD, settings, stats, spec)
│   │   ├── scenes/           # scene / version / mainStory routers+data (prose spine, sizeBytes)
│   │   ├── actors/           # actor router+data (actorSizeBytes, quota delta on update, dangling-span cleanup)
│   │   ├── world/            # world router+data (environments/systems/rules/relationships/constraints)
│   │   ├── ideas/            # Idea Vault router (idea size tracked, delta on update)
│   │   ├── simulation/       # simulation data + run.service + skeletonRenderer
│   │   └── migration/        # Runtime legacy migration (characters/world_building_notes → CCM, then drop)
│   ├── agent/
│   │   ├── tools.ts          # Two-mode buildAgentTools (observer vs baked_in) + SSE event types
│   │   ├── engineProposals.ts# proposeActor/Environment/System/RelationshipChange (6-layer validation + advisory)
│   │   ├── runAgent.ts       # The agent loop (streamText + tool calling + budgeted context)
│   │   ├── contextBudget.ts  # Token estimation + model context-window detection + budget math
│   │   ├── compression.ts    # LLM summarization of old chat messages (sliding-window, compressedContext)
│   │   ├── settings.ts       # AI provider settings stored encrypted in system_settings
│   │   ├── provider.ts       # AI SDK model factory (openai / anthropic / compatible; Ollama default http://localhost:11434/v1)
│   │   ├── systemPrompt.ts   # Writing-partner persona + delegation + research-thread rules
│   │   ├── projectMemory.ts  # project_memory CRUD + sandboxed <Project Memory> block (escaped)
│   │   ├── chatSessions.ts   # Sessions, branching, research threads (compressedContext inheritance), idea threads
│   │   ├── synthesize.ts     # Research-thread → condensed summary LLM call
│   │   └── ideation.ts       # Ideation pinning + LLM-compiled project brief
│   ├── mcp.ts                # MCP server: external AI access (78 tools + semantic advisory), STDIO + Streamable HTTP
│   ├── routers/
│   │   ├── agent.ts          # agent.settings / mode / proposals / sessions / memory
│   │   ├── ideas.ts          # ideas CRUD + evaluate (→ research thread); enforces byte-quota
│   │   ├── admin.ts          # admin users/projects/scenes/analytics/monitoring/audit
│   │   ├── export.ts         # manuscript (md/docx/pdf), project zip, single-item export (sanitizeDocText)
│   │   ├── search.ts         # LIKE-based project search (actors/environments/systems/rules + scenes/versions)
│   │   ├── writing.ts        # writing heartbeat (analytics)
│   │   └── versionComparison.ts # line diff between two scene versions
│   ├── routers.ts            # Root appRouter — composition root only
│   ├── api.ts                # REST router under /api/rest (incl. .svp import/export + search mirror)
│   ├── db.ts                 # SQLCipher connection mgmt (WAL + busy_timeout) + migration runner + facade re-exports
│   ├── entities.ts           # EntityReference serialization (serializeEntitiesForAgent, entitySpansToMarkdown, cleanupDanglingSpans)
│   ├── svp.ts                # Encrypted portable project format (v2; v1 import path preserved)
│   ├── seedEmailTemplates.ts # Idempotent email-template seeder
│   └── services/             # activityTracker, auditService, betaService, emailService,
│                             # monitoringLogger (app.getPath("userData")/logs), staticServer,
│                             # storageService (byte-accurate recomputeUsage, enforceQuota)
│   ├── shared/               # const.ts (lock messages, local user id), types.ts, _core/errors.ts
├── client/src/
│   ├── pages/                # Home, Login (PIN), ProjectDashboard, ProjectWorkspace (simulation tab), About/Terms/Privacy/Support/BetaApply/Feedback
│   ├── components/
│   │   ├── agent/            # AgentWorkspace (+ AgentModeBadge), ResearchThreadPanel, ProposalCard,
│   │   │                     # AgentSettingsDialog, AgentMemoryPanel, chatShared
│   │   ├── editor/           # EntityReference node + EntityReferenceView (hover card; actor/environment/system)
│   │   ├── ideas/            # IdeaManager (Idea Vault UI)
│   │   ├── ideation/         # IdeationChat (no-tools mode, pinning popover, brief → scene handoff)
│   │   ├── simulation/       # SimulationWorkspace (timeline, ancestry, world state, skeletons, Render with AI)
│   │   ├── ui/               # shadcn/Radix primitives
│   │   └── …                 # ActorManager (was CharacterManager), WorldModelManager, WritingStudio, RichTextEditor, …
│   ├── hooks/                # useAuth (vaultConfigured/vaultUnlocked), useWritingHeartbeat, useAutoSave, …
│   ├── lib/                  # trpc client, agentSse consumer, docxExport, utils
│   └── _core/hooks/useAuth.ts
├── admin/src/                # Admin Operations Center — bundled into the SPA at /admin
├── docs/                     # feature documentation (e.g. HARBOR_LIGHTS_DEMO.md)
├── shared/                   # const.ts, types.ts, _core/errors.ts (shared between server/client)
├── drizzle/                  # schema.ts + SQLite migrations 0000–0007 (drizzle-kit generate-only)
├── data/                     # Runtime vault (gitignored): story_vault.db, auth.json
├── mcp/
│   ├── npm/                  # Publishable npm package `story-vault-mcp` 2.2.0 (self-contained CJS + @huggingface/transformers external)
│   └── python/               # Publishable PyPI package 2.0.3 (uvx launcher → npx, cmd.exe /c on Windows)
├── electron.vite.config.ts   # The ONLY renderer build (main esm + preload cjs + renderer → dist/client)
├── drizzle.config.ts         # drizzle-kit (generate only — never push: DB is encrypted, migrations applied at unlock time)
├── scripts/build-ccm-index.ts# One-shot ccm-index builder (embeds sections with all-MiniLM-L6-v2)
└── package.json              # build = build:server && build:electron && build:mcp (no build:client — renderer is part of electron)
```

Every domain module = router + data + DTOs in one folder; `server/db.ts` is infrastructure + facade re-exports; `server/routers.ts` merges them. The standalone `vite.config.ts` that used to build `dist/client` in parallel was deleted — `electron.vite.config.ts:renderer` is now the sole renderer build (otherwise the two stamp on the same output with different pruned-vendor trees).

---

## 3. Runtime Topology

Two entry points share one server bootstrap:

- **`server/_core/index.ts`** — CLI entry (`pnpm dev:server` / `pnpm start`). Runs the Express
  server in a plain Node process (used for development with Vite HMR, or standalone production).
- **`electron/main.ts`** — Electron entry:
  - **Development**: loads `VITE_DEV_SERVER_URL` (set to `http://localhost:3000` by
    `pnpm dev:electron`), i.e. the renderer is served by **electron-vite's dev server**, NOT by the
    Express server's Vite middleware. The main bundle does **not** start the server in this mode.
    The old pattern of mounting Vite middleware inside `bootstrap.ts` was intentionally removed —
    re-adding it reintroduces the Vite warmup hang.
  - **Production**: dynamically imports `server/_core/bootstrap`, calls `startServer()`
    in-process, and loads `http://127.0.0.1:<port>`. The renderer is served statically from
    `dist/client`.

`bootstrap.ts` (`startServer()`):

1. Installs process-level error handlers and the monitoring retention cleanup.
2. Seeds email templates (idempotent; no-op until the vault is unlocked and the DB is open).
3. Express app: 50 MB JSON/urlencoded body parsing, request-monitoring middleware.
4. `POST /api/agent/run` — SSE route for the agent loop (vault-auth via `createContext`).
5. `/api/rest` — REST router (SVP import/export + CRUD mirrors; local-auth middleware).
6. `/api/mcp` — embedded MCP Streamable HTTP server (`buildMcpServer()` per initialize — fresh Server+transport per session; `storyvault.local → 127.0.0.1` via hosts-file Host header).
7. `/api/trpc` — tRPC middleware with the full `appRouter`.
8. Development → **no Vite middleware** (HMR lives in `electron-vite dev`); production → static SPA serving from `dist/client` via `staticServer.ts` (`process.resourcesPath/dist/client` first, then `app.getAppPath()`, then `cwd`).
9. Listens on `PORT` (default 3000, auto-increments to the first free port; zombie-process check before assuming a busy port is real).

The admin console is **not** a separate server: the SPA mounts the admin app at
`/admin*` routes (see `client/src/App.tsx`), sharing the same auth and API.

Packaging paths (`server/_core/env.ts`): `resolveDataDir()` / `resolveMigrationsDir()` / `resolveCcmIndexPath()` / `getLogDir()` all probe `app.getPath("userData")` / `process.resourcesPath` when `app.isPackaged`, falling back to `process.cwd()` in dev. Importing `electron` in the renderer/bundled code must use the `createRequire` trick (see Gotchas).

---

## 4. Data Model (`drizzle/schema.ts`)

All tables are SQLite, defined with Drizzle. Notable conventions: `text(..., { enum })` for
enums, `text(..., { mode: "json" })` for JSON columns, `integer(..., { mode: "timestamp" })`
for unix-epoch-second timestamps, `integer(..., { mode: "boolean" })` for booleans. Secondary
indexes live inside each `sqliteTable(..., (table) => ({ ... }))` callback (not as detached
`index()` calls) — e.g. `projects_title_idx`, `project_settings_projectId_idx`, `scenes_projectId_idx`, etc. `ccm_rules.scope` is plain `text("scope")` (not `mode:"json"`).

**Projects**

| Table | Purpose |
| --- | --- |
| `projects` | A manuscript; belongs to `userId`. Has `spec` (CCM Story Spec JSON: `{ premise, themes[], targets[], forbidden[] }`) and `description`. |
| `project_settings` | JSON key/value per project (e.g. `character_attributes` → now `actor_attributes`; `agent_mode` = `observer` \| `baked_in`, default observer). Unique on `(projectId, settingKey)`. |
| `user_settings` | Author preferences (pen name, theme, export format, daily goal). |
| `user_storage` | Quota tracking (500 MB default; `usedBytes`/`limitBytes`/`lastRecomputedAt`). Byte-accounted by `storageService.recomputeUsage` — see §11. |

**Manuscript domain (prose spine — unchanged)**

| Table | Purpose |
| --- | --- |
| `scenes` | Scene/chapter metadata: title, description, `status` (draft/revised/final), live `wordCount`. |
| `scene_versions` | Immutable content snapshots (the git-style history). Saving creates a new row; `content` is TipTap HTML with `EntityReference` spans; `sizeBytes` is the UTF-8 byte length of `content`. |
| `main_story_scenes` | The curated manuscript: `(sceneId, versionId)` + `order`. |
| `users` | The single local user (openId `local:primary`, role `super_admin`) plus any provisioned secondary accounts. |

> **Removed tables (migrated at unlock time).** `characters` and `world_building_notes` no longer exist in the schema. Their data is copied once by `server/modules/migration/legacy.ts` (`migrateLegacyEntities()`): `characters` → `ccm_actors` (profile fields fold into `attributes`), `world_building_notes` `location` → `ccm_environments`, `magic_system`/`faction` → `ccm_systems`, `lore`/`other` → `project_memory` (`fact`/`hypothesis`). Entity spans in `scene_versions.content` are rewritten `character|lore` → `actor|environment|system`, then the legacy tables are `DROP`ped. The SQL migration `0006` itself never drops them.

**CCM world model (project-scoped — one canonical world per project)**

| Table | Purpose |
| --- | --- |
| `ccm_actors` | Canonical actor (was `characters`). `attributes` = stable traits (`age`/`abilities`/`custom`), `state` = volatile world state, plus `goals` (5 layers incl. narrative), `drives`, `beliefs` (`known`/`believed`/`uncertain`/`misconceptions`), `knowledge`, `capabilities`, `constraints`, `resources`, `habits`, `plans`. |
| `ccm_environments` | Place with its own state/resources/inhabitants/accessibility/activeProcesses/constraints. |
| `ccm_systems` | World mechanism (Cardiology, Weather, Magic…) — keeps the engine free of hard-coded "real world" assumptions. |
| `ccm_rules` | The engine: `family` (`actor`/`relationship`/`environment`/`biology`/`physics`/`social`/`temporal`/`narrative`), `when`/`candidateEvents`/`effects` DSL, `priority`/`probability`/`cooldown`/`scope`. Each family stays separate so a new MagicSystem never rewrites the RelationshipSystem. |
| `ccm_relationships` | First-class qualitative edge: `trust`/`familiarity`/`affection`/`resentment`/… + `expectations`/`history`. Unique on `(actorAId, actorBId)`. |
| `ccm_narrative_constraints` | Destinations & forbiddens: `class` hard/soft/forbidden/range/temporal, `target`, `deadline`, `satisfied/satisfiedAt`. The planner/extractor biases toward them; the engine never teleports. |

**Simulation domain (simulation-scoped — generated history)**

| Table | Purpose |
| --- | --- |
| `ccm_simulations` | A run config: `worldSeed`/`simulationSeed`, `clock` (`CcmClock` JSON), `settings` (`tickMinutes`/`maxEventsPerRun`/`granularity`), `status`. |
| `ccm_events` | The atomic record: `level` micro/event, `eventType`/`participants`/`location`/`timestamp`/`trigger`/`preconditions`/`action`/`transition`/`consequences`/`causalLoad`/`narrativeWeight`/`certainty`/`visibility`/`stateChanges`. |
| `ccm_event_causes` | Causal graph edges (`eventId` → `parentEventId`, unique pair). Queryable ancestry. |
| `ccm_event_queue` | Pending world processes (scheduled appointments, deadlines, weather fronts). |
| `ccm_episodes` | Clustered events (gap > 6h or disjoint participants+location → new episode). |
| `ccm_scene_skeletons` | Neutral skeleton (purpose/location/time/participants/entryState/activePressures/beats/turningPoint/exitState/unresolvedThreads/… + `rendered` + optional `sceneId`). LLM renders prose from this — it never invents the causality. |
| `ccm_snapshots` | Serialized world checkpoints for reproducibility. |

**Idea Vault** (unidirectional — ideas point at scenes, scenes never point back)

| Table | Purpose |
| --- | --- |
| `ideas` | Sandboxed ideas: title, content, `status` (raw/evaluating/adopted/discarded), optional `linkedSceneId` → scenes (`onDelete: set null`). Counted in `storageService` quota. |

**AI Agent**

| Table | Purpose |
| --- | --- |
| `agent_proposals` | Staged agent edits (`draft`/`precise_edit`, pending/accepted/rejected) with original + proposed content for diffing. Created by `propose_*` + `render_skeleton`; nothing touches canon until accepted. |
| `project_memory` | Persistent facts/rules/hypotheses + compiled ideation briefs (`project_brief` / `core_directive`). Injected sandboxed into the system prompt: brief/directives always included, other entries scored by relevance under a token budget, content escaped so `<Project Memory>` tags can't become instructions. |
| `chat_sessions` | Chat threads: `type` (main/research/ideation), `status` (active/merged/discarded), `parentId` + `parentMessageId` for branching, `messages` as a JSON array, `compressedContext` (LLM-compressed summary of early messages + `summarizedUpTo` cutoff). `createResearchThread` inherits `compressedContext` when the branch point ≤ `summarizedUpTo`. |
| `system_settings` | Key/value store — includes `agent_settings` (AI provider + encrypted API key). |

**Ops & admin**

| Table | Purpose |
| --- | --- |
| `audit_logs`, `activity_events`, `writing_sessions`, `user_sessions` | Audit + analytics events. `activity_events` includes `simulation_run`/`reset`/`snapshot`/`render`/`ccm_engine_write`/`storage_recomputed`. |
| `request_logs`, `system_logs` | HTTP/error monitoring (also mirrored to JSONL files in `LOGS_DIR` → `app.getPath("userData")/logs` when packaged). |
| `email_templates`, `email_logs`, `feedback`, `messages`, `beta_requests` | Platform features (email sending requires SMTP env). Beta form is disabled in the UI while the vault is locked (`vaultUnlocked === false` guard in `BetaApply.tsx`). |

Migrations: `pnpm db:generate` (drizzle-kit, `generate` only). Applied at
runtime by the app after the vault is unlocked (`migrate()` from
`drizzle-orm/better-sqlite3/migrator`; `busy_timeout=5000`, `journal_mode=WAL`) — the DB can
only be opened with the PIN-derived key. Stack is `0000` → `0007` (see `drizzle/meta/_journal.json`);
`0006` is the hand-written CCM core (13 ccm_* tables + `projects.spec`), `0007` is the missing-indexes catch-up (10 in-callback indexes never generated — `projects_title_idx`, `project_settings_projectId_idx`, etc.; `ccm_rules.scope` plain-text was already fixed in 0006). Hand-writing is required when drizzle-kit's interactive rename detection would stall (no `--yes` flag).

---

## 5. tRPC API Surface

Root `appRouter` (`server/routers.ts` — composition root only):

```
auth  system  userSettings  beta  feedback  communication  email  adminUser  storage
project  projectSettings  scene  version  mainStory
actor  environment  worldSystem  rule  relationship  constraint  simulation
search  versionComparison  export  admin  writing  agent  ideas
```

- **`auth`** — `me`, `vaultState`, `setup` (create PIN), `unlock`, `lock`, `changePin` (tmp-file + rekey-verify + atomic rename).
- **`agent`** — `mode.{get,set}` (per-project `observer`/`baked_in`), `settings.{get,update,test}`, `proposals.{list,accept,reject}`, `sessions.{list,get,create,branch,createResearchThread,synthesize,discard,updateMessages,rename,delete}`, `memory.{list,create,delete,search,preview}`, plus `ideation.initialize` (pins → brief + working scene handoff).
- **`actor` / `environment` / `worldSystem` / `rule` / `relationship` / `constraint`** — full CRUD over the CCM world model (each list/get/create/update/delete). `worldSystem` is not `system` (that collides with `system.health`).
- **`simulation`** — `list/get/create/update/delete`, `advance` (run N ticks → events+episodes+skeletons), `reset`, `snapshot/snapshots/restoreSnapshot`, `events/event/ancestry`, `episodes/skeletons/skeleton/deleteSkeleton`, `renderSkeleton` (skeleton → staged proposal, Mode-2).
- **`ideas`** — `list` (projectId + optional `linkedSceneId`/`status` filters), `get`, `create`, `update`, `delete`, `evaluate` (opens a research thread seeded with the idea). Byte-quota enforced; delete recalibrates.
- **`export`** — `manuscript` (md/docx/pdf), `projectZip`, `singleItem`. Every interpolated `authorName`/`project.title`/`description` passes through `sanitizeDocText` (strips control chars + HTML boundary masquerade).
- **REST** (`/api/rest`) — SVP export/import plus CRUD mirrors of projects/scenes/versions/actors/environments/systems/search. Uses the same local-auth context.

Authorization model: every project-scoped procedure resolves the project and verifies
`project.userId === ctx.user.id`; role-gated procedures use the hierarchy
`user < viewer < support < admin < super_admin` (the local user is `super_admin`).
Sensitive admin mutations are written to `audit_logs` via `ctx.logAction`. `storageService` is called on every content-bearing write/delete (see §11).

---

## 6. Auth & Security

`server/_core/localAuth.ts` implements the vault state machine:

- **First launch** (`auth.setup`): generates two random salts, stores `{ pinSalt, pinHash,
  keySalt }` in `data/auth.json`, derives a 32-byte raw key with **scrypt** (N=4096), opens the SQLite
  file with SQLCipher (`PRAGMA key = "x'<hex>'"`), applies migrations (`migrate()` + `migrateLegacyEntities()`), and creates the single
  local user (`openId: local:primary`, role `super_admin`) plus a `user_storage` row.
- **Unlock** (`auth.unlock`): verifies the PIN against the stored scrypt hash (constant-time
  compare), derives the key, opens the DB (a wrong key fails with "file is not a database"),
  and applies any pending migrations + the runtime legacy migration.
- **Lock** (`auth.lock`): closes the SQLite handle; all subsequent requests are unauthenticated.
- **Change PIN** (`auth.changePin`): verifies the current PIN, writes new config to a **tmp file**, runs `PRAGMA rekey` with the new derived key, **verifies by rekeying back with the old key** on failure, and only then **atomically renames** the tmp file over `auth.json`. If the rename fails after a successful rekey, the error instructs the user to restart and re-enter the new PIN.

The tRPC context (`server/_core/context.ts`) resolves the local user **only when the vault is
unlocked**; otherwise `ctx.user` is null and `protectedProcedure` throws
`UNAUTHORIZED` (`Vault is locked (10001)`), which the client intercepts to redirect to
`/login`. The API key for the AI provider is stored inside the encrypted DB
(`system_settings` → `agent_settings`) and is never returned by any endpoint — only a
`hasApiKey` boolean.

`.svp` project backups are encrypted with AES-256-GCM using `SVP_SECRET` (SHA-256-derived key),
with a `SVP\x01` magic header, 16-byte IV, and GCM auth tag. v2 carries `actors/environments/systems/rules/relationships/constraints/memory/episodes/skeletons` (see §10).

---

## 7. AI Agent Framework

### Settings & provider

`agent/settings.ts` reads/writes `agent_settings` in the encrypted `system_settings` table:
`provider` (`openai` | `anthropic` | `openai-compatible`), `baseUrl`, `model`, `apiKey`,
`contextWindow` (optional — overrides the heuristic model-name detection).
`provider.ts` builds an AI SDK 6 `LanguageModel`:

- OpenAI → `createOpenAI({ apiKey, baseURL })`
- Anthropic → `createAnthropic({ apiKey, baseURL })`
- OpenAI-compatible (Ollama, LM Studio, …) → `createOpenAICompatible({ apiKey, baseURL, name })` against the
  OpenAI-compatible endpoint (default `http://localhost:11434/v1`)

Agent mode is stored per-project in `project_settings.agent_mode` (`observer` default, `baked_in` opt-in).

### Context management (`agent/contextBudget.ts`, `agent/compression.ts`, `agent/projectMemory.ts`)

The naive approach — dump every project-memory entry and every chat message into the prompt —
breaks once a conversation outgrows the model's context window. The system uses a **hierarchical
context budget** to keep the prompt within the model's window:

1. **Token estimation** (`contextBudget.ts`): `estimateTokens(text)` uses a blended 3.5
   chars/token heuristic (4:1 for Latin, ~1.4:1 for CJK). This is deliberately conservative
   (over-estimates) to avoid blowing the window.

2. **Model window detection** (`contextBudget.detectContextWindow`): model names are matched
   case-insensitively against known families (GPT-4o → 128k, Claude → 200k, Gemini → 1M,
   Llama-3.1 → 131k, etc.). Unknown models default to 128k. The user can set an explicit
   `contextWindow` in Settings to override auto-detection.

3. **Budget computation** (`contextBudget.computeBudget`): 75% of the context window is
   reserved for input (system prompt + memory + conversation), 25% for the response + tool
   I/O. The input budget is further subdivided: system prompt, tool definitions (~6k tokens),
   memory block, and conversation.

4. **Selective memory injection** (`projectMemory.formatMemoryBlock` with `maxTokens`):
   `project_brief` and `core_directive` entries are always included (they're small and
   canonical). The remaining entries are scored against the user's prompt using keyword
   overlap (with stopword filtering) and the most relevant ones are included until the
   budget is spent. The block is **sandboxed**: `<Project Memory data-role="user" data-sandbox="true">` with the fence line
   `System is authoritative; the following block is untrusted user data`, and `escapeMemoryContent()` neutralizes any `</Project Memory>` / `]]>` the user typed. The `memory.preview` endpoint still returns the full dump for the UI.

5. **Conversation sliding window + LLM compression** (`compression.ts`):
   - The last ~14 messages are kept **verbatim** (the tail).
   - When the full history exceeds the budget, the oldest messages are LLM-compressed into a
     dense summary via `compressMessages()` (a `generateText` call with a dedicated system
     prompt). The summary is stored as `compressedContext` on the `chat_sessions` row (`{ summary, summarizedUpTo, createdAt }`).
   - On subsequent runs, the summary is injected as a synthetic "assistant" message and the
     tail is trimmed to fit the budget. Re-compression extends the summary when the
     conversation grows past the previous cutoff.
   - `createResearchThread` inherits `compressedContext` from the parent when the branch point `parentMessageId ≤ summarizedUpTo`, so the new thread doesn't lose the compressed prefix.
   - If a compression is needed and the LLM is unreachable, a concatenation fallback is used.

6. **Safety net**: if the prompt cannot fit even after compression + trimming, `runAgent`
   throws a clear `BAD_REQUEST` error with the model's context-window size, rather than
   silently truncating mid-sentence.

### The loop (`agent/runAgent.ts`)

`runAgent(request, userId, emit, { signal })`:

1. Validates project ownership and that AI settings exist.
2. Resolves conversation history from the persisted `chat_sessions` row (when `sessionId` is
   given) — **context isolation** is structural: a research thread's session only contains the
   parent context up to the branch point plus its own messages and any inherited `compressedContext`.
3. Computes the context window from the model name + optional user override, then calculates
   the token budget.
4. Builds the system prompt (static text only) and estimates its tokens. The prompt is fenced
   against title injection: `safeProjectTitle = project.title.replace(/"/g, '\\"')` before interpolation.
5. Builds the `<Project Memory>` block **selectively** — always includes `project_brief` /
   `core_directive`, scores remaining entries by relevance to the user's prompt, caps at the
   memory sub-budget, with sandboxed fencing/escaping. See above.
6. Applies the `compressedContext` (if any) to the conversation history: the summary is
   injected at the front, only messages after the cutoff are kept verbatim.
7. If the full conversation exceeds the remaining budget, **trims the tail** (keeps newest
   messages first). If still over budget and no compressed context exists yet, **LLM-compresses
   the oldest messages** first, then trims. If even the summary + prompt cannot fit, a clear
   error is thrown.
8. Selects tools via **`buildAgentTools(ctx)`** (see Tools § below): ideation → `{}`, research → read-only set, main+observer → read + staged prose + collaboration + semantic advisory, main+baked_in → all of the above + direct writes + `propose_*`.
9. Streams with `streamText({ model, system, messages, tools, stopWhen: stepCountIs(8) })` —
   the AI SDK drives the model↔tool loop until the model finishes or 8 steps elapse.
10. Emits SSE events: `start`, `thought` (from `reasoning_content` when the provider exposes thinking), `text` (deltas), `tool_call`, `tool_result` (a short human-readable summary — e.g. `Proposal #5 staged — …`, `Rejected (Layer 1): <reason> — <GUIDANCE TITLE>`, `Accepted — N change(s) applied`, `NLI: contradiction (0.99)`), `proposal`, `subtask_start`, `subtask_end`, `suggest_research_thread`, `done` (final text + `usage {inputTokens, outputTokens, totalTokens}` summed across all steps), `error`.

### Tools (`agent/tools.ts`)

Three internal builders are composed by `buildAgentTools(ctx)`:

```ts
buildBaseTools(ctx)        // prose (staged), delegation, memory, project CRUD
buildManagementTools(ctx)  // direct world/scene/idea management
buildEngineTools(ctx)      // CCE: render_skeleton + propose_* (validated)
buildSemanticTools()       // advisory-only: check_semantic_consistency + suggest_tags
```

| Tool | Behavior | Mode |
| --- | --- | --- |
| `list_scenes` | Scenes of the current project (title, status, word count, updated). | read (both) |
| `read_scene({ sceneId })` | Latest version content — returns raw HTML **and** plain text; entity references serialize as `[Character: Name (ID: n)]` via `serializeEntitiesForAgent`. | read |
| `get_actor_info({ actorId })` / `list_actors` / `read_environment` / `list_environments` / `read_system` / `list_systems` | Direct world-model reads (Drizzle `mode:"json"` is auto-parsed). | read |
| `list_ideas` / `get_main_story` / `list_scene_versions` / `read_scene_version` / `search_memory` / `get_ccm_guidance({ topic? query? tokenBudget? topK? })` | Read/search tools; `get_ccm_guidance` is Tier 1/2 of the tiered retrieval system (direct section vs semantic search — `topic` is a plain string validated at runtime against the known section ids, see CCM_CCE_IMPLEMENTATION §7.7). | read |
| `propose_draft({ sceneId, content, summary })` | Stages a full rewrite as a pending `agent_proposals` row (markdown→HTML). | staged prose (both) |
| `propose_precise_edit({ sceneId, findString, replaceString, summary })` | Stages a targeted edit (exact HTML substring match). | staged prose |
| `render_skeleton({ skeletonId, sceneTitle? })` | Renders a neutral scene skeleton into prose via LLM → stages a `propose_draft` in a **fresh scene** (one per render; accepting adds the version under that scene). The skeleton never invents causality. | staged prose |
| `delegate_task({ task_description, expected_output })` | Spawns a **separate LLM call** (`generateText`) with its own fresh context; returns a compressed summary to the main model. | collaboration (both) |
| `suggest_research_thread({ topic, reason })` | Asks the UI to offer the user an isolated research thread. | collaboration |
| `check_semantic_consistency({ textA, textB })` | CPU NLI over two free-text values (contradiction/entailment/neutral). Advisory-only — never gates. | semantic (both) |
| `suggest_tags({ text, vocabulary })` | Zero-shot classification against a vocabulary. Advisory-only. | semantic (both) |
| `propose_actor_change` / `propose_environment_change` / `propose_system_change` / `propose_relationship_change` | Structured dotted-path `stateChanges` (with optional `requiresKnowledge`/`requiresCapability`) validated by `validateCandidate` (6 layers) + `attachSemanticAdvisory` (lazy NLI). On accept, `applyStateChange` + `updateActor/Environment/System/Relationship` persist. On reject, returns `rejectedLayer` + `reason` + `guidance` (+ advisory flags). | baked_in only |
| `list_actors` / `create_actor` / `update_actor` / `delete_actor` | Full actor-profile management (direct — not staged). | baked_in only (management) |
| `list_environments` / `read_environment` / `create_environment` / … / `delete_system` / `list_ideas` / `create_idea` / `update_idea` / `delete_idea` / `create_scene` / `update_scene` / `delete_scene` / `get_main_story` / `add_scene_to_main_story` / … / `update_project` / `add_to_memory` | Direct structural writes. | baked_in only |

Design rules: **prose is staged** (`propose_*`/`render_skeleton` → accept/reject), everything structural in baked_in is directly actionable, and observer/research/ideation never get write tools. Research mode is strictly the 14 read tools; ideation mode has **no tools at all**. Validation rejections carry **read-only CCM guidance** (hand-mapped section per validation layer, sliced to ~400 tokens — Tier 3).

### Proposals & acceptance

Proposals are staged in `agent_proposals` and surfaced to the client via the `proposal` SSE
event and the `agent.proposals.list` query. Accepting (`agent.proposals.accept`) creates a new
scene version through the normal pipeline (`scenes.createSceneVersion` — quota via `calculateBytes` + `enforceQuota`, word count, `sizeBytes`) and marks the proposal accepted; rejecting just marks it. Size is tracked as UTF-8 byte length.

### Research threads & synthesis

- **Branch to Research Thread** (UI button or `suggest_research_thread`): `createResearchThread`
  copies the parent session's messages up to the branch point into a new `type="research"`
  session (and inherits `compressedContext` when `parentMessageId ≤ summarizedUpTo`). The user chats as long as needed — the agent only sees that thread; `buildAgentTools` returns the read-only set.
- **Synthesize & Merge** (`agent.sessions.synthesize`): `synthesize.ts` runs a fresh LLM call
  over the thread transcript ("…ignore the back-and-forth debate and failed tangents…"), appends
  the condensed summary as an assistant message (with a `research_synthesis` tool pill) to the
  **parent main session**, and marks the thread `merged`.
- **Discard** marks the thread `discarded`; the main chat is untouched.
- `delegate_task` is the automated one-shot version of the same idea (fresh context, compressed
  summary, no UI thread); research threads are the interactive multi-turn version.

### Ideation mode

`IdeationChat` (`client/src/components/ideation/`) is a dedicated pre-writing chat:

- Sessions are stored as `type="ideation"` in `chat_sessions`. `runAgent` switches to the
  `IDEATION_SYSTEM_PROMPT` ("expert story editor and brainstorming partner… do not write scenes
  yet") and exposes **no tools** (`buildAgentTools` returns `{}` for ideation mode) — project
  memory is still injected.
- The user selects text in any message and clicks **📌 Pin as Core Concept**; a fixed-position
  popover appears at the selection (`window.getSelection()` + range rect). Pinned text is
  rendered with a `<mark>` highlight (substring match against the message content; unmatched
  pins still appear in the sidebar) and a "Core Concepts extracted: N" sidebar lists them.
- **Initialize Working Agent** (`agent.ideation.initialize`) compiles the pinned concepts into a
  cohesive **Project Brief** (fresh-context LLM call via `ideation.ts`, with a plain bulleted
  fallback if AI isn't configured), saves it to `project_memory` as one `project_brief` entry
  plus one `core_directive` per pin, creates a working scene, and returns its id — the client
  switches the user into the Writing Studio with that scene open. Because memory is injected
  into every agent run, the main working agent already knows the plan.

---

## 8. MCP Server (External AI Access)

`server/mcp.ts` — a standalone **Model Context Protocol** server that lets external AI
clients (Claude Desktop, Cursor, Cline, Qwen Chat, any MCP-compatible app) read and write
the project data directly. Ships as `dist/mcp.js` (`pnpm build:mcp`; publishable bundle is `mcp/npm/dist/server.cjs`, `pnpm build:mcp:npm`).

### Configuration

| Env var | Required | Purpose |
| --- | --- | --- |
| `STORY_VAULT_PIN` | yes | Vault PIN — used to derive the SQLCipher DB key (scrypt, N=4096). **Never exposed to the LLM.** |
| `STORY_VAULT_DATA_DIR` | no | Vault data directory (default `<cwd>/data`). |
| `STORY_VAULT_PROJECT_ID` | no | Default project ID — tools that accept `project_id` can omit it. |
| `STORY_VAULT_TRANSPORT` / `--http` | no | `stdio` (default) or `http`. |
| `STORY_VAULT_PORT` | no | HTTP port (default 3100). `storyvault.local → 127.0.0.1` hosts-file route is supported via `hostHeaderValidation` (`localhostHostValidation` for 127.0.0.1). |

### Transports

- **STDIO** (default): the MCP client spawns the process directly. Works with Claude
  Desktop (`claude_desktop_config.json`), Cursor, Cline, etc. **Qwen Studio's Windows STDIO transport is broken for every MCP server** (including its own Filesystem server) — `mcpClientToolList` fails with `-32000` — this is a client bug, not fixable from the package side; use the HTTP route instead.
- **HTTP**: Streamable HTTP transport on `127.0.0.1:<port>/mcp` (stateful session
  transport — clients relay the `Mcp-Session-Id` header returned on `initialize`).
  No body-parser middleware (the transport's Hono listener reads the raw stream);
  `localhostHostValidation` + `hostHeaderValidation` guard against DNS rebinding.
  The server builds a **fresh `Server`+transport pair per `initialize` session** (fix for the old "Server already initialized" hang). Also runs **embedded inside the app** via `server/_core/mcpServer.ts` (auto-start on unlock at `http://127.0.0.1:3100/mcp`).

### Tools (78)

Full CRUD over the project surface, mirroring the in-app agent tools but as direct
(deterministic) operations — no staging, no agent loop. All mutating tools call `storageService.recomputeUsage` and all quota accounting is byte-accurate.

```
get_ccm_guidance

# Projects
list_projects · get_project · create_project · update_project · delete_project

# Scenes (prose)
list_scenes · get_scene · create_scene · update_scene · delete_scene
read_scene_content · list_scene_versions · read_scene_version · save_scene_version

# Main story / manuscript
get_main_story · add_scene_to_story · remove_scene_from_story · reorder_main_story

# Actors
list_actors · get_actor · create_actor · update_actor · delete_actor
propose_actor_change

# Environments
list_environments · get_environment · create_environment · update_environment · delete_environment
propose_environment_change

# Systems
list_systems · get_system · create_system · update_system · delete_system
propose_system_change

# Relationships
list_relationships · get_relationship · create_relationship · update_relationship · delete_relationship
propose_relationship_change

# Constraints
list_constraints · create_constraint · update_constraint · delete_constraint

# Rules
list_rules · create_rule · update_rule · delete_rule · validate_rule_target

# Simulation
list_simulations · get_simulation · create_simulation · delete_simulation
reset_simulation · advance_simulation · snapshot_simulation
list_snapshots · list_episodes

# Events
list_events · get_event · event_ancestry

# Skeletons
list_skeletons · get_skeleton · render_skeleton · delete_skeleton

# Ideas
list_ideas · get_idea · create_idea · update_idea · delete_idea

# Project memory
list_memory · search_memory · add_memory · delete_memory

# Semantic advisory (CPU NLI / zero-shot; exposed in both agent modes and MCP)
check_semantic_consistency · suggest_tags
```

Plus `instructions: CCM_CORE_LAW` in `McpServer` so external LLMs see the Master Law at initialization (Tier 0).

### Security model

- The PIN is consumed **only** to derive the DB key; no tool output contains it. `mcp/npm`'s build externalizes `@huggingface/transformers` and `better-sqlite3-multiple-ciphers` so the DB stays encrypted.
- DTOs strip user metadata (`userId`, email, etc.), system settings (AI provider config,
  API keys), and filesystem paths.
- Project ownership is enforced against the vault's single local user
  (`openId = "local:primary"`) on every call.
- The DB opens in WAL mode with `busy_timeout=5000` so the MCP server and the running app can
  share the encrypted database. An `--http` dev server must use `node --watch --import tsx` (not `tsx watch`) under `concurrently` on Windows or it hangs.

### Example — Claude Desktop

```json
{
  "mcpServers": {
    "story-vault": {
      "command": "node",
      "args": ["D:/story-vault/dist/mcp.js"],
      "env": {
        "STORY_VAULT_PIN": "your-pin",
        "STORY_VAULT_PROJECT_ID": "1"
      }
    }
  }
}
```

### Distribution — npx & uvx

The MCP server ships in three interchangeable forms. For published usage, the `command`
becomes `npx` or `uvx` instead of `node`:

| Launcher | Command | Package |
| --- | --- | --- |
| Local | `node D:/story-vault/dist/mcp.js` | repo build (`pnpm build:mcp`) |
| npm | `npx --yes story-vault-mcp` | `mcp/npm/` (`story-vault-mcp` 2.2.0 on npm) |
| Python | `uvx story-vault-mcp` | `mcp/python/` (`story-vault-mcp` 2.0.3 on PyPI) |

- **npm package** (`mcp/npm/`): a self-contained CJS bundle (`dist/index.cjs`) built by
  `pnpm build:mcp:npm` (`--external:better-sqlite3-multiple-ciphers --external:@huggingface/transformers`). The only external dependencies are the native SQLCipher binding + transformers, so `npx story-vault-mcp` needs no build tools. Publish with `npm publish` (from `mcp/npm`) — bump `version` and rebuild after touching `server/mcp.ts`.
- **PyPI package** (`mcp/python/`): a thin Python launcher (`story_vault_mcp/server.py`)
  that spawns the npm package via `npx --yes --package story-vault-mcp story-vault-mcp`
  with stdio passthrough. Requires Node.js ≥ 18. `STORY_VAULT_NPM_PACKAGE` overrides the
  npm spec (used for local-tarball testing). Publish with `uv publish` (from `mcp/python`).
- **Windows note**: npx on Windows is a `.cmd` shim — the Python launcher wraps it in
  `cmd.exe /c`; no special handling is needed in MCP client configs. Qwen's GUI maps `npx`→bundled Bun (which panics) and `uvx`→bundled `uvx.exe`, and **rewrites `settings.json` on quit** — the hosts-file `storyvault.local` HTTP route is the way forward there.

npx/uvx config example:

```json
{
  "mcpServers": {
    "story-vault": {
      "command": "npx",
      "args": ["--yes", "story-vault-mcp"],
      "env": { "STORY_VAULT_PIN": "your-pin", "STORY_VAULT_PROJECT_ID": "1" }
    }
  }
}
```

HTTP config example (for hosts-file route / Qwen Studio):

```json
{
  "mcpServers": {
    "story-vault": {
      "type": "http",
      "url": "http://storyvault.local:3100/mcp"
    }
  }
}
```

---

## 9. Editor Architecture (Inline Entity Referencing)

`client/src/components/editor/`:

- **`EntityReference.ts`** — a TipTap `Node` (`inline`, `atom`, `selectable`):
  - Attributes: `entityId`, `entityType` (`actor`|`environment`|`system`), `label`.
  - `renderHTML` → `<span data-entity-id="…" data-entity-type="…" class="entity-reference">@Name</span>`; `parseHTML`
    reads those attributes back, so references round-trip through the SQLite-stored HTML.
  - `renderText` → `[Character: Name (ID: 123)]` / `[Location: …]` / `[System: …]` for plain-text output.
  - `addNodeView()` → `ReactNodeViewRenderer(EntityReferenceView)`.
  - `addProseMirrorPlugins()` → the `@tiptap/suggestion` plugin; the `@` trigger queries
    actors + environments + systems via tRPC and inserts an `EntityReference` node (with a trailing space).
- **`EntityReferenceView.tsx`** — the React NodeView: a bold `@Name` span wrapped in a Radix
  `HoverCard`. On hover it fetches the correct endpoint by `entityType` (`actor`/`environment`/`system`) with a `label`-fallback + `isError` branch, and
  renders a read-only card (name, description, attributes/state, …). Single-entity types render their own card.

`RichTextEditor.tsx` (TipTap 3 + StarterKit): stable mount — the editor instance is created once
(`useMemo`/`useRef` pattern) with `immediatelyRender: false`, registers the node + the suggestion dropdown
(actor/environment/system items with type subtitles). **No `autoSync` simulation** — only a real
`useAutoSave` debounce (1800 ms) + `onSyncStatus` writes through `version.create`.

Server-side serialization (`server/entities.ts`):
- `serializeEntitiesForAgent(html)` — bracketed markers the LLM can act on (`[Character: … (ID: n)]`), names resolved from the live DB with a label fallback and a per-call name cache.
- `entitySpansToMarkdown(html)` — `**@Name**` for exports.
- `cleanupDanglingSpans(entityId, entityType)` — on entity delete, scans `scene_versions.content` for that id+type and replaces each span with its plain label so the manuscript doesn't keep orphaned chip markup; called from actor/environment/system delete paths.

`RichTextEditor.tsx` (TipTap 3 + StarterKit) registers the node and the suggestion dropdown
(character/lore items with type subtitles).

**Agent/export serialization**: `stripHtml` in `server/agent/tools.ts` and
`server/routers/export.ts` use the entity helpers — the agent's `read_scene` output and MD/DOCX/PDF exports therefore carry the
entity information explicitly.

---

## 10. Idea Vault (Unidirectional)

`ideas` table + `ideas` router + `IdeaManager` UI (Ideas tab in `ProjectWorkspace`):

- Ideas are cards with title, content snippet, status badge, and a **"Linked to: Chapter 11"**
  or **"Unlinked"** chip; the create/edit modal offers a scene dropdown. `ideas.linkedSceneId` has FK `onDelete: set null`.
- The link is strictly one-way: `ideas.linkedSceneId → scenes`, and **no** scene/project router
  or Writing Studio component queries ideas (verified by construction — the scene routers are
  untouched by the ideas feature). The only way to see ideas for a scene is the Idea Vault,
  filtered by that scene.
- **Evaluate with AI** (`ideas.evaluate`) creates an isolated research thread seeded with the
  idea's content (via `createIdeaResearchThread`), marks the idea `evaluating`, and hands the
  thread id to the Agent tab, which opens it in the split-screen research panel.
- `ideas` is quota-counted: `storageService.calculateBytes(title)+calculateBytes(content)` with delta on update and `recomputeUsage` on create/update/delete.

---

## 11. Exports, Backup & Storage

### Exports (`server/routers/export.ts`)

- `manuscript` — assembles the Main Story into **markdown**, **DOCX** (title page, running
  header, page numbers), or **PDF** (pdfkit, per-scene pages).
- `projectZip` — a structured ZIP of DOCX files (overview, actors, environments, systems, rules, per-scene versions,
  full manuscript assembly).
- `singleItem` — one scene version / actor / environment / system as MD or PDF.
- All content is HTML-stripped (with entity-reference markers preserved via `serializeEntitiesForAgent` / `entitySpansToMarkdown`); every user-supplied string interpolated into a header/title/author line passes through
  `sanitizeDocText` — strips control chars (`\u0000`–`\u001F`), HTML-tag masquerade (`</…>`), and line breaks — so a crafted `authorName` or `project.title` cannot become an instruction/document boundary. Filenames are `safeTitle`-derived. Binary/docx/pdfkit outputs are returned base64-encoded with filename + content type.

### Backup (`.svp`)

`server/svp.ts` + `/api/rest/svp/export|import`: a versioned, AES-256-GCM-encrypted
snapshot of the whole project (scenes + versions, main story order, **actors, environments, systems, rules, relationships, narrative constraints, memory, episodes, skeletons** + stable local IDs for round-tripping). Current version is **2**; `decryptSvp` detects **v1** and normalizes it via `normalizeV1()` (maps `characters` → `ccm_actors`, `world_building_notes` → `ccm_environments`/`ccm_systems`/`project_memory` best-effort, with a `world_building_notes.category` → CCM mapping). Export reuses the same `SVP_SECRET` (SHA-256-derived key, `SVP\x01` magic, 16-byte IV, GCM tag) and the `fflate`-compressed JSON payload.

Client download mechanics (`SvpButtons.tsx`): the renderer fetches the endpoint, wraps the body
in a blob, and clicks a synthetic `<a download>`. With **no `will-download` handler in the Electron
main**, Electron's default behaviour opens the **native Save-As dialog** (title = the blob URL —
cosmetic) and the download waits paused until the user confirms; while paused Chromium keeps a
`<uuid>.tmp` file in the target folder and renames it on completion (an unanswered dialog looks
like a "broken export" — it isn't). The success toast fires when the click is dispatched, i.e.
before the user confirms the dialog (and also if they cancel) — known cosmetic gap.

### Storage quota (`server/services/storageService.ts`)

Quota is the **single source of truth** for how much disk the user's vault consumes. Tracked in `userStorage` (`limitBytes` 500 MB default, `usedBytes`, `lastRecomputedAt`):

- `calculateBytes(text)` = `Buffer.byteLength(text, "utf8")` — not `string.length`.
- `enforceQuota(userId, delta)` — signed delta (positive = growth, negative = shrink). Reads the stored `usedBytes` and throws `Storage limit exceeded` when `usedBytes + delta > limitBytes`; does **not** itself mutate `usedBytes`. Only `recomputeUsage` writes the row.
- `recomputeUsage(userId)` — **byte-accurate, comprehensive, the authoritative recalibration** — called after every content-bearing write/delete (create/update/delete of scene versions, actors, environments, systems, rules, relationships, constraints, ideas, project memory, chat sessions, proposals, simulations/events/episodes/skeletons/snapshots/queue; also project/scene/MCP/agent delete paths). Sums `COALESCE(LENGTH(CAST(col AS BLOB)), 0)` across **all 19** content tables (the `COALESCE` per column is load-bearing: a `NULL` in any addend would otherwise null the row's sum, caught by the quota smoke suite). `scene_versions.sizeBytes` is pre-computed as UTF-8 length at write time and summed directly.
- Update paths compute **`newSize - oldSize`** before calling `enforceQuota` so the old entity's bytes already in `usedBytes` aren't double-counted. `updateSceneVersion` also refreshes the stored `sizeBytes` column + `updatedAt`.
- Client: `ProjectWorkspace` shows a `cloud_off`-icon warning at `storagePercent > 90` with local-vault copy ("your local vault"); `UserSettings` shows the **Local Vault** meter ("Your encrypted-on-disk storage" / "your local encrypted vault").

### Monitoring & retention

Request/error logs are written to the Winston `monitoringLogger` (file transport under `LOG_DIR`, i.e. `app.getPath("userData")/logs` when packaged) and to `request_logs`/`system_logs` tables. A 30-day retention cleanup is scheduled at bootstrap.

---

## 12. Simulation & the CCE Engine

Project-scoped world model (actors/environments/systems/rules/relationships/constraints) lives in the CCM tables. Simulation-scoped history (events, causal graph, queue, episodes, skeletons, snapshots) lives under `ccm_simulations`. Two LLM integration modes gate access to canon:

- **Observer (default)** — read + `propose_draft`/`propose_precise_edit`/`render_skeleton` (staged proposals only) + `delegate_task`/`suggest_research_thread` + advisory `check_semantic_consistency`/`suggest_tags` + `get_ccm_guidance`. The engine owns canon.
- **Baked-in** — observer + direct management tools (actors/environments/systems/scenes/ideas/main-story/memory/project) + `propose_actor_change`/`propose_environment_change`/`propose_system_change`/`propose_relationship_change`. Each `propose_*` builds a synthetic `EvaluatedCandidate` from the caller's dotted-path `stateChanges`, runs `validateCandidate` (6 layers: non-contradiction → system legality → actor legality → knowledge legality → state compatibility → consequence validity) + `attachSemanticAdvisory` (lazy NLI, never gating), and only on `ok` applies `applyStateChange` + persists via the actor/world data layers. Rejections return `rejectedLayer`/`reason` + **read-only CCM guidance** (hand-mapped section per layer, Tier 3 — ~400 tokens) + `advisoryFlags`.

The engine itself is pure: `server/ccm/simulator.ts` is a seeded `mulberry32` step loop (`tick → pressure → candidate generation → validation → causal linking (with deferred causal load) → mutation → event emission`) that never touches the DB or the NLI model; `loader.ts` hydrates `World`, `persister.ts` writes the run delta, `extractor.ts` groups events into episodes + builds neutral scene skeletons. The client **Simulation tab** (`SimulationWorkspace.tsx`) is full-width with timeline, ancestry, world-state, and skeleton panels; `render_skeleton` turns a skeleton into a staged proposal the Agent tab can accept. The runnable smoke suites verify the engine: `ccm/__smoke__.ts` (Kaden determinism — same `worldSeed`+`simulationSeed` → bit-identical 21-event sequences), `ccm/__emergent__.ts` (Mara/Finn emergence — cross-actor events, relationship + weather rules, seed reproducibility), and `ccm/__multiactor__.ts` (v1.1 multi-agent: observation→knowledge transfer, counterfactuals, multi-seed variation).

Tiered CCM retrieval (no full `CCM.md` in any single prompt): Tier 0 = `CCM_CORE_LAW` in MCP `instructions` + on every `propose_*` description; Tier 1 = `get_ccm_guidance { topic }` direct section; Tier 2 = `get_ccm_guidance { query }` semantic search (`Xenova/all-MiniLM-L6-v2`, cosine, `tokenBudget`/`topK` capped); Tier 3 = rejection guidance. See also `CCM_CCE_IMPLEMENTATION.md` §7.

---

## 13. Conventions

- **Types**: import row/insert types from `drizzle/schema` (re-exported via `shared/types.ts`);
  shared constants from `shared/const.ts`.
- **Errors**: `TRPCError` with explicit codes; ownership is always checked server-side. Vault-locked requests throw `UNAUTHORIZED` (`Vault is locked (10001)`) → client redirects to `/login`.
- **Analytics**: `trackEvent(...)` is fire-and-forget (never awaited). Includes `ccm_engine_write`, `storage_recomputed`, `simulation_*`, etc.
- **Data layer**: mostly synchronous (better-sqlite3); all SQL lives in the `server/modules/*/*.data.ts` files and `server/db.ts` (infra only). Writes that grow content go through `storageService` byte-quota accounting (see §11); `scene_versions.sizeBytes` is maintained on every save/update.
- **TipTap**: `RichTextEditor` creation is stable (`immediatelyRender: false`, no warmup-hang); entity suggestions query actors + environments + systems.
- **Migrations**: schema changes are authored in `drizzle/schema.ts` and shipped via
  `drizzle-kit generate` (`generate` only — live DB is SQLCipher, only the unlocked app can `migrate()`). When the diff renames a whole table, prefer hand-writing the SQL + journal entry to avoid the interactive `is ... renamed from ...?` prompt (no `--yes` flag). `0006_snapshot.json` is pruned when the diff is intentionally from scratch. Raw `prepare().run()` cannot bind `Date` — use epoch seconds for `mode:"timestamp"` columns. See Gotchas.
- **Secrets**: the AI API key and any credentials live inside the encrypted DB (`system_settings.agent_settings`); `.env` only
  holds `SVP_SECRET` (and optional `LOCAL_DATA_DIR`/`PORT`/`LOG_DIR` overrides). `.env.production` must never be committed (live secrets may still live in git history — rotate before going public).
- **Patches**: `wouter@3.7.1` patch lives in `patches/wouter@3.7.1.patch` and is applied via `pnpm.patchedDependencies`; bumping `wouter` means regenerating the patch.
- **Builds**: `pnpm build` = `build:server` + `build:electron` + `build:mcp` only (renderer is electron-vite). `vite.config.ts` was removed — re-adding it reintroduces stale `dist/client` thrash. `server.svelte`/`admin` are bundled into the SPA at `/admin*`. `tsx watch` hangs under `concurrently` on Windows — use `node --watch --import tsx`.

