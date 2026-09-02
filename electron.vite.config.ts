import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "shared"),
      },
    },
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "electron/main.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "electron/preload.ts"),
        },
        output: {
          format: "cjs" as const,
        },
      },
    },
  },
  renderer: {
    root: path.resolve(__dirname, "client"),
    publicDir: path.resolve(__dirname, "client/public"),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "client/src"),
        "@shared": path.resolve(__dirname, "shared"),
      },
    },
    plugins: [react(), tailwindcss()],
    server: {
      // The renderer dev server proxies all API calls to the Express backend.
      proxy: {
        "/api": { target: "http://localhost:3000", changeOrigin: true },
      },
    },
    build: {
      outDir: path.resolve(__dirname, "dist/client"),
      emptyOutDir: false,
      rollupOptions: {
        input: path.resolve(__dirname, "client/index.html"),
      },
    },
  },
});