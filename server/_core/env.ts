import path from "node:path";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

function isElectronRuntime(): boolean {
  return Boolean(process.versions?.electron);
}

/**
 * Lazily resolves the data directory. In Electron it uses app.getPath('userData')
 * after `whenReady`; before that, it falls back to cwd. Outside Electron it
 * uses LOCAL_DATA_DIR or cwd.
 */
function resolveDataDir(): string {
  if (process.env.LOCAL_DATA_DIR) return path.resolve(process.env.LOCAL_DATA_DIR);
  if (isElectronRuntime()) {
    try {
      const { app } = nodeRequire("electron") as typeof import("electron");
      // app.getPath('userData') is safe even before ready, but we guard anyway.
      return path.join(app.getPath("userData"), "data");
    } catch {
      // fall through
    }
  }
  return path.resolve(process.cwd(), "data");
}

function resolveResourcesPath(): string {
  if (!isElectronRuntime()) return process.cwd();
  try {
    const { app } = nodeRequire("electron") as typeof import("electron");
    if (app.isPackaged) return process.resourcesPath;
  } catch {
    // not in Electron or not yet packaged
  }
  return process.cwd();
}

function resolveMigrationsDir(): string {
  const resourcesPath = resolveResourcesPath();
  if (isElectronRuntime()) {
    try {
      const { app } = nodeRequire("electron") as typeof import("electron");
      if (app.isPackaged) return path.join(resourcesPath, "drizzle");
    } catch {}
  }
  return path.resolve(resourcesPath, "drizzle");
}

function resolveCcmIndexPath(): string {
  const resourcesPath = resolveResourcesPath();
  if (isElectronRuntime()) {
    try {
      const { app } = nodeRequire("electron") as typeof import("electron");
      if (app.isPackaged) return path.join(resourcesPath, "server/ccm/ccm-index.json");
    } catch {}
  }
  // In dev/bundled-but-not-packaged, fall back to src-adjacent location.
  return path.resolve(resourcesPath, "server/ccm/ccm-index.json");
}

const dataDir = resolveDataDir();

export const ENV = {
  dataDir,
  dbPath: path.join(dataDir, "story_vault.db"),
  authConfigPath: path.join(dataDir, "auth.json"),
  /** Folder containing generated SQLite migrations (drizzle-kit `out`). Packaged-safe. */
  migrationsDir: resolveMigrationsDir(),
  /** Full path to the bundled CCM retrieval index. Packaged-safe. */
  ccmIndexPath: resolveCcmIndexPath(),
  /** Secret used for encrypted .svp project files. */
  svpSecret: process.env.SVP_SECRET ?? "story-vault-svp-local-dev-secret-32b",
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT || "3000", 10),
  logDir: (() => {
    if (process.env.LOG_DIR) return path.resolve(process.env.LOG_DIR);
    if (isElectronRuntime()) {
      try {
        const { app } = nodeRequire("electron") as typeof import("electron");
        return path.join(app.getPath("userData"), "logs");
      } catch {}
    }
    return undefined;
  })(),
};
