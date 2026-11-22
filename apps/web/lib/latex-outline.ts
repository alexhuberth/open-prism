import { isTextFile, isTexFile, type ProjectFile } from "@/lib/project-files";

export interface GlobalOutlineItem {
  fileId: string;
  fileName: string;
  level: number;
  title: string;
  line: number;
  offset: number;
}

export interface ProjectSearchMatch {
  fileId: string;
  fileName: string;
  line: number;
  offset: number;
  preview: string;
}

const SECTION_LEVEL_MAP: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
};

const SECTION_REGEX =
  /\\(part|chapter|section|subsection|subsubsection)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/;

const INPUT_REGEX = /^\s*\\(?:input|include)\s*\{([^}]+)\}/;

function resolveTexInclude(
  rawTarget: string,
  texFiles: ProjectFile[],
): ProjectFile | undefined {
  const cleaned = rawTarget
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
  const candidates = [cleaned, `${cleaned}.tex`];
  for (const candidate of candidates) {
    const exact = texFiles.find((f) => f.name === candidate);
    if (exact) return exact;
  }
  return undefined;
}

function collectFileOutline(
  file: ProjectFile,
  texFiles: ProjectFile[],
  visitedIds: Set<string>,
  out: GlobalOutlineItem[],
) {
  if (visitedIds.has(file.id)) return;
  visitedIds.add(file.id);

  const text = file.content ?? "";
  const lines = text.split("\n");
  let runningOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmed = lineText.trim();

    if (!trimmed.startsWith("%")) {
      const sectionMatch = lineText.match(SECTION_REGEX);
      if (sectionMatch) {
        const [, cmd, title] = sectionMatch;
        out.push({
          fileId: file.id,
          fileName: file.name,
          level: SECTION_LEVEL_MAP[cmd] ?? 2,
          title: title.trim() || cmd,
          line: i + 1,
          offset: runningOffset,
        });
      }

      const inputMatch = lineText.match(INPUT_REGEX);
      if (inputMatch) {
        const included = resolveTexInclude(inputMatch[1], texFiles);
        if (included) {
          collectFileOutline(included, texFiles, visitedIds, out);
        }
      }
    }

    runningOffset += lineText.length + 1;
  }
}

export function buildProjectOutline(
  files: ProjectFile[],
  mainFileId: string | null,
): GlobalOutlineItem[] {
  const texFiles = files.filter((f) => isTexFile(f));
  if (texFiles.length === 0) return [];

  const mainFile =
    texFiles.find((f) => f.id === mainFileId) ??
    texFiles.find((f) => f.name === "main.tex" || f.name === "document.tex") ??
    texFiles[0];

  const visited = new Set<string>();
  const items: GlobalOutlineItem[] = [];

  collectFileOutline(mainFile, texFiles, visited, items);

  // Append any unreferenced .tex files so standalone drafts stay navigable
  for (const file of texFiles) {
    if (!visited.has(file.id)) {
      collectFileOutline(file, texFiles, visited, items);
    }
  }

  return items;
}

export function countProjectWords(files: ProjectFile[]): number {
  let total = 0;
  for (const file of files) {
    if (!isTexFile(file)) continue;
    const raw = file.content ?? "";
    // Remove LaTeX comments and command names while keeping prose inside braces
    const stripped = raw
      .replace(/%.*$/gm, " ")
      .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, " ")
      .replace(/[{}[\]$&^_~\\]/g, " ");
    const matches = stripped.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
    if (matches) {
      total += matches.length;
    }
  }
  return total;
}

export function searchAcrossProjectFiles(
  files: ProjectFile[],
  rawQuery: string,
  maxMatches = 120,
): ProjectSearchMatch[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const results: ProjectSearchMatch[] = [];
  for (const file of files) {
    if (!isTextFile(file)) continue;
    const text = file.content ?? "";
    const lines = text.split("\n");
    let runningOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const matchCol = lineText.toLowerCase().indexOf(query);
      if (matchCol !== -1) {
        results.push({
          fileId: file.id,
          fileName: file.name,
          line: i + 1,
          offset: runningOffset + matchCol,
          preview: lineText.trim().slice(0, 140),
        });
        if (results.length >= maxMatches) return results;
      }
      runningOffset += lineText.length + 1;
    }
  }

  return results;
}
