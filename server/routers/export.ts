import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  PageNumber,
  Header,
  Footer,
} from "docx";
import PDFDocument from "pdfkit";
import JSZip from "jszip";
import { trackEvent } from "../services/activityTracker";

export const exportRouter = router({
  // Manuscript Export (.md, .docx, .pdf)
  manuscript: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        format: z.enum(["md", "docx", "pdf"]),
        authorName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

      const mainStory = db.getMainStory(input.projectId);
      const scenes = db.getProjectScenes(input.projectId);
      const author = sanitizeDocText(input.authorName || ctx.user.name || "Unknown Author");
      const safeTitle = sanitizeDocText(project.title);

      // Fetch all content first
      const fullContent: { title: string; content: string }[] = [];
      for (const item of mainStory) {
        const scene = scenes.find((s) => s.id === item.sceneId);
        const version = db.getVersionById(item.versionId);
        if (scene && version) {
          fullContent.push({ title: scene.title, content: version.content });
        }
      }

      if (input.format === "md") {
        let markdown = `# ${safeTitle}\nBy ${author}\n\n`;
        if (project.description) markdown += `${project.description}\n\n---\n\n`;
        for (const item of fullContent) {
          markdown += `## ${sanitizeDocText(item.title)}\n\n${stripHtml(item.content)}\n\n---\n\n`;
        }
        trackEvent(ctx.user.id, "document_exported", {
          projectId: input.projectId,
          featureName: "export",
          actionDetail: "md",
        });
        return {
          filename: `${safeTitle.replace(/\s+/g, "_")}.md`,
          content: Buffer.from(markdown).toString("base64"),
          contentType: "text/markdown",
        };
      }

      if (input.format === "docx") {
        const doc = new Document({
          sections: [
            {
              headers: {
                default: new Header({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: safeTitle, size: 20 })],
                      alignment: AlignmentType.RIGHT,
                    }),
                  ],
                }),
              },
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({ text: "Page ", size: 20 }),
                        new TextRun({ children: [PageNumber.CURRENT], size: 20 }),
                      ],
                    }),
                  ],
                }),
              },
              children: [
                // Title Page
                new Paragraph({
                  text: safeTitle,
                  heading: HeadingLevel.TITLE,
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 2000 },
                }),
                new Paragraph({
                  text: `By ${author}`,
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 1000 },
                }),
                new Paragraph({
                  text: sanitizeDocText(project.description || ""),
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 2000 },
                }),
                // Content
                ...fullContent.flatMap((item) => [
                  new Paragraph({
                    text: sanitizeDocText(item.title),
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 400, after: 200 },
                    pageBreakBefore: true,
                  }),
                  ...stripHtml(item.content)
                    .split("\n")
                    .map((line) => new Paragraph({ text: line.trim(), spacing: { after: 120 } })),
                ]),
              ],
            },
          ],
        });

        const buffer = await Packer.toBuffer(doc);
        trackEvent(ctx.user.id, "document_exported", {
          projectId: input.projectId,
          featureName: "export",
          actionDetail: "docx",
        });
        return {
          filename: `${safeTitle.replace(/\s+/g, "_")}.docx`,
          content: buffer.toString("base64"),
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
      }

      if (input.format === "pdf") {
        const pdfBuffer = await new Promise<Buffer>((resolve) => {
          const doc = new PDFDocument({ margin: 50, bufferPages: true });
          const chunks: any[] = [];
          doc.on("data", (chunk) => chunks.push(chunk));
          doc.on("end", () => resolve(Buffer.concat(chunks)));

          // Title Page
          doc.fontSize(28).font("Helvetica-Bold").text(safeTitle, { align: "center" });
          doc.moveDown();
          doc.fontSize(16).font("Helvetica").text(`By ${author}`, { align: "center" });
          if (project.description) {
            doc.moveDown(2);
            doc.fontSize(12).text(sanitizeDocText(project.description), { align: "center", width: 400 });
          }

          // Content
          fullContent.forEach((item) => {
            doc.addPage();
            doc.fontSize(20).font("Helvetica-Bold").text(sanitizeDocText(item.title));
            doc.moveDown();
            doc.fontSize(12).font("Helvetica").text(stripHtml(item.content), { lineGap: 5 });
          });

          // Page Numbers
          const range = doc.bufferedPageRange();
          for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(10).text(`Page ${i + 1}`, 50, doc.page.height - 50, { align: "center" });
          }

          doc.end();
        });

        trackEvent(ctx.user.id, "document_exported", {
          projectId: input.projectId,
          featureName: "export",
          actionDetail: "pdf",
        });
        return {
          filename: `${safeTitle.replace(/\s+/g, "_")}.pdf`,
          content: pdfBuffer.toString("base64"),
          contentType: "application/pdf",
        };
      }

      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid format" });
    }),

  // Project Backup Export (.zip with structured .docx files)
  projectZip: protectedProcedure
    .input(z.object({ projectId: z.number(), authorName: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const project = db.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

      const author = sanitizeDocText(input.authorName || ctx.user.name || "Unknown Author");
      const safeTitle = sanitizeDocText(project.title);
      const zip = new JSZip();
      const rootFolderName = safeTitle.replace(/\s+/g, "_");
      const root = zip.folder(rootFolderName);

      // 1. Project Overview
      const overviewDoc = await createSimpleDoc(
        safeTitle,
        `Project Backup - ${new Date().toLocaleDateString()}\nAuthor: ${author}\n\nDescription: ${sanitizeDocText(project.description || "N/A")}`
      );
      root?.file("Project_Overview.docx", overviewDoc);

      // 2. Actors Folder (CCM world model)
      const actorsFolder = root?.folder("Actors");
      const actors = db.getProjectActors(input.projectId);
      for (const actor of actors) {
        const attributes = (actor.attributes ?? {}) as Record<string, unknown>;
        let charContent = `Type: ${actor.type}\n\nDescription:\n${actor.description || "N/A"}\n\nAttributes:\n`;
        for (const [k, v] of Object.entries(attributes)) {
          charContent += `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}\n`;
        }
        charContent += `\nCurrent state:\n${JSON.stringify(actor.state ?? {}, null, 2)}\n\nGoals:\n${JSON.stringify(actor.goals ?? {}, null, 2)}\n\nDrives:\n${((actor.drives as string[] | null) ?? []).join(", ") || "N/A"}\n\nNotes:\n${actor.notes || "N/A"}`;

        const actorDoc = await createSimpleDoc(actor.name, charContent);
        actorsFolder?.file(`${actor.name.replace(/\s+/g, "_")}.docx`, actorDoc);
      }

      // 3. World Model Folder (environments + systems)
      const worldFolder = root?.folder("World_Model");
      const environments = db.getProjectEnvironments(input.projectId);
      for (const env of environments) {
        const envDoc = await createSimpleDoc(
          env.name,
          `Type: ${env.type}\n\nState:\n${JSON.stringify(env.state ?? {}, null, 2)}\n\nResources:\n${JSON.stringify(env.resources ?? {}, null, 2)}\n\nActive processes:\n${((env.activeProcesses as string[] | null) ?? []).join(", ") || "N/A"}`
        );
        worldFolder?.folder("Environments")?.file(`${env.name.replace(/\s+/g, "_")}.docx`, envDoc);
      }
      const systems = db.getProjectSystems(input.projectId);
      for (const system of systems) {
        const systemDoc = await createSimpleDoc(
          system.name,
          `Type: ${system.type}\n\nRules:\n${((system.rules as string[] | null) ?? []).join("\n") || "N/A"}\n\nConstraints:\n${((system.constraints as string[] | null) ?? []).join("\n") || "N/A"}\n\nEffects:\n${((system.effects as string[] | null) ?? []).join("\n") || "N/A"}`
        );
        worldFolder?.folder("Systems")?.file(`${system.name.replace(/\s+/g, "_")}.docx`, systemDoc);
      }

      // 4. Scenes Folder (Versions)
      const scenesFolder = root?.folder("Scenes");
      const scenes = db.getProjectScenes(input.projectId);
      for (const scene of scenes) {
        const sceneSubFolder = scenesFolder?.folder(scene.title.replace(/\s+/g, "_"));
        const versions = db.getSceneVersions(scene.id);
        for (const v of versions) {
          const versionDoc = await createSimpleDoc(
            `${scene.title} (${v.versionLabel.toUpperCase()})`,
            v.content
          );
          sceneSubFolder?.file(`${v.versionLabel}_${v.id}.docx`, versionDoc);
        }
      }

      // 5. Full Manuscript (Curated)
      const mainStory = db.getMainStory(input.projectId);
      if (mainStory.length > 0) {
        const fullContent = [];
        for (const item of mainStory) {
          const scene = scenes.find((s) => s.id === item.sceneId);
          const version = db.getVersionById(item.versionId);
          if (scene && version) {
            fullContent.push({ title: scene.title, content: version.content });
          }
        }

        const manuscriptDoc = new Document({
          sections: [
            {
              headers: {
                default: new Header({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: safeTitle, size: 20 })],
                      alignment: AlignmentType.RIGHT,
                    }),
                  ],
                }),
              },
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({ text: "Page ", size: 20 }),
                        new TextRun({ children: [PageNumber.CURRENT], size: 20 }),
                      ],
                    }),
                  ],
                }),
              },
              children: [
                new Paragraph({
                  text: safeTitle,
                  heading: HeadingLevel.TITLE,
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 2000 },
                }),
                new Paragraph({
                  text: `By ${author}`,
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 1000 },
                }),
                ...fullContent.flatMap((item) => [
                  new Paragraph({
                    text: sanitizeDocText(item.title),
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 400, after: 200 },
                    pageBreakBefore: true,
                  }),
                  ...stripHtml(item.content)
                    .split("\n")
                    .map((line) => new Paragraph({ text: line.trim(), spacing: { after: 120 } })),
                ]),
              ],
            },
          ],
        });
        const manuscriptBuffer = await Packer.toBuffer(manuscriptDoc);
        root?.file("Full_Manuscript_Assembly.docx", manuscriptBuffer);
      }

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      return {
        filename: `${safeTitle.replace(/\s+/g, "_")}_backup.zip`,
        content: zipBuffer.toString("base64"),
        contentType: "application/zip",
      };
    }),

  // Single Item Export (Scene Version, Actor, Environment, or System)
  singleItem: protectedProcedure
    .input(
      z.object({
        type: z.enum(["scene_version", "actor", "environment", "system"]),
        id: z.number(),
        format: z.enum(["md", "pdf"]),
        authorName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const author = sanitizeDocText(input.authorName || ctx.user.name || "Unknown Author");
      let title = sanitizeDocText("");
      let content = "";
      let subtitle = "";

      if (input.type === "scene_version") {
        const version = db.getVersionById(input.id);
        if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
        const scene = db.getSceneById(version.sceneId);
        title = sanitizeDocText(scene?.title || "Untitled Scene");
        subtitle = `Scene Version: ${version.versionLabel.toUpperCase()}`;
        content = version.content;
      } else if (input.type === "actor") {
        const actor = db.getActorById(input.id);
        if (!actor) throw new TRPCError({ code: "NOT_FOUND", message: "Actor not found" });
        title = sanitizeDocText(actor.name);
        subtitle = "Actor Profile";
        const attributes = (actor.attributes ?? {}) as Record<string, unknown>;
        let attrHtml = "";
        for (const [k, v] of Object.entries(attributes)) {
          attrHtml += `<p><strong>${k}:</strong> ${typeof v === "object" ? JSON.stringify(v) : v}</p>`;
        }
        content = `<p><strong>Type:</strong> ${actor.type}</p>
                   <p><strong>Description:</strong> ${actor.description || "N/A"}</p>
                   ${attrHtml}
                   <p><strong>State:</strong> ${JSON.stringify(actor.state ?? {})}</p>
                   <p><strong>Goals:</strong> ${JSON.stringify(actor.goals ?? {})}</p>
                   <p><strong>Drives:</strong> ${((actor.drives as string[] | null) ?? []).join(", ") || "N/A"}</p>
                   <p><strong>Notes:</strong> ${actor.notes || "N/A"}</p>`;
      } else if (input.type === "environment") {
        const env = db.getEnvironmentById(input.id);
        if (!env) throw new TRPCError({ code: "NOT_FOUND", message: "Environment not found" });
        title = sanitizeDocText(env.name);
        subtitle = "Environment";
        content = `<p><strong>Type:</strong> ${env.type}</p>
                   <p><strong>State:</strong> ${JSON.stringify(env.state ?? {})}</p>
                   <p><strong>Active processes:</strong> ${((env.activeProcesses as string[] | null) ?? []).join(", ") || "N/A"}</p>`;
      } else if (input.type === "system") {
        const system = db.getSystemById(input.id);
        if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "System not found" });
        title = sanitizeDocText(system.name);
        subtitle = "System";
        content = `<p><strong>Type:</strong> ${system.type}</p>
                   <p><strong>Rules:</strong> ${((system.rules as string[] | null) ?? []).join("; ") || "N/A"}</p>
                   <p><strong>Effects:</strong> ${((system.effects as string[] | null) ?? []).join("; ") || "N/A"}</p>`;
      }

      if (input.format === "md") {
        const markdown = `# ${title}\n${subtitle}\nBy ${author}\n\n---\n\n${stripHtml(content)}`;
        return {
          filename: `${title.replace(/\s+/g, "_")}.md`,
          content: Buffer.from(markdown).toString("base64"),
          contentType: "text/markdown",
        };
      }

      if (input.format === "pdf") {
        const pdfBuffer = await new Promise<Buffer>((resolve) => {
          const doc = new PDFDocument({ margin: 50 });
          const chunks: any[] = [];
          doc.on("data", (chunk) => chunks.push(chunk));
          doc.on("end", () => resolve(Buffer.concat(chunks)));

          doc.fontSize(24).font("Helvetica-Bold").text(title, { align: "center" });
          doc.fontSize(12).font("Helvetica").text(subtitle, { align: "center" });
          doc.moveDown();
          doc.fontSize(10).text(`Author: ${author}`, { align: "center" });
          doc.moveDown(2);
          doc.fontSize(12).font("Helvetica").text(stripHtml(content), { lineGap: 5 });
          doc.end();
        });

        return {
          filename: `${title.replace(/\s+/g, "_")}.pdf`,
          content: pdfBuffer.toString("base64"),
          contentType: "application/pdf",
        };
      }

      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid format" });
    }),
});

async function createSimpleDoc(title: string, content: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, spacing: { after: 400 } }),
          ...stripHtml(content)
            .split("\n")
            .map((line) =>
              new Paragraph({
                children: [new TextRun({ text: line.trim(), size: 24 })],
                spacing: { after: 120 },
              })
            ),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

function stripHtml(html: string) {
  return html
    .replace(/<p>/g, "")
    .replace(/<\/p>/g, "\n\n")
    .replace(/<br\s*\/?>/g, "\n")
    // Convert entity references to explicit markers
    .replace(
      /<span[^>]*data-entity-id="(\d+)"[^>]*data-entity-type="([^"]*)"[^>]*>@([^<]*)<\/span>/gi,
      (_, id: string, type: string, label: string) =>
        `[${type === "character" ? "Character" : "Lore"}: ${label} (ID: ${id})]`
    )
    .replace(/<[^>]*>?/gm, "")
    .trim();
}

/**
 * Sanitizes a user-supplied string before it is interpolated into a document
 * (headers, title page, author line). Strips control characters and anything
 * that could masquerade as a markup/instruction boundary in the exported file.
 */
function sanitizeDocText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}