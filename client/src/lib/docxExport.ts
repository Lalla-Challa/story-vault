import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  PageBreak,
  SectionType,
} from "docx";
import { zipSync } from "fflate";

// ─── types ────────────────────────────────────────────────────────────────────

export interface SceneVersion {
  id: number;
  versionLabel: string;
  content: string;
  createdAt: Date;
}

export interface SceneData {
  id: number;
  title: string;
  description?: string | null;
}

export interface CharacterData {
  name: string;
  age?: string | null;
  description?: string | null;
  abilities?: string | null;
  relationships?: string | null;
  notes?: string | null;
}

export interface WorldNote {
  category: string;
  title: string;
  content: string;
}

export interface MainStoryItem {
  sceneId: number;
  versionId: number;
  order: number;
}

// ─── shared docx helpers ──────────────────────────────────────────────────────

const FONTS = { body: "Garamond", heading: "Garamond" };

function heading1(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 200 },
    run: { font: FONTS.heading, bold: true, size: 36 },
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 120 },
    run: { font: FONTS.heading, bold: true, size: 28 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" } },
  });
}

function heading3(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 300, after: 80 },
    run: { font: FONTS.heading, bold: true, size: 24 },
  });
}

function body(text: string, italic = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONTS.body, size: 24, italics: italic })],
    spacing: { after: 160, line: 360 },
  });
}

function labeledField(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, font: FONTS.body, bold: true, size: 24 }),
      new TextRun({ text: value, font: FONTS.body, size: 24 }),
    ],
    spacing: { after: 120 },
  });
}

function divider(): Paragraph {
  return new Paragraph({
    text: "",
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" } },
    spacing: { before: 200, after: 200 },
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

function versionBadge(label: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: `  ${label.toUpperCase()}  `,
        font: FONTS.body,
        size: 18,
        bold: true,
        color: label === "final" ? "166534" : label === "revised" ? "1D4ED8" : "475569",
        shading: { fill: label === "final" ? "DCFCE7" : label === "revised" ? "DBEAFE" : "F1F5F9" },
      }),
    ],
    spacing: { after: 160 },
  });
}

/** Split content on newlines and produce one Paragraph per line */
function contentParagraphs(text: string): Paragraph[] {
  const lines = text.split("\n");
  return lines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line || " ", font: FONTS.body, size: 24 })],
        spacing: { after: line.trim() === "" ? 0 : 120, line: 360 },
      })
  );
}

function titlePage(projectTitle: string, subtitle: string): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: projectTitle, font: FONTS.heading, bold: true, size: 56 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: subtitle, font: FONTS.heading, size: 28, color: "64748B" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), font: FONTS.body, size: 22, color: "94A3B8" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 0 },
    }),
    pageBreak(),
  ];
}

// ─── document builders ────────────────────────────────────────────────────────

async function buildMainScriptDocx(
  projectTitle: string,
  mainStory: MainStoryItem[],
  scenes: SceneData[],
  allVersionsByScene: Map<number, SceneVersion[]>,
): Promise<Uint8Array> {
  const children: Paragraph[] = [
    ...titlePage(projectTitle, "Main Script"),
  ];

  if (mainStory.length === 0) {
    children.push(body("No scenes have been added to the main story yet.", true));
  } else {
    mainStory.forEach((item, idx) => {
      const scene = scenes.find((s) => s.id === item.sceneId);
      const version = (allVersionsByScene.get(item.sceneId) ?? []).find((v) => v.id === item.versionId);

      children.push(heading2(`${idx + 1}. ${scene?.title ?? "Untitled Scene"}`));
      if (version) {
        children.push(versionBadge(version.versionLabel));
        children.push(...contentParagraphs(version.content));
      } else {
        children.push(body("(version content not found)", true));
      }
      if (idx < mainStory.length - 1) children.push(pageBreak());
    });
  }

  const doc = new Document({
    sections: [{ properties: { type: SectionType.CONTINUOUS }, children }],
  });
  return Packer.toBuffer(doc);
}

async function buildScenesDocx(
  projectTitle: string,
  scenes: SceneData[],
  allVersionsByScene: Map<number, SceneVersion[]>,
): Promise<Uint8Array> {
  const children: Paragraph[] = [
    ...titlePage(projectTitle, "All Scenes & Versions"),
  ];

  if (scenes.length === 0) {
    children.push(body("No scenes yet.", true));
  } else {
    scenes.forEach((scene, sIdx) => {
      const versions = allVersionsByScene.get(scene.id) ?? [];
      children.push(heading2(scene.title));
      if (scene.description) children.push(body(scene.description, true));

      if (versions.length === 0) {
        children.push(body("No versions yet.", true));
      } else {
        versions.forEach((v, vIdx) => {
          children.push(heading3(`Version ${vIdx + 1} — ${new Date(v.createdAt).toLocaleDateString()}`));
          children.push(versionBadge(v.versionLabel));
          children.push(...contentParagraphs(v.content));
          if (vIdx < versions.length - 1) children.push(divider());
        });
      }
      if (sIdx < scenes.length - 1) children.push(pageBreak());
    });
  }

  const doc = new Document({
    sections: [{ properties: { type: SectionType.CONTINUOUS }, children }],
  });
  return Packer.toBuffer(doc);
}

async function buildCharactersDocx(
  projectTitle: string,
  characters: CharacterData[],
): Promise<Uint8Array> {
  const children: Paragraph[] = [
    ...titlePage(projectTitle, "Character Profiles"),
  ];

  if (characters.length === 0) {
    children.push(body("No characters yet.", true));
  } else {
    characters.forEach((c, idx) => {
      children.push(heading2(c.name));
      if (c.age) children.push(labeledField("Age", c.age));
      if (c.description) { children.push(heading3("Description")); children.push(...contentParagraphs(c.description)); }
      if (c.abilities) { children.push(heading3("Abilities & Skills")); children.push(...contentParagraphs(c.abilities)); }
      if (c.relationships) { children.push(heading3("Relationships")); children.push(...contentParagraphs(c.relationships)); }
      if (c.notes) { children.push(heading3("Notes")); children.push(...contentParagraphs(c.notes)); }
      if (idx < characters.length - 1) children.push(pageBreak());
    });
  }

  const doc = new Document({
    sections: [{ properties: { type: SectionType.CONTINUOUS }, children }],
  });
  return Packer.toBuffer(doc);
}

async function buildWorldBuildingDocx(
  projectTitle: string,
  worldNotes: WorldNote[],
): Promise<Uint8Array> {
  const catLabels: Record<string, string> = {
    lore: "Lore",
    location: "Locations",
    magic_system: "Magic Systems",
    faction: "Factions",
    other: "Other",
  };

  const children: Paragraph[] = [
    ...titlePage(projectTitle, "World-Building Notes"),
  ];

  const grouped = worldNotes.reduce((acc, n) => {
    (acc[n.category] ??= []).push(n);
    return acc;
  }, {} as Record<string, WorldNote[]>);

  const catOrder = ["lore", "location", "magic_system", "faction", "other"];
  const entries = catOrder.filter((c) => grouped[c]?.length).map((c) => [c, grouped[c]] as [string, WorldNote[]]);

  if (entries.length === 0) {
    children.push(body("No world-building notes yet.", true));
  } else {
    entries.forEach(([cat, notes], catIdx) => {
      children.push(heading1(catLabels[cat] ?? cat));
      notes.forEach((n, nIdx) => {
        children.push(heading3(n.title));
        children.push(...contentParagraphs(n.content));
        if (nIdx < notes.length - 1) children.push(divider());
      });
      if (catIdx < entries.length - 1) children.push(pageBreak());
    });
  }

  const doc = new Document({
    sections: [{ properties: { type: SectionType.CONTINUOUS }, children }],
  });
  return Packer.toBuffer(doc);
}

// ─── main export function ─────────────────────────────────────────────────────

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9\-_ ]/gi, "").trim().replace(/\s+/g, "_") || "untitled";
}

export async function exportProjectAsZip(
  projectTitle: string,
  mainStory: MainStoryItem[],
  scenes: SceneData[],
  allVersionsByScene: Map<number, SceneVersion[]>,
  characters: CharacterData[],
  worldNotes: WorldNote[],
): Promise<void> {
  const root = sanitize(projectTitle);

  // Build all 4 docx files in parallel
  const [mainScriptBytes, scenesBytes, charactersBytes, worldBytes] = await Promise.all([
    buildMainScriptDocx(projectTitle, mainStory, scenes, allVersionsByScene),
    buildScenesDocx(projectTitle, scenes, allVersionsByScene),
    buildCharactersDocx(projectTitle, characters),
    buildWorldBuildingDocx(projectTitle, worldNotes),
  ]);

  const zipFiles: Record<string, Uint8Array> = {
    [`${root}/Main_Script.docx`]: mainScriptBytes,
    [`${root}/Scenes_and_Versions.docx`]: scenesBytes,
    [`${root}/Characters.docx`]: charactersBytes,
    [`${root}/World_Building.docx`]: worldBytes,
  };

  const zipped = zipSync(zipFiles, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${root}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
