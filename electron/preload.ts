import { contextBridge } from "electron";

/**
 * Minimal preload bridge — exposes platform/version info for diagnostics.
 * All application logic runs in the renderer over the local HTTP API.
 */
contextBridge.exposeInMainWorld("storyVault", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
