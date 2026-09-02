import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// ─── SVP snapshot schema (v2) ────────────────────────────────────────────────
// This is the full in-memory representation of a .svp file after decryption.
// v2 reflects the CCM world model: characters → actors, world notes →
// environments / systems / rules / memory.

export interface SvpVersion {
  /** Stable local ID used only to link mainStory entries during import */
  localId: number;
  versionLabel: "draft" | "revised" | "final";
  content: string;
  createdAt: string; // ISO string
}

export interface SvpScene {
  localId: number;
  title: string;
  description: string | null;
  createdAt: string;
  versions: SvpVersion[];
}

export interface SvpMainStoryEntry {
  /** References SvpScene.localId */
  sceneLocalId: number;
  /** References SvpVersion.localId */
  versionLocalId: number;
  order: number;
}

export interface SvpActor {
  name: string;
  type: string;
  description: string | null;
  notes: string | null;
  attributes: Record<string, unknown>;
  state: Record<string, unknown>;
  goals: Record<string, string[]>;
  drives: string[];
  beliefs: Record<string, string[]>;
  knowledge: string[];
  capabilities: string[];
  constraints: string[];
  resources: Record<string, unknown>;
  habits: string[];
  plans: string[];
}

export interface SvpEnvironment {
  name: string;
  type: string;
  attributes: Record<string, unknown>;
  state: Record<string, unknown>;
  resources: Record<string, unknown>;
  inhabitants: string[];
  accessibility: Record<string, unknown>;
  activeProcesses: string[];
  constraints: string[];
}

export interface SvpSystem {
  name: string;
  type: string;
  rules: string[];
  constraints: string[];
  activeConditions: string[];
  effects: string[];
  exceptions: string[];
}

export interface SvpRule {
  name: string;
  family: string;
  when: Record<string, unknown>;
  candidateEvents: Array<Record<string, unknown>>;
  effects: Array<Record<string, unknown>>;
  priority: number;
  probability: number;
  cooldown: number;
  scope: string;
  enabled: boolean;
}

export interface SvpMemoryEntry {
  category: "rule" | "fact" | "hypothesis" | "project_brief" | "core_directive";
  content: string;
}

export interface SvpSnapshotV2 {
  svpVersion: 2;
  exportedAt: string; // ISO string
  project: {
    title: string;
    description: string | null;
    spec: Record<string, unknown> | null;
  };
  scenes: SvpScene[];
  mainStory: SvpMainStoryEntry[];
  actors: SvpActor[];
  environments: SvpEnvironment[];
  systems: SvpSystem[];
  rules: SvpRule[];
  memory: SvpMemoryEntry[];
}

// Legacy v1 snapshot shape (characters + worldNotes) — kept so old .svp files
// remain importable. It is normalized into SvpSnapshotV2 on read.
interface SvpSnapshotV1 {
  svpVersion: 1;
  exportedAt: string;
  project: { title: string; description: string | null };
  scenes: SvpScene[];
  mainStory: SvpMainStoryEntry[];
  characters: Array<{
    name: string;
    age: string | null;
    description: string | null;
    abilities: string | null;
    relationships: string | null;
    notes: string | null;
  }>;
  worldNotes: Array<{
    category: "lore" | "location" | "magic_system" | "faction" | "other";
    title: string;
    content: string;
  }>;
}

export type SvpSnapshot = SvpSnapshotV2;

// ─── Binary layout ────────────────────────────────────────────────────────────
// [ 4 bytes magic "SVP\x01" ][ 16 bytes IV ][ 16 bytes GCM auth tag ][ N bytes ciphertext ]

const MAGIC = Buffer.from("SVP\x01");
const IV_LEN = 16;
const TAG_LEN = 16;

function deriveKey(secret: string): Buffer {
  // SHA-256 of the secret gives us a stable 32-byte AES-256 key
  return createHash("sha256").update(secret).digest();
}

export function encryptSvp(snapshot: SvpSnapshot, secret: string): Buffer {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(snapshot);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, encrypted]);
}

/** Normalize a legacy v1 snapshot into the v2 world-model shape. */
function normalizeV1(v1: SvpSnapshotV1): SvpSnapshotV2 {
  const actors: SvpActor[] = v1.characters.map((c) => {
    const attributes: Record<string, unknown> = {};
    if (c.age != null) attributes.age = c.age;
    if (c.abilities != null) attributes.abilities = c.abilities;
    return {
      name: c.name,
      type: "human",
      description: c.description,
      notes: c.notes,
      attributes,
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
  });

  const environments: SvpEnvironment[] = [];
  const systems: SvpSystem[] = [];
  const memory: SvpMemoryEntry[] = [];

  for (const n of v1.worldNotes) {
    if (n.category === "location") {
      environments.push({
        name: n.title,
        type: "location",
        attributes: { content: n.content },
        state: {},
        resources: {},
        inhabitants: [],
        accessibility: {},
        activeProcesses: [],
        constraints: [],
      });
    } else if (n.category === "magic_system" || n.category === "faction") {
      systems.push({
        name: n.title,
        type: n.category,
        rules: [n.content],
        constraints: [],
        activeConditions: [],
        effects: [],
        exceptions: [],
      });
    } else {
      memory.push({
        category: n.category === "other" ? "hypothesis" : "fact",
        content: n.content,
      });
    }
  }

  return {
    svpVersion: 2,
    exportedAt: v1.exportedAt,
    project: { title: v1.project.title, description: v1.project.description, spec: null },
    scenes: v1.scenes,
    mainStory: v1.mainStory,
    actors,
    environments,
    systems,
    rules: [],
    memory,
  };
}

export function decryptSvp(data: Buffer, secret: string): SvpSnapshot {
  // Validate magic header
  if (data.length < MAGIC.length + IV_LEN + TAG_LEN) {
    throw new Error("Invalid .svp file: too short");
  }
  const magic = data.subarray(0, MAGIC.length);
  if (!magic.equals(MAGIC)) {
    throw new Error("Invalid .svp file: unrecognized format or wrong application");
  }

  const key = deriveKey(secret);
  const iv = data.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = data.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN);
  const ciphertext = data.subarray(MAGIC.length + IV_LEN + TAG_LEN);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let plaintext: string;
  try {
    plaintext = decipher.update(ciphertext) + decipher.final("utf8");
  } catch {
    throw new Error("Failed to decrypt .svp file: wrong key or file is corrupted");
  }

  const parsed = JSON.parse(plaintext) as SvpSnapshotV1 | SvpSnapshotV2;
  if (parsed.svpVersion === 1) {
    return normalizeV1(parsed);
  }
  if (parsed.svpVersion === 2) {
    return parsed as SvpSnapshotV2;
  }
  const rawVersion = (parsed as { svpVersion?: unknown }).svpVersion;
  throw new Error(`Unsupported .svp version: ${String(rawVersion)}`);
}