# Story Vault

**Story Vault is a local-first, professional writing workspace** — a "Git for stories" with an
AI writing partner and a deterministic story-simulation engine (CCE) built in. All your work lives on your machine, encrypted with a PIN you control. Scenes carry git-style version histories, a project-scoped world model (actors/environments/systems/rules/relationships/constraints) drives causally coherent story generation, and an agentic AI helps you draft, revise, and explore ideas without ever writing canon until you say so.

---

## Key Features

- **Local-first & encrypted** — Everything is stored in a local SQLCipher-encrypted SQLite
  database, gated by a PIN you choose on first launch. No accounts, no cloud, no telemetry. The database file lives under Electron `userData/data` (auto-detected and migrated when you change machines).
- **CCM/CCE world model & simulation** — The app's core is the **Causal Continuity Model (CCM)** and its executable engine (**CCE**): a 6-layer validation pipeline, a seeded pressure-driven run loop, and a story extractor that turns raw events into episodes and scene skeletons. See [CCM.md](CCM.md) for the framework and [CCM_CCE_IMPLEMENTATION.md](CCM_CCE_IMPLEMENTATION.md) for how it's wired.
- **Two LLM modes** — **Observer** (default, read-only + staged prose — the engine owns canon and the LLM only reads or renders what the user accepts) vs **Baked-in** (the LLM can `propose_*` structured state changes that must pass the engine's validation before writing canon). Mode is per-project, stored in `project_settings.agent_mode`.
- **AI agentic writing partner** — A full agent loop (tool calling, SSE streaming) that can read scenes, propose drafts, and suggest precise edits. Proposals are staged — you **Accept** or **Reject** them; nothing is written to the manuscript automatically. Research threads branch from any message, run their own context, then **Synthesize & Merge** back into the main chat. Long conversations are budgeted into the model's window with selective `project_brief`/`core_directive`-first memory injection and LLM-compressed sliding-window chat history (see [ARCHITECTURE.md](ARCHITECTURE.md) §7).
- **Ideation mode** — A dedicated brainstorming chat (AI as sounding board, no tools). Select any line of text and pin it as a **Core Concept**; **Initialize Working Agent** compiles the pins into a Project Brief + `core_directive` entries, creates a working scene, and the brief is already injected into the main agent's context.
- **Simulation tab** — Advance/causal-ancestor inspection, world-state panels, episode & skeleton views, "Render with AI" (LLM renders a neutral skeleton into prose → the result is staged as a proposal). Snapshots let you branch simulations.
- **Inline entity referencing (TipTap)** — Type `@` to insert actors, environments, or systems as bold inline references. Hover to see the full entity profile — no tab switching. Dangling spans are cleaned on entity delete.
- **Unidirectional Idea Vault** — Dump sudden plot ideas into a sandbox, optionally link them to a scene, and evaluate them with the AI in a research thread. Ideas never appear in your manuscript; the Writing Studio has no idea they exist.
- **Export & backup** — Manuscripts and single items export to **Markdown, DOCX, and PDF** (via `docx` + `pdfkit`), projects back up to an encrypted portable **.svp** file (AES-256-GCM, v2 — with a v1 import path), or bulk backup as a ZIP of DOCX files. Text interpolated into export headers is sanitized to prevent prompt injection (author + title stripping).
- **External AI access (MCP)** — The whole vault is reachable from Claude Desktop, Cursor, Qwen Chat, etc. via **MCP** over STDIO or HTTPS, including tiered CCM retrieval and advisory-only semantic tools (`check_semantic_consistency`, `suggest_tags`). Ships three ways: repo build, `npx story-vault-mcp`, and `uvx story-vault-mcp` (PyPI thin launcher over npx).

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 33, electron-vite 4 (main/preload bundling) |
| UI | React 19, wouter 3.7.1 (patched), Vite 7, Tailwind CSS 4, Radix UI (shadcn-style) |
| Editor | TipTap 3 (ProseMirror) with a custom `EntityReference` node |
| Backend | Node.js + Express 4, tRPC 11 (superjson), TanStack Query 5 on the client |
| Data | SQLite via `better-sqlite3-multiple-ciphers` (SQLCipher N-API prebuilts), Drizzle ORM 0.44 (sync driver) |
| AI | Vercel AI SDK 6 (`ai` + `@ai-sdk/openai-compatible`, etc.) — OpenAI / Anthropic / any OpenAI-compatible endpoint |
| Engine semantics | `@huggingface/transformers` + `Xenova/all-MiniLM-L6-v2` (retrieval) & `Xenova/nli-deberta-v3-small` (advisory NLI, lazy ONNX singleton) |
| Export | `docx`, `pdfkit`, `jszip`, `fflate`, `.svp` (AES-256-GCM, `node:crypto`) |

## Getting Started

### Prerequisites

- **Node.js** ≥ 22
- **pnpm** ≥ 10

### Install

```bash
pnpm install
```

The SQLCipher SQLite modules are shipped as **prebuilt N-API binaries** (one per platform
under each package's `prebuilds/` folder). N-API is ABI-stable across Node and Electron, so the
same binaries work in both the dev server and the Electron app — **no source rebuild is
required** (the `postinstall` hook also runs `electron-rebuild -f` as a safety net).

### Run

```bash
pnpm dev
```

This starts two things concurrently:
- the local Express/tRPC server with the endpoint(s) `POST /api/agent/run` (SSE) + `/api/rest/*` + `/api/trpc/*` + MCP at `/mcp` (stateful, local-only, host-header-gated),
- and the **Electron** window against them.

In **development**, `electron-vite dev` serves the renderer and the app's server is a plain Express server (no bundled-into-main indirection); Electron's renderer proxies `/api` to `http://localhost:3000`. In **production** the renderer is the packaged static SPA under `dist/client` and Electron boots its own server in-process via `server/_core/bootstrap`. See [ARCHITECTURE.md](ARCHITECTURE.md) §3 for the topology gotcha (the dev path is deliberately decoupled — do not re-add a Vite middleware into the API server).

On first launch you'll be asked to create a **PIN** — this derives the key that encrypts your local database (scrypt, N=4096, `changePin` is atomic with a rekey-verify loop). That PIN is the only way to unlock your vault; keep it safe.

### Build & start

```bash
pnpm build              # server bundle + Electron (renderer included) + MCP
pnpm build:server       # Node ESM bundle → dist/
pnpm build:electron     # main (esm) + preload (cjs) + renderer (dist/client)
pnpm build:mcp          # MCP ESM bundle → dist/mcp.js
pnpm build:mcp:npm      # publishable CJS bundle → mcp/npm/dist/server.cjs
pnpm build:ccm-index    # embed CCM sections with Xenova/all-MiniLM-L6-v2 → server/ccm/ccm-index.json
pnpm start              # run the server bundle standalone (no Electron shell)
pnpm start:electron     # launch Electron (main loads http://127.0.0.1:<port>)
```

Client output from the Electron build and the server bundles **must not thrash each other** — the renderer is only built by `electron.vite.config.ts` (into `dist/client`), not by a second `vite.config.ts` (that file has been removed; do not re-add it). `check` (`tsc --noEmit`) and the engine smoke suites (see Repo Hygiene) should be run before submitting.

### Other scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev:server` | Run just the Express dev server (`node --watch --import tsx server/_core/index.ts`) |
| `pnpm dev:electron` | Launch Electron against a running dev server |
| `pnpm check` | Type-check the whole project (`tsc --noEmit`) |
| `pnpm db:generate` | Generate the next Drizzle SQLite migration (hand-write when rename detection is involved) |
| `pnpm test:ccm-guidance` | Smoke-test `server/ccm/guidance.ts` retrieval |
| `pnpm dist` / `pnpm pack` | electron-builder packaged installer |

Migrations are `0000` → `0007` (eight entries including 0006 CCM core + 0007 missing-indexes). The journal lives in `drizzle/meta/_journal.json`.

## Configuration

Configuration lives in `.env` at the repo root (see `.env`/`env.ts` for defaults):

- `SVP_SECRET` — secret used to encrypt `.svp` project backup files.
- `LOCAL_DATA_DIR` — optional override for the data directory (defaults to Electron
  `app.getPath('userData')/data` in packaged builds, or `./data` in plain Node).
- `PORT`, `LOG_DIR` — overrides for the server's listen port and log directory. In Electron `LOG_DIR` defaults to `app.getPath('userData')/logs`; `getLogDir()` must use the `createRequire("electron")` trick to avoid Vite importing `electron`.

AI provider credentials (API key, base URL, model) are **not** stored in `.env` — they are
entered in the app's **Agent Settings** panel and stored encrypted inside your vault (`system_settings` row `agent_settings`; never returned to the client — only `hasApiKey` is exposed).

## Documentation

- **[GUIDE.md](GUIDE.md)** — **start here**: every feature in the app explained, plus the 15-minute quick path and external-client setup.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the single source of truth for how the application
  is structured: runtime topology, data model, auth, the AI agent framework, MCP, the editor, Idea Vault, and exports.
- **[CCM.md](CCM.md)** — the Causal Continuity Model framework (the theory).
- **[CCM_CCE_IMPLEMENTATION.md](CCM_CCE_IMPLEMENTATION.md)** — how the framework became code (Phases A–C, engine internals, current reality & caveats).
- **[docs/HARBOR_LIGHTS_DEMO.md](docs/HARBOR_LIGHTS_DEMO.md)** — the pre-seeded demo world used in live walkthroughs.

## Repo Hygiene

- `data/` (the live vault), `data-backup-*/` (manual vault backups), `logs/`, `dist/`, `out/`, and `.zcode/` are gitignored — user data never leaves the machine.
- Before submitting: `pnpm check` plus the engine smoke suites (`npx tsx server/ccm/__smoke__.ts`, `npx tsx server/ccm/__emergent__.ts`, `npx tsx server/ccm/__multiactor__.ts` — each needs a scratch `LOCAL_DATA_DIR` env var and exits non-zero on failure).

## License

MIT
