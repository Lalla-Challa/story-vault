/**
 * In-process MCP server for the running app.
 *
 * When the vault is unlocked, the app starts a Streamable HTTP MCP server on
 * `http://127.0.0.1:<port>/mcp` (default 3100) using the app's own open DB.
 * External MCP clients (Qwen Studio, Claude Desktop, Cursor…) connect over
 * plain HTTP — no npx/uvx/process-spawn involved, so there is no native-addon
 * or working-directory fragility. The server is stopped on vault lock.
 */
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Express } from "express";
import { configureVault, buildMcpServer, startMcpHttpServer } from "../mcp";
import { getDb, getLocalUser } from "../db";

/** Port for the embedded MCP HTTP server. Override with STORY_VAULT_MCP_PORT. */
export const MCP_HTTP_PORT = parseInt(process.env.STORY_VAULT_MCP_PORT || "3100", 10);

let mcpServer: Server | null = null;
let httpApp: Express | null = null;
let started = false;

/** Starts the embedded MCP server using the currently-unlocked vault. */
export function startEmbeddedMcpServer(): void {
  if (started) return;
  const db = getDb();
  const user = getLocalUser();
  if (!db || !user) {
    console.error("[MCP] vault not open — cannot start embedded MCP server");
    return;
  }

  try {
    configureVault(db as never, user.id);
    // startMcpHttpServer builds a fresh Server + transport per session and
    // listens on the MCP port. Allow the hosts-file domain (storyvault.local)
    // plus localhost, so MCP clients that require a real domain can reach it.
    const allowedHosts = [
      "127.0.0.1",
      "localhost",
      "storyvault.local",
      ...(process.env.STORY_VAULT_MCP_HOSTS
        ? process.env.STORY_VAULT_MCP_HOSTS.split(",").map((s) => s.trim())
        : []),
    ];
    startMcpHttpServer(MCP_HTTP_PORT, allowedHosts).catch((err) => {
      console.error("[MCP] failed to start HTTP server:", err);
    });
    started = true;
    console.error(`[MCP] embedded server starting on http://127.0.0.1:${MCP_HTTP_PORT}/mcp`);
  } catch (err) {
    console.error("[MCP] failed to start embedded MCP server:", err);
  }
}

/** Stops the embedded MCP server (e.g. on vault lock). */
export function stopEmbeddedMcpServer(): void {
  if (!started) return;
  try {
    httpApp = null;
  } catch {
    // ignore
  }
  mcpServer = null;
  started = false;
  console.error("[MCP] embedded MCP server stopped");
}
