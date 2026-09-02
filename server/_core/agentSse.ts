import type { Express } from "express";
import { createContext } from "./context";
import { runAgent, type AgentRunRequest } from "../agent/runAgent";
import type { AgentSseEvent } from "../agent/tools";

/**
 * Registers a single SSE endpoint for the agent loop.
 * The client streams a POST body with projectId + prompt; the server replies
 * with a stream of JSON events (text deltas, tool calls, proposals, …).
 */
export function registerAgentSseRoute(app: Express) {
  app.post("/api/agent/run", async (req, res) => {
    const ctx = await createContext({ req: req as any, res: res as any } as any);
    if (!ctx.user) {
      res.status(401).json({ error: "Vault is locked" });
      return;
    }

    const body = (req.body ?? {}) as Partial<AgentRunRequest>;
    if (!body.projectId || typeof body.projectId !== "number" || !body.prompt) {
      res.status(400).json({ error: "projectId (number) and prompt (string) are required" });
      return;
    }

    const send = (event: AgentSseEvent) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    try {
      await runAgent(
        {
          projectId: body.projectId,
          prompt: body.prompt,
          messages: body.messages,
          sceneId: body.sceneId,
          sessionId: body.sessionId,
        },
        ctx.user.id,
        send,
        { signal: controller.signal }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent run failed";
      send({ type: "error", message });
    } finally {
      res.end();
    }
  });
}