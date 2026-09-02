import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * In development the renderer is served by electron-vite's own dev server
 * (see `renderer` config in electron.vite.config.ts). The Express server
 * runs in parallel and proxies are set up so /api calls reach it.
 * In production the Express server is started in-process and the window
 * loads it over http://127.0.0.1.
 */
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

let mainWindow: BrowserWindow | null = null;

/** Loads the URL, retrying briefly on transient failures. */
async function loadWithRetry(url: string, attempts = 10): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await mainWindow!.loadURL(url);
      return;
    } catch (error) {
      if (i === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Story Vault",
    backgroundColor: "#FDFCFB",
    webPreferences: {
      preload: path.join(here, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  let url: string;
  if (DEV_SERVER_URL) {
    url = DEV_SERVER_URL;
    // The renderer dev server is guaranteed to be up before electron launches.
  } else {
    // In-process server: start Express + tRPC, then load the UI from it.
    const { startServer } = await import("../server/_core/bootstrap");
    const port = await startServer();
    url = `http://127.0.0.1:${port}`;
  }

  await loadWithRetry(url);
}

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    console.error("[Electron] Failed to start:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});