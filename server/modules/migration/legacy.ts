import { getRawDb } from "../../db";

/**
 * Runtime legacy migration — runs once at vault unlock after SQL migrations.
 *
 * The CCM core refactor replaced the flat `characters` and `world_building_notes`
 * tables with the project-scoped world model (ccm_actors / ccm_environments /
 * ccm_systems / project_memory). We deliberately do NOT drop those tables in
 * the SQL migration: their data must be copied out here first, and the entity-
 * reference HTML embedded in existing scene versions must be re-pointed at the
 * new entity vocabulary. Afterwards the legacy tables are dropped.
 *
 * Idempotent: checks table existence; safe to run on a fresh vault (tables
 * never existed → no-op) and on a partially-migrated one.
 */

const LEGACY_CHARACTERS = "characters";
const LEGACY_NOTES = "world_building_notes";

/** Default JSON value for a new actor's required CCM columns. */
function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
function actorDefaults() {  return {
    type: "human",
    attributes: {},
    state: {},
    goals: { survival: [], functional: [], social: [], emotional: [], longTerm: [], narrative: [] },
    drives: [],
    beliefs: { known: [], believed: [], uncertain: [], misconceptions: [] },
    knowledge: [],
    capabilities: [],
    constraints: [],
    resources: {},
    habits: [],
    plans: [],
  };
}

/** Rewrite legacy entity-reference spans in stored scene HTML. */
function rewriteEntitySpans(html: string, charIdToActorId: Map<number, number>, noteIdToType: Map<number, string>): string {
  return html.replace(
    /<span([^>]*data-entity-id="(\d+)"[^>]*data-entity-type="(character|lore)"[^>]*)>([\s\S]*?)<\/span>/g,
    (match, attrs: string, idStr: string, kind: string, label: string) => {
      const id = Number(idStr);
      if (kind === "character") {
        const actorId = charIdToActorId.get(id);
        if (actorId === undefined) return label; // orphaned → plain text
        return `<span data-entity-id="${actorId}" data-entity-type="actor">${label}</span>`;
      }
      // lore → maps to environment or system depending on the original category
      const newType = noteIdToType.get(id);
      if (!newType) return label; // became project_memory or orphaned → plain text
      return `<span data-entity-id="${id}" data-entity-type="${newType}">${label}</span>`;
    }
  );
}

/**
 * Migrate legacy character + world-building rows into the CCM world model.
 * Returns a short summary of what was migrated (for logs).
 */
export function migrateLegacyEntities(): { actors: number; environments: number; systems: number; memory: number } {
  const raw = getRawDb();
  if (!raw) return { actors: 0, environments: 0, systems: 0, memory: 0 };

  const hasTable = (name: string): boolean => {
    const row = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name);
    return Boolean(row);
  };

  const hasCharacters = hasTable(LEGACY_CHARACTERS);
  const hasNotes = hasTable(LEGACY_NOTES);
  if (!hasCharacters && !hasNotes) {
    return { actors: 0, environments: 0, systems: 0, memory: 0 };
  }

  const summary = { actors: 0, environments: 0, systems: 0, memory: 0 };
  const charIdToActorId = new Map<number, number>();
  const noteIdToType = new Map<number, string>();

  const tx = raw.transaction(() => {
    // ── 1) characters → ccm_actors ───────────────────────────────────────
    if (hasCharacters) {
      const chars = raw.prepare("SELECT * FROM characters").all() as Array<Record<string, unknown>>;
      const insertActor = raw.prepare(`
        INSERT INTO ccm_actors
          (projectId, name, type, description, notes, attributes, state, goals, drives,
           beliefs, knowledge, capabilities, constraints, resources, habits, plans,
           createdAt, updatedAt)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of chars) {
        const defaults = actorDefaults();
        const attributes = { ...(defaults.attributes as Record<string, unknown>) };
        if (c.age != null) attributes.age = c.age;
        if (c.abilities != null) attributes.abilities = c.abilities;
        if (c.customAttributes != null) {
          const raw = c.customAttributes;
          attributes.custom = typeof raw === "string" ? tryParse(raw) : raw;
        }

        const result = insertActor.run(
          c.projectId as number,
          c.name as string,
          defaults.type,
          c.description ?? null,
          c.notes ?? null,
          JSON.stringify(attributes),
          JSON.stringify(defaults.state),
          JSON.stringify(defaults.goals),
          JSON.stringify(defaults.drives),
          JSON.stringify(defaults.beliefs),
          JSON.stringify(defaults.knowledge),
          JSON.stringify(defaults.capabilities),
          JSON.stringify(defaults.constraints),
          JSON.stringify(defaults.resources),
          JSON.stringify(defaults.habits),
          JSON.stringify(defaults.plans),
          c.createdAt as number,
          c.updatedAt as number
        );
        charIdToActorId.set(c.id as number, Number(result.lastInsertRowid));
        summary.actors++;
      }
    }

    // ── 2) world_building_notes → environments / systems / project_memory ──
    if (hasNotes) {
      const notes = raw.prepare("SELECT * FROM world_building_notes").all() as Array<Record<string, unknown>>;
      const insertEnv = raw.prepare(`
        INSERT INTO ccm_environments
          (projectId, name, type, attributes, state, resources, inhabitants,
           accessibility, activeProcesses, constraints, createdAt, updatedAt)
        VALUES (?, ?, 'location', ?, '{}', '{}', '[]', '{}', '[]', '[]', ?, ?)
      `);
      const insertSystem = raw.prepare(`
        INSERT INTO ccm_systems
          (projectId, name, type, rules, constraints, activeConditions, effects, exceptions, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, '[]', '[]', '[]', '[]', ?, ?)
      `);
      const insertMemory = raw.prepare(`
        INSERT INTO project_memory (projectId, category, content, createdAt)
        VALUES (?, ?, ?, ?)
      `);

      for (const n of notes) {
        const category = String(n.category ?? "other");
        const content = (n.content as string) ?? "";
        if (category === "location") {
          insertEnv.run(
            n.projectId as number,
            n.title as string,
            JSON.stringify({ content }),
            n.createdAt as number,
            n.updatedAt as number
          );
          noteIdToType.set(n.id as number, "environment");
          summary.environments++;
        } else if (category === "magic_system" || category === "faction") {
          const type = category === "magic_system" ? "magic_system" : "faction";
          insertSystem.run(
            n.projectId as number,
            n.title as string,
            type,
            JSON.stringify([content]),
            n.createdAt as number,
            n.updatedAt as number
          );
          noteIdToType.set(n.id as number, "system");
          summary.systems++;
        } else {
          // lore / other → project_memory (canon facts & hypotheses)
          const memCategory = category === "other" ? "hypothesis" : "fact";
          insertMemory.run(n.projectId as number, memCategory, content, n.createdAt as number);
          summary.memory++;
        }
      }
    }

    // ── 3) re-point entity-reference spans in existing scene content ──────
    if (hasCharacters || hasNotes) {
      const versions = raw.prepare("SELECT id, content FROM scene_versions").all() as Array<{ id: number; content: string }>;
      const updateVersion = raw.prepare("UPDATE scene_versions SET content = ? WHERE id = ?");
      for (const v of versions) {
        const rewritten = rewriteEntitySpans(v.content ?? "", charIdToActorId, noteIdToType);
        if (rewritten !== v.content) {
          updateVersion.run(rewritten, v.id);
        }
      }
    }

    // ── 4) drop legacy tables ────────────────────────────────────────────
    if (hasNotes) raw.exec("DROP TABLE IF EXISTS world_building_notes");
    if (hasCharacters) raw.exec("DROP TABLE IF EXISTS characters");
  });

  tx();
  return summary;
}
