/**
 * Build the static CCM guidance index.
 *
 * Run with `pnpm build:ccm-index`. This downloads/uses the MiniLM bi-encoder
 * once, writes precomputed section vectors, and is never run by the server.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embedCcmText } from "../server/ccm/embeddings";

type CcmIndexSection = {
  id: string;
  title: string;
  content: string;
  estimatedTokens: number;
  embedding: number[];
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");
const documentPath = path.join(repositoryRoot, "CCM.md");
const outputPath = path.join(repositoryRoot, "server", "ccm", "ccm-index.json");

/**
 * CCM.md currently uses top-level `# 1. TITLE` headers. Supporting dotted
 * numbers also keeps this builder compatible with future `## 2.1 TITLE`
 * structure without treating unnumbered subsections as separate retrieval
 * units.
 */
const numberedSectionHeader = /^#{1,6}\s+(\d+(?:\.\d+)*)\.\s+(.+?)\s*$/gm;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Exclude only framing/meta sections, not operational rules or definitions. */
function isOperationalSection(sectionNumber: string, title: string): boolean {
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (sectionNumber === "0") return false; // Purpose in document variants.
  return ![
    "purpose",
    "author s role",
    "authorial control",
    "what this model does not claim",
  ].includes(normalizedTitle);
}

function parseSections(document: string): Omit<CcmIndexSection, "estimatedTokens" | "embedding">[] {
  const headers = Array.from(document.matchAll(numberedSectionHeader));
  if (headers.length === 0) {
    throw new Error(`No numbered CCM section headers found in ${documentPath}`);
  }

  const ids = new Set<string>();
  return headers.flatMap((header, index) => {
    const sectionNumber = header[1];
    const title = header[2].trim();
    if (!isOperationalSection(sectionNumber, title)) return [];

    const id = slugify(title);
    if (!id) throw new Error(`Could not derive an id from CCM section title: ${title}`);
    if (ids.has(id)) throw new Error(`Duplicate CCM section id: ${id}`);
    ids.add(id);

    const contentStart = (header.index ?? 0) + header[0].length;
    const contentEnd = index + 1 < headers.length ? (headers[index + 1].index ?? document.length) : document.length;
    // Preserve the body exactly as authored, including Markdown and spacing.
    const content = document.slice(contentStart, contentEnd);
    return [{ id, title, content }];
  });
}

async function main(): Promise<void> {
  const document = fs.readFileSync(documentPath, "utf8");
  const sections = parseSections(document);
  const index: CcmIndexSection[] = [];

  for (const section of sections) {
    process.stdout.write(`Embedding ${section.id}\n`);
    index.push({
      ...section,
      estimatedTokens: Math.ceil(section.content.length / 4),
      // Include the title in the search representation while returning the
      // original section body unchanged to callers.
      embedding: await embedCcmText(`${section.title}\n${section.content}`),
    });
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(index)}\n`, "utf8");
  console.log(`Wrote ${index.length} CCM sections to ${path.relative(repositoryRoot, outputPath)}`);
}

main().catch((error) => {
  console.error("Failed to build CCM index:", error);
  process.exitCode = 1;
});
