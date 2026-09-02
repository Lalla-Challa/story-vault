import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import * as db from "../db";
import { migrateLegacyEntities } from "../modules/migration/legacy";

/**
 * Local vault authentication.
 *
 * The local SQLite database is encrypted with SQLCipher. The encryption key is
 * derived from a user-chosen PIN (scrypt) — the key itself is never stored;
 * only a salted scrypt hash of the PIN is kept in `data/auth.json` so the PIN
 * can be verified before touching the database.
 *
 * State machine:
 *   - not configured  → `setupVault(pin)` creates auth.json, opens & migrates
 *                       the encrypted DB, creates the local user.
 *   - configured/locked → `unlockVault(pin)` verifies the PIN and opens the DB.
 *   - unlocked → `lockVault()` closes the DB.
 */

type AuthConfig = {
  version: 1;
  /** Salt used to verify the PIN (scrypt, 64 bytes). */
  pinSalt: string;
  pinHash: string;
  /** Salt used to derive the SQLCipher raw key (scrypt, 32 bytes). */
  keySalt: string;
  createdAt: string;
};

let unlocked = false;

export function isUnlocked(): boolean {
  return unlocked;
}

function readConfig(): AuthConfig | null {
  try {
    const raw = fs.readFileSync(ENV.authConfigPath, "utf8");
    const parsed = JSON.parse(raw) as AuthConfig;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function writeConfig(config: AuthConfig): void {
  fs.mkdirSync(ENV.dataDir, { recursive: true });
  fs.writeFileSync(ENV.authConfigPath, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function hashPin(pin: string, saltHex: string): string {
  return scryptSync(pin, Buffer.from(saltHex, "hex"), 64, { N: 4096 }).toString("hex");
}

function verifyPin(pin: string, config: AuthConfig): boolean {
  const candidate = Buffer.from(hashPin(pin, config.pinSalt), "hex");
  const stored = Buffer.from(config.pinHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function deriveDbKey(pin: string, saltHex: string): string {
  return scryptSync(pin, Buffer.from(saltHex, "hex"), 32, { N: 4096 }).toString("hex");
}

export function isConfigured(): boolean {
  return readConfig() !== null;
}

/**
 * First-run setup: persists the PIN metadata, opens the encrypted DB,
 * applies migrations, and creates the single local user.
 */
export function setupVault(pin: string): void {
  if (readConfig()) {
    throw new TRPCError({ code: "CONFLICT", message: "Vault is already configured" });
  }

  const pinSalt = randomBytes(16).toString("hex");
  const keySalt = randomBytes(16).toString("hex");

  writeConfig({
    version: 1,
    pinSalt,
    pinHash: hashPin(pin, pinSalt),
    keySalt,
    createdAt: new Date().toISOString(),
  });

  try {
    db.openLocalDb(deriveDbKey(pin, keySalt));
    db.runMigrations();
    db.ensureLocalUser();
    // Runtime legacy migration: the legacy tables are created empty by
    // migration 0000 even on a fresh vault, so this finds and drops them
    // (no data to copy on first run).
    try {
      migrateLegacyEntities();
    } catch {
      // best-effort: never block first-run setup on a migration hiccup
    }
    unlocked = true;
  } catch (error) {
    // Roll back the config so a failed setup can be retried.
    fs.rmSync(ENV.authConfigPath, { force: true });
    db.closeLocalDb();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to initialize vault: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/** Unlock an already-configured vault with the PIN. */
export function unlockVault(pin: string): void {
  const config = readConfig();
  if (!config) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Vault has not been configured yet. Run setup first.",
    });
  }
  if (!verifyPin(pin, config)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect PIN" });
  }

  try {
    db.openLocalDb(deriveDbKey(pin, config.keySalt));
    db.runMigrations(); // idempotent — applies any pending migrations
    // Runtime legacy migration: if the old characters/world_building_notes
    // tables still exist (from migration 0000), copy their data into the new
    // project-scoped world model and drop them.  Idempotent — after the first
    // unlock they are gone and this becomes a no-op.
    try {
      migrateLegacyEntities();
    } catch {
      // best-effort: never block vault unlock on a data migration issue
    }
    unlocked = true;
  } catch (error) {
    db.closeLocalDb();
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Unable to open vault: the database key is invalid or the file is corrupted",
    });
  }
}

/** Lock the vault (closes the encrypted DB handle). */
export function lockVault(): void {
  db.closeLocalDb();
  unlocked = false;
}

/** Change the PIN: verify the current one, rekey the DB, update the config. */
export function changePin(currentPin: string, newPin: string): void {
  const config = readConfig();
  if (!config || !unlocked) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Vault must be unlocked" });
  }
  if (!verifyPin(currentPin, config)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect current PIN" });
  }

  const originalConfig = JSON.stringify(config);
  const tmpPath = `${ENV.authConfigPath}.tmp`;
  const newKeySalt = randomBytes(16).toString("hex");
  const newKey = deriveDbKey(newPin, newKeySalt);
  const newPinSalt = randomBytes(16).toString("hex");
  const newConfig: AuthConfig = {
    version: 1,
    pinSalt: newPinSalt,
    pinHash: hashPin(newPin, newPinSalt),
    keySalt: newKeySalt,
    createdAt: config.createdAt,
  };

  // 1. Write new config to tmp file (never touch the real auth.json yet).
  fs.mkdirSync(ENV.dataDir, { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(newConfig, null, 2), { encoding: "utf8", mode: 0o600 });

  // 2. Attempt rekey on the live DB handle.
  try {
    db.rekeyLocalDb(newKey);
  } catch (error) {
    try { fs.rmSync(tmpPath, { force: true }); } catch {}
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `PIN change failed during rekey: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // 3. Verify the new key actually works on the live handle.
  try {
    const raw = db.getRawDb();
    if (raw) raw.prepare("SELECT 1").get();
  } catch (error) {
    try { db.rekeyLocalDb(deriveDbKey(currentPin, config.keySalt)); } catch {}
    try { fs.rmSync(tmpPath, { force: true }); } catch {}
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `PIN change verification failed, rolled back: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // 4. Rekey verified — atomically replace auth.json with the tmp file.
  try {
    fs.renameSync(tmpPath, ENV.authConfigPath);
  } catch (error) {
    try {
      fs.writeFileSync(ENV.authConfigPath, JSON.stringify(newConfig, null, 2), { encoding: "utf8", mode: 0o600 });
      fs.rmSync(tmpPath, { force: true });
    } catch {}
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "PIN change rekey succeeded but config file could not be updated — restart the app and re-enter the new PIN.",
    });
  }
}

/** Convenience: full data-dir path for diagnostics. */
export function vaultDataDir(): string {
  return path.resolve(ENV.dataDir);
}
