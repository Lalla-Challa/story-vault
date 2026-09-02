import { defineConfig } from "drizzle-kit";

/**
 * SQLite schema management.
 *
 * NOTE: `drizzle-kit generate` only (no push/migrate against the live DB) —
 * the database is SQLCipher-encrypted, so only the app (after PIN unlock)
 * can open it and apply migrations at runtime.
 */
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/story_vault.db",
  },
});
