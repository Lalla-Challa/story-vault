import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { scenes, sceneVersions, mainStoryScenes } from "../../../drizzle/schema";
import * as storageService from "../../services/storageService";
import { getProjectById } from "../projects/project.data";

/**
 * Prose spine data access — scenes, scene versions and the main-story
 * assembly. Behavior is unchanged from the legacy db.ts implementation;
 * this module just owns the manuscript tables.
 */

// ─── Scenes ────────────────────────────────────────────────────────────────

export function getProjectScenes(projectId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(scenes).where(eq(scenes.projectId, projectId)).all();
}

export function getSceneById(sceneId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(scenes).where(eq(scenes.id, sceneId)).get();
}

export function createScene(
  projectId: number,
  title: string,
  description?: string,
  status: "draft" | "revised" | "final" = "draft"
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const result = db
    .insert(scenes)
    .values({ projectId, title, description, status, wordCount: 0 })
    .run();
  return getSceneById(result.lastInsertRowid as number);
}

export function updateScene(
  sceneId: number,
  title?: string,
  description?: string,
  status?: "draft" | "revised" | "final",
  wordCount?: number
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (wordCount !== undefined) updates.wordCount = wordCount;
  db.update(scenes).set(updates).where(eq(scenes.id, sceneId)).run();
}

export function deleteScene(sceneId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getSceneById(sceneId);
  db.delete(scenes).where(eq(scenes.id, sceneId)).run();
  if (existing) {
    const project = getProjectById(existing.projectId);
    if (project) storageService.recomputeUsage(project.userId);
  }
}

// ─── Scene Versions ────────────────────────────────────────────────────────

export function getSceneVersions(sceneId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(sceneVersions).where(eq(sceneVersions.sceneId, sceneId)).all();
}

export function getVersionById(versionId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(sceneVersions).where(eq(sceneVersions.id, versionId)).get();
}

export function createSceneVersion(
  sceneId: number,
  content: string,
  versionLabel: "draft" | "revised" | "final" = "draft"
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const scene = getSceneById(sceneId);
  if (!scene) throw new Error("Scene not found");
  const project = getProjectById(scene.projectId);
  if (!project) throw new Error("Project not found");

  const sizeBytes = storageService.calculateBytes(content);
  storageService.enforceQuota(project.userId, sizeBytes);

  const result = db
    .insert(sceneVersions)
    .values({ sceneId, content, versionLabel, sizeBytes })
    .run();
  const id = result.lastInsertRowid as number;

  // Update parent scene word count
  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
  db.update(scenes).set({ wordCount }).where(eq(scenes.id, sceneId)).run();

  // Update total usage
  storageService.recomputeUsage(project.userId);

  return getVersionById(id);
}

export function updateSceneVersion(
  versionId: number,
  content: string,
  versionLabel: "draft" | "revised" | "final"
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getVersionById(versionId);
  if (!existing) throw new Error("Version not found");
  const scene = getSceneById(existing.sceneId);
  const project = scene ? getProjectById(scene.projectId) : undefined;
  if (project) {
    // Delta vs. the stored version's previous size so the check doesn't
    // double-count content that is already in usedBytes.
    const sizeBytes = storageService.calculateBytes(content);
    storageService.enforceQuota(project.userId, sizeBytes - (existing.sizeBytes ?? 0));
    db.update(sceneVersions)
      .set({ content, versionLabel, sizeBytes, updatedAt: new Date() })
      .where(eq(sceneVersions.id, versionId))
      .run();
    storageService.recomputeUsage(project.userId);
  } else {
    db.update(sceneVersions).set({ content, versionLabel }).where(eq(sceneVersions.id, versionId)).run();
  }
}

export function deleteSceneVersion(versionId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const existing = getVersionById(versionId);
  db.delete(sceneVersions).where(eq(sceneVersions.id, versionId)).run();
  if (existing) {
    const scene = getSceneById(existing.sceneId);
    const project = scene ? getProjectById(scene.projectId) : undefined;
    if (project) storageService.recomputeUsage(project.userId);
  }
}

// ─── Main Story ────────────────────────────────────────────────────────────

export function getMainStory(projectId: number) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(mainStoryScenes)
    .where(eq(mainStoryScenes.projectId, projectId))
    .orderBy(mainStoryScenes.order)
    .all();
}

export function addSceneToMainStory(
  projectId: number,
  sceneId: number,
  versionId: number,
  order: number
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.insert(mainStoryScenes).values({ projectId, sceneId, versionId, order }).run();
}

export function updateMainStoryScene(mainStorySceneId: number, versionId: number, order: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.update(mainStoryScenes)
    .set({ versionId, order })
    .where(eq(mainStoryScenes.id, mainStorySceneId))
    .run();
}

export function removeSceneFromMainStory(mainStorySceneId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.delete(mainStoryScenes).where(eq(mainStoryScenes.id, mainStorySceneId)).run();
}