import { eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  chatSessions,
  type InsertChatSession,
  type ChatSession,
  type ChatMessage,
  type CompressedContext,
} from "../../drizzle/schema";

export function createSession(input: InsertChatSession): ChatSession {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const result = db.insert(chatSessions).values(input).run();
  const id = result.lastInsertRowid as number;
  return db.select().from(chatSessions).where(eq(chatSessions.id, id)).get()!;
}

export function getSession(sessionId: number): ChatSession | undefined {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).get();
}

export function listSessions(projectId: number): ChatSession[] {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.projectId, projectId))
    .orderBy(desc(chatSessions.updatedAt))
    .all();
}

export function updateSessionMessages(
  sessionId: number,
  messages: ChatMessage[]
): void {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.update(chatSessions)
    .set({ messages: messages as any, updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId))
    .run();
}

export function updateSessionTitle(sessionId: number, title: string): void {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.update(chatSessions)
    .set({ title, updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId))
    .run();
}

export function deleteSession(sessionId: number): void {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.delete(chatSessions).where(eq(chatSessions.id, sessionId)).run();
}

/**
 * Builds a branch session: copies the parent session's messages up to and
 * including the given message index, then creates a new session with those
 * messages as the starting context.
 */
export function branchSession(
  projectId: number,
  parentSessionId: number,
  parentMessageId: number // index into parent's messages array
): ChatSession {
  const parent = getSession(parentSessionId);
  if (!parent) throw new Error("Parent session not found");
  const parentMessages = (parent.messages as unknown as ChatMessage[]) ?? [];
  const branchMessages = parentMessages.slice(0, parentMessageId + 1);
  return createSession({
    projectId,
    parentId: parentSessionId,
    parentMessageId,
    title: `Branch: ${parent.title}`,
    messages: branchMessages as any,
  });
}

/**
 * Creates an isolated RESEARCH thread branched from a message in a main
 * session. The thread carries only the parent's context up to the branch
 * point; everything after it in the main chat stays out of this thread.
 */
export function createResearchThread(
  projectId: number,
  parentSessionId: number,
  parentMessageId: number // index into parent's messages array
): ChatSession {
  const parent = getSession(parentSessionId);
  if (!parent) throw new Error("Parent session not found");
  const parentMessages = (parent.messages as unknown as ChatMessage[]) ?? [];
  const context = parentMessages.slice(0, parentMessageId + 1);
  // If the branch point falls inside the parent's compressed region, carry
  // the compressed context forward so the research thread doesn't lose the
  // summary of the earliest messages.
  const parentCompressed = parent.compressedContext as unknown as CompressedContext | null;
  const compressed =
    parentCompressed && parentCompressed.summarizedUpTo >= parentMessageId
      ? parentCompressed
      : null;
  return createSession({
    projectId,
    parentId: parentSessionId,
    parentMessageId,
    title: `Research: ${parent.title}`,
    type: "research",
    status: "active",
    messages: context as any,
    ...(compressed ? { compressedContext: compressed as any } : {}),
  });
}

export function updateSessionStatus(
  sessionId: number,
  status: "active" | "merged" | "discarded"
): void {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.update(chatSessions)
    .set({ status, updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId))
    .run();
}

/** Appends one message to a session's history and persists it. */
export function appendSessionMessage(sessionId: number, message: ChatMessage): ChatSession {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  const messages = [...((session.messages as unknown as ChatMessage[]) ?? []), message];
  updateSessionMessages(sessionId, messages);
  return getSession(sessionId)!;
}

/** Persists an updated compressed context on a session. */
export function updateSessionCompressedContext(
  sessionId: number,
  compressedContext: CompressedContext | null
): void {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.update(chatSessions)
    .set({ compressedContext: compressedContext as any, updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId))
    .run();
}

/**
 * Creates a standalone research thread seeded with an idea's content, so the
 * AI can evaluate/refine it in isolation (no parent main chat).
 */
export function createIdeaResearchThread(
  projectId: number,
  ideaTitle: string,
  ideaContent: string
): ChatSession {
  const prompt = `Evaluate this idea for the project:

Title: ${ideaTitle}

${ideaContent}

Explore it thoroughly: consider how it fits the existing story, its implications, strengths, weaknesses, and any refinements.`;
  return createSession({
    projectId,
    title: `Idea: ${ideaTitle.slice(0, 40)}`,
    type: "research",
    status: "active",
    messages: [{ role: "user", content: prompt, createdAt: new Date().toISOString() }] as any,
  });
}