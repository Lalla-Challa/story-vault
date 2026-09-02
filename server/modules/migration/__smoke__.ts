/**
 * Migration smoke test — Phase A verification.
 *
 * Creates a scratch SQLCipher vault, applies all drizzle migrations (0000–0006),
 * seeds legacy `characters` / `world_building_notes` rows, then runs the runtime
 * `migrateLegacyEntities` step and asserts:
 *   - ccm_actors / ccm_environments / ccm_systems exist (from 0006)
 *   - legacy rows were copied into the world model with fields folded
 *   - legacy tables are dropped afterwards
 *
 * Run with:  LOCAL_DATA_DIR=<scratch dir> node --import tsx server/modules/migration/__smoke__.ts
 * The env var must be set BEFORE this module loads (db.ts resolves ENV at import).
 */
import fs from "node:fs";
import path from "node:path";
import { openLocalDb, runMigrations, getRawDb, closeLocalDb, ensureLocalUser } from "../../db";
import { migrateLegacyEntities } from "./legacy";

const scratch = process.env.LOCAL_DATA_DIR;
if (!scratch) throw new Error("LOCAL_DATA_DIR must be set to a scratch directory");
fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(scratch, { recursive: true });

const KEY = "a".repeat(64); // fixed 32-byte hex key for the scratch DB

let failures = 0;
function assert(cond: boolean, label: string): void {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label}`); failures++; }
}

openLocalDb(KEY);
runMigrations();
ensureLocalUser();

const raw = getRawDb()!;

// 1. Post-migration schema state
console.log("After runMigrations:");
const tables = raw
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((r: any) => r.name);
assert(tables.includes("ccm_actors"), "ccm_actors table exists");
assert(tables.includes("ccm_environments"), "ccm_environments table exists");
assert(tables.includes("ccm_simulations"), "ccm_simulations table exists");
assert(tables.includes("characters"), "legacy characters table still present (data not yet migrated)");
assert(tables.includes("world_building_notes"), "legacy world_building_notes table still present");
const specCol = raw.prepare("PRAGMA table_info(projects)").all().some((c: any) => c.name === "spec");
assert(specCol, "projects.spec column added");

// 2. Seed legacy data (simulating an old vault that had content)
console.log("Seeding legacy data:");
const projId = Number(
  raw.prepare("INSERT INTO projects (userId, title, description) VALUES (?, ?, ?)").run(1, "Smoke Project", "desc").lastInsertRowid
);
raw
  .prepare(
    `INSERT INTO characters (projectId, name, age, description, abilities, relationships, notes, customAttributes)
     VALUES (?, 'Kaden', '18', 'A guarded teen', 'fast runner', 'knows no one', 'avoid hills', '{"hair":"dark"}')`
  )
  .run(projId);
raw
  .prepare(`INSERT INTO world_building_notes (projectId, category, title, content) VALUES (?, 'location', 'Hospital', 'A busy cardiology ward')`)
  .run(projId);
raw
  .prepare(`INSERT INTO world_building_notes (projectId, category, title, content) VALUES (?, 'magic_system', 'Ink Magic', 'Words become real when written in ink')`)
  .run(projId);
raw
  .prepare(`INSERT INTO world_building_notes (projectId, category, title, content) VALUES (?, 'lore', 'Old War', 'A decade-old war shaped the city')`)
  .run(projId);
console.log("  ✓ seeded characters + 3 world notes");

// 3. Run the runtime legacy migration
console.log("Running migrateLegacyEntities:");
const summary = migrateLegacyEntities();
console.log("  summary:", JSON.stringify(summary));
assert(summary.actors === 1, "1 actor migrated");
assert(summary.environments === 1, "1 environment migrated (location)");
assert(summary.systems === 1, "1 system migrated (magic_system)");
assert(summary.memory === 1, "1 memory entry migrated (lore)");

// 4. Verify folded fields (JSON columns come back as text from the raw driver)
const parse = (s: unknown): any => (typeof s === "string" ? JSON.parse(s) : s);
const actor = raw.prepare("SELECT * FROM ccm_actors WHERE projectId = ?").get(projId) as any;
const actorAttrs = parse(actor.attributes);
const actorGoals = parse(actor.goals);
const actorDrives = parse(actor.drives);
assert(actor !== undefined, "actor row exists");
assert(actorAttrs.age === "18", "attributes.age folded");
assert(actorAttrs.abilities === "fast runner", "attributes.abilities folded");
assert(actorAttrs.custom && actorAttrs.custom.hair === "dark", "customAttributes folded into attributes.custom");
assert(actor.description === "A guarded teen", "description column kept");
assert(actor.notes === "avoid hills", "notes column kept");
assert(Array.isArray(actorDrives) && actorDrives.length === 0, "drives defaulted to []");
assert(actorGoals && Array.isArray(actorGoals.survival), "goals defaulted with layered structure");

const env = raw.prepare("SELECT * FROM ccm_environments WHERE projectId = ?").get(projId) as any;
assert(env !== undefined && env.type === "location", "environment migrated as location type");

const sys = raw.prepare("SELECT * FROM ccm_systems WHERE projectId = ?").get(projId) as any;
assert(sys !== undefined && sys.type === "magic_system", "system migrated as magic_system type");

const mem = raw.prepare("SELECT * FROM project_memory WHERE projectId = ?").all(projId) as any[];
assert(mem.some((m) => m.content === "A decade-old war shaped the city"), "lore note became project_memory");

// 5. Legacy tables dropped
const tablesAfter = raw
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((r: any) => r.name);
assert(!tablesAfter.includes("characters"), "characters table dropped");
assert(!tablesAfter.includes("world_building_notes"), "world_building_notes table dropped");

// 6. Idempotency — running again is a no-op
const second = migrateLegacyEntities();
assert(second.actors === 0 && second.environments === 0 && second.systems === 0, "second run is a no-op (idempotent)");

closeLocalDb();
console.log(failures === 0 ? "\nALL MIGRATION CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
