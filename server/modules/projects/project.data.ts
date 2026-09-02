import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { projects, projectSettings } from "../../../drizzle/schema";

/**
 * Projects + project settings data access. The dashboard stats now count
 * actors (CCM world model) instead of the legacy characters table.
 */

export function getUserProjects(userId: number) {
  const db = getDb();
  if (!db) return [];
  return db
    .select({
      id: projects.id,
      userId: projects.userId,
      title: projects.title,
      description: projects.description,
      spec: projects.spec,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      sceneCount: sql<number>`(SELECT COUNT(*) FROM scenes WHERE scenes.projectId = projects.id)`,
      actorCount: sql<number>`(SELECT COUNT(*) FROM ccm_actors WHERE ccm_actors.projectId = projects.id)`,
      environmentCount: sql<number>`(SELECT COUNT(*) FROM ccm_environments WHERE ccm_environments.projectId = projects.id)`,
      totalWordCount: sql<number>`(SELECT COALESCE(SUM(wordCount), 0) FROM scenes WHERE scenes.projectId = projects.id)`,
    })
    .from(projects)
    .where(eq(projects.userId, userId))
    .all();
}

export function getProjectById(projectId: number) {
  const db = getDb();
  if (!db) return undefined;
  return db.select().from(projects).where(eq(projects.id, projectId)).get();
}

export function createProject(userId: number, title: string, description?: string) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const result = db
    .insert(projects)
    .values({ userId, title, description })
    .run();
  return getProjectById(result.lastInsertRowid as number);
}

export function updateProject(
  projectId: number,
  title?: string,
  description?: string,
  spec?: Record<string, unknown> | null
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (spec !== undefined) updates.spec = spec;
  db.update(projects).set(updates).where(eq(projects.id, projectId)).run();
}

export function deleteProject(projectId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.delete(projects).where(eq(projects.id, projectId)).run();
}

// ─── Project Settings ──────────────────────────────────────────────────────

export function getProjectSettings(projectId: number) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId))
    .all();
}

export function getProjectSettingByKey(projectId: number, settingKey: string) {
  const db = getDb();
  if (!db) return undefined;
  return db
    .select()
    .from(projectSettings)
    .where(and(eq(projectSettings.projectId, projectId), eq(projectSettings.settingKey, settingKey)))
    .get();
}

export function upsertProjectSetting(projectId: number, settingKey: string, settingValue: unknown) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.insert(projectSettings)
    .values({ projectId, settingKey, settingValue })
    .onConflictDoUpdate({
      target: [projectSettings.projectId, projectSettings.settingKey],
      set: { settingValue, updatedAt: new Date() },
    })
    .run();
  return getProjectSettingByKey(projectId, settingKey);
}