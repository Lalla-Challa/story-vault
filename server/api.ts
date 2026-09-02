import express, { Router, Request, Response, NextFunction } from "express";
import * as db from "./db";
import { and, eq, like, or } from "drizzle-orm";
import { scenes, sceneVersions, ccmActors, ccmEnvironments, ccmSystems, ccmRules, projectMemory } from "../drizzle/schema";
import multer from "multer";
import { encryptSvp, decryptSvp, SvpSnapshot } from "./svp";
import { ENV } from "./_core/env";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

/**
 * Local-first auth middleware: resolves the single local user via the tRPC
 * context machinery. When the vault is locked, requests are rejected.
 */
async function requireLocalUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { createContext } = await import("./_core/context");
    const ctx = await createContext({ req: req as any, res: res as any } as any);
    if (!ctx.user) {
      return res.status(401).json({ code: "UNAUTHORIZED", error: "Vault is locked" });
    }
    (req as any).userId = ctx.user.id;
    (req as any).user = ctx.user;
    next();
  } catch (error) {
    return res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
  }
}

// SVP endpoints use the same local context (session-cookie-free)
router.get("/svp/export/:projectId", async (req: Request, res: Response) => {
  try {
    const { createContext } = await import("./_core/context");
    const ctx = await createContext({ req: req as any, res: res as any } as any);
    if (!ctx.user) return res.status(401).json({ error: "Not authenticated" });
    const userId = ctx.user.id;
    const projectId = parseInt(req.params.projectId);

    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.userId !== userId) return res.status(403).json({ error: "Access denied" });

    // Assemble full snapshot
    const projectScenes = db.getProjectScenes(projectId);
    const mainStoryRows = db.getMainStory(projectId);
    const actorRows = db.getProjectActors(projectId);
    const environmentRows = db.getProjectEnvironments(projectId);
    const systemRows = db.getProjectSystems(projectId);
    const ruleRows = db.getProjectRules(projectId);

    // Build scenes with versions, assigning stable localIds
    const svpScenes: SvpSnapshot["scenes"] = [];
    let localIdCounter = 1;
    const sceneLocalIdMap = new Map<number, number>(); // dbId → localId
    const versionLocalIdMap = new Map<number, number>(); // dbId → localId

    for (const scene of projectScenes) {
      const sceneLocalId = localIdCounter++;
      sceneLocalIdMap.set(scene.id, sceneLocalId);
      const versions = db.getSceneVersions(scene.id);
      const svpVersions = versions.map((v) => {
        const vLocalId = localIdCounter++;
        versionLocalIdMap.set(v.id, vLocalId);
        return {
          localId: vLocalId,
          versionLabel: v.versionLabel,
          content: v.content,
          createdAt: v.createdAt.toISOString(),
        };
      });
      svpScenes.push({
        localId: sceneLocalId,
        title: scene.title,
        description: scene.description ?? null,
        createdAt: scene.createdAt.toISOString(),
        versions: svpVersions,
      });
    }

    const snapshot: SvpSnapshot = {
      svpVersion: 2,
      exportedAt: new Date().toISOString(),
      project: {
        title: project.title,
        description: project.description ?? null,
        spec: (project.spec ?? null) as Record<string, unknown> | null,
      },
      scenes: svpScenes,
      mainStory: mainStoryRows.map((m) => ({
        sceneLocalId: sceneLocalIdMap.get(m.sceneId) ?? 0,
        versionLocalId: versionLocalIdMap.get(m.versionId) ?? 0,
        order: m.order,
      })),
      actors: actorRows.map((a) => ({
        name: a.name,
        type: a.type,
        description: a.description ?? null,
        notes: a.notes ?? null,
        attributes: (a.attributes ?? {}) as Record<string, unknown>,
        state: (a.state ?? {}) as Record<string, unknown>,
        goals: (a.goals ?? {}) as Record<string, string[]>,
        drives: (a.drives ?? []) as string[],
        beliefs: (a.beliefs ?? {}) as Record<string, string[]>,
        knowledge: (a.knowledge ?? []) as string[],
        capabilities: (a.capabilities ?? []) as string[],
        constraints: (a.constraints ?? []) as string[],
        resources: (a.resources ?? {}) as Record<string, unknown>,
        habits: (a.habits ?? []) as string[],
        plans: (a.plans ?? []) as string[],
      })),
      environments: environmentRows.map((e) => ({
        name: e.name,
        type: e.type,
        attributes: (e.attributes ?? {}) as Record<string, unknown>,
        state: (e.state ?? {}) as Record<string, unknown>,
        resources: (e.resources ?? {}) as Record<string, unknown>,
        inhabitants: (e.inhabitants ?? []) as string[],
        accessibility: (e.accessibility ?? {}) as Record<string, unknown>,
        activeProcesses: (e.activeProcesses ?? []) as string[],
        constraints: (e.constraints ?? []) as string[],
      })),
      systems: systemRows.map((s) => ({
        name: s.name,
        type: s.type,
        rules: (s.rules ?? []) as string[],
        constraints: (s.constraints ?? []) as string[],
        activeConditions: (s.activeConditions ?? []) as string[],
        effects: (s.effects ?? []) as string[],
        exceptions: (s.exceptions ?? []) as string[],
      })),
      rules: ruleRows.map((r) => ({
        name: r.name,
        family: r.family,
        when: (r.when ?? {}) as Record<string, unknown>,
        candidateEvents: (r.candidateEvents ?? []) as Array<Record<string, unknown>>,
        effects: (r.effects ?? []) as Array<Record<string, unknown>>,
        priority: r.priority,
        probability: r.probability,
        cooldown: r.cooldown,
        scope: (r.scope ?? "actor") as string,
        enabled: r.enabled,
      })),
      memory: [],
    };

    const encrypted = encryptSvp(snapshot, ENV.svpSecret);
    const filename = `${project.title.replace(/[^a-z0-9]/gi, "_")}.svp`;

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(encrypted);
  } catch (error) {
    console.error("[SVP Export]", error);
    res.status(500).json({ error: "Failed to export project" });
  }
});

router.post("/svp/import", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const { createContext } = await import("./_core/context");
    const ctx = await createContext({ req: req as any, res: res as any } as any);
    if (!ctx.user) return res.status(401).json({ error: "Not authenticated" });
    const userId = ctx.user.id;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let snapshot: SvpSnapshot;
    try {
      snapshot = decryptSvp(req.file.buffer, ENV.svpSecret);
    } catch (e: any) {
      return res.status(400).json({ error: e.message ?? "Invalid .svp file" });
    }

    // Create the project under the importing user
    const newProject = db.createProject(userId, snapshot.project.title, snapshot.project.description ?? undefined);
    if (!newProject) throw new Error("Failed to create project");

    // Maps from snapshot localId → new DB id
    const sceneIdMap = new Map<number, number>();
    const versionIdMap = new Map<number, number>();

    // Recreate scenes and versions
    for (const svpScene of snapshot.scenes) {
      const newScene = db.createScene(newProject.id, svpScene.title, svpScene.description ?? undefined);
      if (!newScene) continue;
      sceneIdMap.set(svpScene.localId, newScene.id);

      for (const svpVersion of svpScene.versions) {
        const newVersion = db.createSceneVersion(newScene.id, svpVersion.content, svpVersion.versionLabel);
        if (!newVersion) continue;
        versionIdMap.set(svpVersion.localId, newVersion.id);
      }
    }

    // Recreate main story
    for (const entry of snapshot.mainStory) {
      const sceneId = sceneIdMap.get(entry.sceneLocalId);
      const versionId = versionIdMap.get(entry.versionLocalId);
      if (sceneId && versionId) {
        db.addSceneToMainStory(newProject.id, sceneId, versionId, entry.order);
      }
    }

    // Recreate actors (world model)
    for (const a of snapshot.actors) {
      db.createActor(newProject.id, a.name, {
        type: a.type,
        description: a.description ?? undefined,
        notes: a.notes ?? undefined,
        attributes: a.attributes,
        state: a.state,
        goals: a.goals,
        drives: a.drives,
        beliefs: a.beliefs,
        knowledge: a.knowledge,
        capabilities: a.capabilities,
        constraints: a.constraints,
        resources: a.resources,
        habits: a.habits,
        plans: a.plans,
      });
    }

    // Recreate environments
    for (const e of snapshot.environments) {
      db.createEnvironment(newProject.id, e.name, {
        type: e.type,
        attributes: e.attributes,
        state: e.state,
        resources: e.resources,
        inhabitants: e.inhabitants,
        accessibility: e.accessibility,
        activeProcesses: e.activeProcesses,
        constraints: e.constraints,
      });
    }

    // Recreate systems
    for (const s of snapshot.systems) {
      db.createSystem(newProject.id, s.name, {
        type: s.type,
        rules: s.rules,
        constraints: s.constraints,
        activeConditions: s.activeConditions,
        effects: s.effects,
        exceptions: s.exceptions,
      });
    }

    // Recreate rules
    for (const r of snapshot.rules) {
      db.createRule(newProject.id, r.name, {
        family: r.family as any,
        when: r.when,
        candidateEvents: r.candidateEvents,
        effects: r.effects,
        priority: r.priority,
        probability: r.probability,
        cooldown: r.cooldown,
        scope: r.scope,
        enabled: r.enabled,
      });
    }

    // Recreate project memory (lore/hypotheses)
    for (const m of snapshot.memory) {
      const dbInstance = db.getDb();
      if (dbInstance) {
        dbInstance
          .insert(projectMemory)
          .values({ projectId: newProject.id, category: m.category, content: m.content })
          .run();
      }
    }

    res.json({ success: true, projectId: newProject.id, title: newProject.title });
  } catch (error) {
    console.error("[SVP Import]", error);
    res.status(500).json({ error: "Failed to import project" });
  }
});

// All remaining REST routes require an unlocked vault
router.use(requireLocalUser);

// ============ PROJECT ENDPOINTS ============
router.get("/projects", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const projects = db.getUserProjects(userId);
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.get("/projects/:projectId", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const project = db.getProjectById(parseInt(req.params.projectId));
    if (!project) return res.status(404).json({ code: "NOT_FOUND", error: "Project not found" });
    if (project.userId !== userId) return res.status(403).json({ code: "FORBIDDEN", error: "Access denied" });
    res.json(project);
  } catch (error) {
    res.status(500).json({ code: "INTERNAL_ERROR", error: "Failed to fetch project" });
  }
});

router.post("/projects", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ code: "BAD_REQUEST", error: "Title is required" });
    const result = db.createProject(userId, title, description);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ code: "INTERNAL_ERROR", error: "Failed to create project" });
  }
});

router.put("/projects/:projectId", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ code: "BAD_REQUEST", error: "Title is required" });
    const project = db.getProjectById(parseInt(req.params.projectId));
    if (!project) return res.status(404).json({ code: "NOT_FOUND", error: "Project not found" });
    if (project.userId !== userId) return res.status(403).json({ code: "FORBIDDEN", error: "Access denied" });
    db.updateProject(parseInt(req.params.projectId), title, description);
    res.json(db.getProjectById(parseInt(req.params.projectId)));
  } catch (error) {
    res.status(500).json({ code: "INTERNAL_ERROR", error: "Failed to update project" });
  }
});

router.delete("/projects/:projectId", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const project = db.getProjectById(parseInt(req.params.projectId));
    if (!project) return res.status(404).json({ code: "NOT_FOUND", error: "Project not found" });
    if (project.userId !== userId) return res.status(403).json({ code: "FORBIDDEN", error: "Access denied" });
    db.deleteProject(parseInt(req.params.projectId));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ code: "INTERNAL_ERROR", error: "Failed to delete project" });
  }
});

// ============ SCENE ENDPOINTS ============
router.get("/projects/:projectId/scenes", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const project = db.getProjectById(parseInt(req.params.projectId));
    if (!project) return res.status(404).json({ code: "NOT_FOUND", error: "Project not found" });
    if (project.userId !== userId) return res.status(403).json({ code: "FORBIDDEN", error: "Access denied" });
    res.json(db.getProjectScenes(parseInt(req.params.projectId)));
  } catch (error) {
    res.status(500).json({ code: "INTERNAL_ERROR", error: "Failed to fetch scenes" });
  }
});

router.get("/scenes/:sceneId", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const scene = db.getSceneById(parseInt(req.params.sceneId));
    if (!scene) return res.status(404).json({ code: "NOT_FOUND", error: "Scene not found" });
    const project = db.getProjectById(scene.projectId);
    if (!project || project.userId !== userId) return res.status(403).json({ code: "FORBIDDEN", error: "Access denied" });
    res.json(scene);
  } catch (error) {
    res.status(500).json({ code: "INTERNAL_ERROR", error: "Failed to fetch scene" });
  }
});

router.post("/projects/:projectId/scenes", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const projectId = parseInt(req.params.projectId);
    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ code: "NOT_FOUND", error: "Project not found" });
    if (project.userId !== userId) return res.status(403).json({ code: "FORBIDDEN", error: "Access denied" });
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ code: "BAD_REQUEST", error: "Title is required" });
    const result = db.createScene(projectId, title, description);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ code: "INTERNAL_ERROR", error: "Failed to create scene" });
  }
});

router.put("/scenes/:sceneId", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const scene = db.getSceneById(parseInt(req.params.sceneId));
    if (!scene) return res.status(404).json({ code: "NOT_FOUND", error: "Scene not found" });
    const project = db.getProjectById(scene.projectId);
    if (!project || project.userId !== userId) return res.status(403).json({ code: "FORBIDDEN", error: "Access denied" });
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ code: "BAD_REQUEST", error: "Title is required" });
    db.updateScene(parseInt(req.params.sceneId), title, description);
    res.json(db.getSceneById(parseInt(req.params.sceneId)));
  } catch (error) {
    res.status(500).json({ code: "INTERNAL_ERROR", error: "Failed to update scene" });
  }
});

router.delete("/scenes/:sceneId", (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const scene = db.getSceneById(parseInt(req.params.sceneId));
    if (!scene) return res.status(404).json({ code: "NOT_FOUND", error: "Scene not found" });
    const project = db.getProjectById(scene.projectId);
    if (!project || project.userId !== userId) return res.status(403).json({ code: "FORBIDDEN", error: "Access denied" });
    db.deleteScene(parseInt(req.params.sceneId));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ code: "INTERNAL_ERROR", error: "Failed to delete scene" });
  }
});

// ============ SCENE VERSION ENDPOINTS ============
router.get("/scenes/:sceneId/versions", (req: Request, res: Response) => {
  try {
    res.json(db.getSceneVersions(parseInt(req.params.sceneId)));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch versions" });
  }
});

router.get("/versions/:versionId", (req: Request, res: Response) => {
  try {
    const version = db.getVersionById(parseInt(req.params.versionId));
    if (!version) return res.status(404).json({ error: "Version not found" });
    res.json(version);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch version" });
  }
});

router.post("/scenes/:sceneId/versions", (req: Request, res: Response) => {
  try {
    const { content, versionLabel } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    const result = db.createSceneVersion(parseInt(req.params.sceneId), content, versionLabel || "draft");
    res.status(201).json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: "Failed to create version" });
  }
});

router.put("/versions/:versionId", (req: Request, res: Response) => {
  try {
    const { content, versionLabel } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    db.updateSceneVersion(parseInt(req.params.versionId), content, versionLabel);
    res.json(db.getVersionById(parseInt(req.params.versionId)));
  } catch (error) {
    res.status(500).json({ error: "Failed to update version" });
  }
});

router.delete("/versions/:versionId", (req: Request, res: Response) => {
  try {
    db.deleteSceneVersion(parseInt(req.params.versionId));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete version" });
  }
});

// ============ MAIN STORY ENDPOINTS ============
router.get("/projects/:projectId/main-story", (req: Request, res: Response) => {
  try {
    res.json(db.getMainStory(parseInt(req.params.projectId)));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch main story" });
  }
});

router.post("/projects/:projectId/main-story", (req: Request, res: Response) => {
  try {
    const { sceneId, versionId, order } = req.body;
    if (!sceneId || !versionId || order === undefined) {
      return res.status(400).json({ error: "sceneId, versionId, and order are required" });
    }
    const result = db.addSceneToMainStory(parseInt(req.params.projectId), sceneId, versionId, order);
    res.status(201).json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: "Failed to add scene to main story" });
  }
});

router.put("/main-story/:mainStorySceneId", (req: Request, res: Response) => {
  try {
    const { versionId, order } = req.body;
    if (versionId === undefined || order === undefined) {
      return res.status(400).json({ error: "versionId and order are required" });
    }
    db.updateMainStoryScene(parseInt(req.params.mainStorySceneId), versionId, order);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update main story scene" });
  }
});

router.delete("/main-story/:mainStorySceneId", (req: Request, res: Response) => {
  try {
    db.removeSceneFromMainStory(parseInt(req.params.mainStorySceneId));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove scene from main story" });
  }
});

// ============ ACTOR ENDPOINTS (CCM world model) ============
router.get("/projects/:projectId/actors", (req: Request, res: Response) => {
  try {
    res.json(db.getProjectActors(parseInt(req.params.projectId)));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch actors" });
  }
});

router.get("/actors/:actorId", (req: Request, res: Response) => {
  try {
    const actor = db.getActorById(parseInt(req.params.actorId));
    if (!actor) return res.status(404).json({ error: "Actor not found" });
    res.json(actor);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch actor" });
  }
});

router.post("/projects/:projectId/actors", (req: Request, res: Response) => {
  try {
    const { name, type, description, notes, attributes, goals, drives } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const result = db.createActor(parseInt(req.params.projectId), name, {
      type,
      description,
      notes,
      attributes,
      goals,
      drives,
    });
    res.status(201).json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: "Failed to create actor" });
  }
});

router.get("/projects/:projectId/search", (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const query = (req.query.q as string) ?? "";
    if (!query) return res.status(400).json({ error: "Missing query parameter" });
    const dbInstance = db.getDb();
    if (!dbInstance) return res.json([]);
    const searchPattern = `%${query}%`;
    const sceneResults = dbInstance
      .select()
      .from(scenes)
      .where(and(eq(scenes.projectId, projectId), or(like(scenes.title, searchPattern), like(scenes.description, searchPattern))))
      .all()
      .map((r) => ({ type: "scene", id: r.id, title: r.title, snippet: r.description }));
    const versionResults = dbInstance
      .select({ id: sceneVersions.id, content: sceneVersions.content })
      .from(sceneVersions)
      .innerJoin(scenes, eq(sceneVersions.sceneId, scenes.id))
      .where(and(eq(scenes.projectId, projectId), like(sceneVersions.content, searchPattern)))
      .all()
      .map((r) => ({ type: "version", id: r.id, title: "Version", snippet: r.content.slice(0, 200) }));
    const actorResults = dbInstance
      .select()
      .from(ccmActors)
      .where(and(eq(ccmActors.projectId, projectId), like(ccmActors.name, searchPattern)))
      .all()
      .map((r) => ({ type: "actor", id: r.id, title: r.name, snippet: r.description }));
    const environmentResults = dbInstance
      .select()
      .from(ccmEnvironments)
      .where(and(eq(ccmEnvironments.projectId, projectId), like(ccmEnvironments.name, searchPattern)))
      .all()
      .map((r) => ({ type: "environment", id: r.id, title: r.name, snippet: null }));
    const systemResults = dbInstance
      .select()
      .from(ccmSystems)
      .where(and(eq(ccmSystems.projectId, projectId), like(ccmSystems.name, searchPattern)))
      .all()
      .map((r) => ({ type: "system", id: r.id, title: r.name, snippet: null }));
    res.json([...sceneResults, ...versionResults, ...actorResults, ...environmentResults, ...systemResults]);
  } catch (error) {
    res.status(500).json({ error: "Failed to perform search" });
  }
});

router.put("/actors/:actorId", (req: Request, res: Response) => {
  try {
    const { name, type, description, notes, attributes, state, goals, drives, beliefs, knowledge, capabilities, constraints, resources, habits, plans } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    db.updateActor(parseInt(req.params.actorId), {
      name,
      type,
      description,
      notes,
      attributes,
      state,
      goals,
      drives,
      beliefs,
      knowledge,
      capabilities,
      constraints,
      resources,
      habits,
      plans,
    });
    res.json(db.getActorById(parseInt(req.params.actorId)));
  } catch (error) {
    res.status(500).json({ error: "Failed to update actor" });
  }
});

router.delete("/actors/:actorId", (req: Request, res: Response) => {
  try {
    db.deleteActor(parseInt(req.params.actorId));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete actor" });
  }
});

// ============ ENVIRONMENT / SYSTEM ENDPOINTS ============
router.get("/projects/:projectId/environments", (req: Request, res: Response) => {
  try {
    res.json(db.getProjectEnvironments(parseInt(req.params.projectId)));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch environments" });
  }
});

router.post("/projects/:projectId/environments", (req: Request, res: Response) => {
  try {
    const { name, type, attributes, state, activeProcesses } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const result = db.createEnvironment(parseInt(req.params.projectId), name, {
      type,
      attributes,
      state,
      activeProcesses,
    });
    res.status(201).json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: "Failed to create environment" });
  }
});

router.get("/projects/:projectId/systems", (req: Request, res: Response) => {
  try {
    res.json(db.getProjectSystems(parseInt(req.params.projectId)));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch systems" });
  }
});

router.post("/projects/:projectId/systems", (req: Request, res: Response) => {
  try {
    const { name, type, rules, effects } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const result = db.createSystem(parseInt(req.params.projectId), name, {
      type,
      rules,
      effects,
    });
    res.status(201).json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: "Failed to create system" });
  }
});

router.get("/projects/:projectId/rules", (req: Request, res: Response) => {
  try {
    res.json(db.getProjectRules(parseInt(req.params.projectId)));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rules" });
  }
});

router.post("/projects/:projectId/rules", (req: Request, res: Response) => {
  try {
    const { name, family, when, candidateEvents, probability } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const result = db.createRule(parseInt(req.params.projectId), name, {
      family,
      when,
      candidateEvents,
      probability,
    });
    res.status(201).json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: "Failed to create rule" });
  }
});

export default router;