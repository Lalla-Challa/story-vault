import * as db from "./db";

/**
 * Server-side serialization helpers for the `entityReference` TipTap node.
 *
 * The node serializes to:
 *   <span data-entity-id="123" data-entity-type="actor" class="entity-reference">@John Doe</span>
 *
 * Entity types follow the CCM world model: actor | environment | system.
 * (Legacy `character` / `lore` spans are rewritten to these types by the
 * runtime legacy migration, so old stored HTML keeps resolving.)
 */

const ENTITY_SPAN_RE = /<span\b([^>]*data-entity-id="(\d+)"[^>]*)>([\s\S]*?)<\/span>/gi;
const ENTITY_TYPE_RE = /data-entity-type="(actor|environment|system|character|lore)"/i;

/**
 * Neutralizes text that will be interpolated into an LLM prompt/context.
 * Strips control characters and turns angle brackets into entities so a
 * stored `<script>` or `</Project Memory>` string becomes inert literal
 * text instead of markup the model could interpret as instructions.
 * This is the same defense the `<Project Memory>` sandbox uses.
 */
export function escapeLlmText(text: string): string {
  return (text ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n/g, " ")
    .trim();
}

/** Fences multiline untrusted content (e.g. scene prose) for LLM consumption. */
export function fenceLlmContent(text: string): string {
  return `<scene data-role="user" data-sandbox="true">\n${text}\n</scene>`;
}

function entityLabel(inner: string): string {
  return (inner ?? "").replace(/^@/, "").trim();
}

const TYPE_LABEL: Record<string, string> = {
  actor: "Character",
  environment: "Location",
  system: "System",
  character: "Character", // legacy → actor
  lore: "Lore", // legacy → treated as unknown label
};

/**
 * Converts entity-reference spans into bracketed markers the LLM can act on,
 * e.g. `[Character: John Doe (ID: 123)]`. Names are resolved from the
 * database (current state), falling back to the stored label.
 */
export function serializeEntitiesForAgent(html: string): string {
  const nameCache = new Map<string, string>();

  const resolve = (type: string, id: string): string | null => {
    const key = `${type}:${id}`;
    if (nameCache.has(key)) {
      const cached = nameCache.get(key);
      return cached ? cached : null;
    }
    let name: string | null | undefined;
    if (type === "actor" || type === "character") {
      name = db.getActorById(Number(id))?.name;
    } else if (type === "environment") {
      name = db.getEnvironmentById(Number(id))?.name;
    } else if (type === "system") {
      name = db.getSystemById(Number(id))?.name;
    } else {
      name = null; // legacy lore spans have no world-model home
    }
    nameCache.set(key, name ?? "");
    return name ?? null;
  };

  return html.replace(ENTITY_SPAN_RE, (match, attrs: string, id: string, inner: string) => {
    const typeMatch = ENTITY_TYPE_RE.exec(attrs);
    const type = typeMatch?.[1];
    if (!type) return match;
    const current = resolve(type, id);
    const label = entityLabel(inner);
    const display = escapeLlmText(current || label || "Unknown");
    const prefix = TYPE_LABEL[type] ?? "Entity";
    return `[${prefix}: ${display} (ID: ${id})]`;
  });
}

/**
 * Converts entity-reference spans into bold markdown for exports:
 * `**@John Doe**`. Non-entity HTML is left untouched (callers strip it after).
 */
export function entitySpansToMarkdown(html: string): string {
  return html.replace(ENTITY_SPAN_RE, (_match, _attrs, _id, inner) => {
    const label = escapeLlmText(entityLabel(inner));
    return label ? `**@${label}**` : "";
  });
}

/**
 * Best-effort cleanup: replace dangling entity spans for a deleted entity id
 * with their plain label (e.g. `@Kaden`) so AI context and exports don't show
 * an orphaned reference. Called from entity delete paths.
 */
export function cleanupDanglingSpans(entityId: string, entityType: string): void {
  try {
    const rawDb = db.getRawDb();
    if (!rawDb) return;
    const needle = `data-entity-id="${entityId}"`;
    const typeNeedle = `data-entity-type="${entityType}"`;
    const versions = rawDb
      .prepare("SELECT id, content FROM scene_versions WHERE content LIKE ? AND content LIKE ?")
      .all(`%${needle}%`, `%${typeNeedle}%`) as { id: number; content: string }[];
    if (versions.length === 0) return;
    const update = rawDb.prepare("UPDATE scene_versions SET content = ? WHERE id = ?");
    const spanFor = new RegExp(
      `<span[^>]*data-entity-id="${entityId}"[^>]*data-entity-type="${entityType}"[^>]*>([\\s\\S]*?)<\\/span>`,
      "gi"
    );
    for (const v of versions) {
      if (!v.content.includes(needle)) continue;
      const cleaned = v.content.replace(spanFor, (_m: string, inner: string) => entityLabel(String(inner ?? "")) || `@deleted`);
      if (cleaned !== v.content) update.run(cleaned, v.id);
    }
  } catch {
    // best-effort — never block the delete flow
  }
}