import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";

/**
 * AI provider settings, stored inside the (SQLCipher-encrypted) SQLite DB
 * under the `system_settings` table. The API key is therefore encrypted at
 * rest with the user's PIN and is never returned by the API — only a
 * `hasApiKey` boolean is ever exposed.
 */
export type AgentSettings = {
  provider: "openai" | "anthropic" | "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey: string;
  /**
   * Optional explicit context window in tokens. When set, it overrides the
   * heuristic model-name detection (useful for aggregators that advertise a
   * window the model-name pattern can't guess). Null = auto-detect.
   */
  contextWindow: number | null;
};

export type AgentSettingsPublic = {
  provider: AgentSettings["provider"];
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  contextWindow: number | null;
};

export const AGENT_SETTINGS_KEY = "agent_settings";

const DEFAULT_SETTINGS: AgentSettings = {
  provider: "openai",
  baseUrl: "",
  model: "",
  apiKey: "",
  contextWindow: null,
};

export function getAgentSettings(): AgentSettings | null {
  const db = getDb();
  if (!db) return null;
  const row = db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, AGENT_SETTINGS_KEY))
    .get();
  if (!row?.value) return null;
  const value = row.value as Partial<AgentSettings>;
  return {
    provider: value.provider ?? DEFAULT_SETTINGS.provider,
    baseUrl: value.baseUrl ?? DEFAULT_SETTINGS.baseUrl,
    model: value.model ?? DEFAULT_SETTINGS.model,
    apiKey: value.apiKey ?? DEFAULT_SETTINGS.apiKey,
    contextWindow: value.contextWindow ?? DEFAULT_SETTINGS.contextWindow,
  };
}

/**
 * Saves settings. An empty/omitted apiKey preserves the existing key so the
 * client never needs to re-submit it.
 */
export function saveAgentSettings(input: {
  provider?: AgentSettings["provider"];
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  contextWindow?: number | null;
}): AgentSettings {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });
  const current = getAgentSettings() ?? DEFAULT_SETTINGS;

  const merged: AgentSettings = {
    provider: input.provider ?? current.provider,
    baseUrl: input.baseUrl ?? current.baseUrl,
    model: input.model ?? current.model,
    apiKey: input.apiKey !== undefined && input.apiKey !== "" ? input.apiKey : current.apiKey,
    contextWindow:
      input.contextWindow !== undefined ? input.contextWindow ?? null : current.contextWindow,
  };

  db.insert(systemSettings)
    .values({ key: AGENT_SETTINGS_KEY, value: merged })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: merged } })
    .run();

  return merged;
}

export function toPublicSettings(s: AgentSettings | null): AgentSettingsPublic {
  return {
    provider: s?.provider ?? DEFAULT_SETTINGS.provider,
    baseUrl: s?.baseUrl ?? "",
    model: s?.model ?? "",
    hasApiKey: Boolean(s?.apiKey),
    contextWindow: s?.contextWindow ?? null,
  };
}