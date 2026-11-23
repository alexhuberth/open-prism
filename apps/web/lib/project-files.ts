import JSZip from "jszip";

export type ProjectFileType = "tex" | "text" | "image" | "binary";

export interface ProjectFile {
  id: string;
  name: string;
  type: ProjectFileType;
  content?: string;
  dataUrl?: string;
}

export interface ImportedProjectData {
  files: Omit<ProjectFile, "id">[];
  suggestedMainName?: string;
}

export interface FileTreeFolderNode {
  kind: "folder";
  name: string;
  path: string;
  children: FileTreeNode[];
}

export interface FileTreeFileNode {
  kind: "file";
  name: string;
  path: string;
  file: ProjectFile;
}

export type FileTreeNode = FileTreeFolderNode | FileTreeFileNode;

const TEXT_EXTENSIONS = new Set([
  "tex",
  "bib",
  "sty",
  "cls",
  "bst",
  "bbx",
  "cbx",
  "lbx",
  "dtx",
  "ins",
  "tikz",
  "ist",
  "txt",
  "md",
  "csv",
  "tsv",
  "dat",
  "json",
  "cfg",
  "def",
  "ltx",
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "jfif",
  "gif",
  "webp",
  "svg",
  "bmp",
  "tif",
  "tiff",
]);

const BINARY_EXTENSIONS = new Set([
  "pdf",
  "eps",
  "ttf",
  "otf",
  "woff",
  "woff2",
]);

const IGNORED_PATH_SEGMENTS = new Set([
  "__MACOSX",
  ".git",
  "node_modules",
  ".next",
]);

const IGNORED_FILE_NAMES = new Set([".DS_Store", "Thumbs.db"]);

export function getFileExtension(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return base.slice(dotIndex + 1).toLowerCase();
}

export function normalizeRelativePath(rawPath: string): string | null {
  const cleaned = rawPath
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();

  if (!cleaned) return null;

  const segments = cleaned.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some(
      (s) => s === "." || s === ".." || IGNORED_PATH_SEGMENTS.has(s),
    )
  ) {
    return null;
  }

  const fileName = segments[segments.length - 1];
  if (IGNORED_FILE_NAMES.has(fileName)) return null;

  return segments.join("/");
}

export function classifyFileName(path: string): ProjectFileType | null {
  const ext = getFileExtension(path);
  if (ext === "tex") return "tex";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  return null;
}

export function isTextFile(file: Pick<ProjectFile, "type">): boolean {
  return file.type === "tex" || file.type === "text";
}

export function isImageFile(file: Pick<ProjectFile, "type">): boolean {
  return file.type === "image";
}

export function isTexFile(file: Pick<ProjectFile, "type" | "name">): boolean {
  return file.type === "tex" || file.name.toLowerCase().endsWith(".tex");
}

function getMimeType(path: string): string {
  const ext = getFileExtension(path);
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    pdf: "application/pdf",
    eps: "application/postscript",
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}

function uint8ArrayToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function extractBase64FromDataUrl(dataUrl: string): string {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return base64.replace(/\s/g, "");
}

function stripSingleCommonRoot(
  entries: { path: string; file: Omit<ProjectFile, "id"> }[],
): { path: string; file: Omit<ProjectFile, "id"> }[] {
  if (entries.length === 0) return entries;
  const firstSlash = entries[0].path.indexOf("/");
  if (firstSlash === -1) return entries;

  const candidatePrefix = entries[0].path.slice(0, firstSlash + 1);
  const allSharePrefix = entries.every(
    (e) =>
      e.path.startsWith(candidatePrefix) &&
      e.path.length > candidatePrefix.length,
  );

  if (!allSharePrefix) return entries;

  return entries.map((e) => {
    const stripped = e.path.slice(candidatePrefix.length);
    return {
      path: stripped,
      file: { ...e.file, name: stripped },
    };
  });
}

export function detectMainTexFileName(
  files: Pick<ProjectFile, "name" | "type" | "content">[],
): string | undefined {
  const texFiles = files.filter((f) => isTexFile(f));
  if (texFiles.length === 0) return undefined;

  const preferredNames = [
    "main.tex",
    "document.tex",
    "index.tex",
    "thesis.tex",
    "tesis.tex",
    "paper.tex",
  ];
  const withDocClass = texFiles.filter((f) =>
    /\\documentclass\b/.test(f.content ?? ""),
  );

  for (const preferred of preferredNames) {
    const exact = withDocClass.find((f) => f.name.toLowerCase() === preferred);
    if (exact) return exact.name;
  }

  const rootWithDocClass = withDocClass.find((f) => !f.name.includes("/"));
  if (rootWithDocClass) return rootWithDocClass.name;
  if (withDocClass.length > 0) return withDocClass[0].name;

  for (const preferred of preferredNames) {
    const exact = texFiles.find((f) => f.name.toLowerCase() === preferred);
    if (exact) return exact.name;
  }

  return texFiles[0].name;
}

export async function importZipArchive(
  zipFile: File,
): Promise<ImportedProjectData> {
  const buffer = await zipFile.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const collected: { path: string; file: Omit<ProjectFile, "id"> }[] = [];

  for (const [rawPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const normalized = normalizeRelativePath(rawPath);
    if (!normalized) continue;

    const fileType = classifyFileName(normalized);
    if (!fileType) continue;

    if (fileType === "tex" || fileType === "text") {
      const content = (await entry.async("string")).replace(/\r\n?/g, "\n");
      collected.push({
        path: normalized,
        file: { name: normalized, type: fileType, content },
      });
    } else {
      const bytes = await entry.async("uint8array");
      const dataUrl = uint8ArrayToDataUrl(bytes, getMimeType(normalized));
      collected.push({
        path: normalized,
        file: { name: normalized, type: fileType, dataUrl },
      });
    }
  }

  const stripped = stripSingleCommonRoot(collected).map((e) => e.file);
  return {
    files: stripped,
    suggestedMainName: detectMainTexFileName(stripped),
  };
}

async function readBrowserFile(
  file: File,
  relativePath: string,
): Promise<{ path: string; file: Omit<ProjectFile, "id"> } | null> {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return null;

  let fileType = classifyFileName(normalized);
  if (!fileType && file.type.startsWith("image/")) {
    fileType = "image";
  }
  if (!fileType) return null;

  if (fileType === "tex" || fileType === "text") {
    const content = (await file.text()).replace(/\r\n?/g, "\n");
    return {
      path: normalized,
      file: { name: normalized, type: fileType, content },
    };
  }

  const buffer = await file.arrayBuffer();
  const dataUrl = uint8ArrayToDataUrl(
    new Uint8Array(buffer),
    file.type || getMimeType(normalized),
  );
  return {
    path: normalized,
    file: { name: normalized, type: fileType, dataUrl },
  };
}

export async function importFileList(
  fileList: FileList,
  options?: { stripWrapperDir?: boolean },
): Promise<ImportedProjectData> {
  const rawFiles = Array.from(fileList);

  if (
    rawFiles.length === 1 &&
    rawFiles[0].name.toLowerCase().endsWith(".zip")
  ) {
    return importZipArchive(rawFiles[0]);
  }

  const collected: { path: string; file: Omit<ProjectFile, "id"> }[] = [];

  for (const file of rawFiles) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const zipResult = await importZipArchive(file);
      for (const zf of zipResult.files) {
        collected.push({ path: zf.name, file: zf });
      }
      continue;
    }

    const relPath =
      file.webkitRelativePath && file.webkitRelativePath.length > 0
        ? file.webkitRelativePath
        : file.name;
    const item = await readBrowserFile(file, relPath);
    if (item) collected.push(item);
  }

  const finalEntries = options?.stripWrapperDir
    ? stripSingleCommonRoot(collected)
    : collected;
  const files = finalEntries.map((e) => e.file);

  return {
    files,
    suggestedMainName: detectMainTexFileName(files),
  };
}

async function readDirectoryEntry(
  entry: FileSystemEntry,
  basePath: string,
): Promise<{ path: string; file: Omit<ProjectFile, "id"> }[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    const relPath = basePath ? `${basePath}/${file.name}` : file.name;
    const parsed = await readBrowserFile(file, relPath);
    return parsed ? [parsed] : [];
  }

  if (entry.isDirectory) {
    if (IGNORED_PATH_SEGMENTS.has(entry.name)) return [];
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const allEntries: FileSystemEntry[] = [];

    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (batch.length === 0) break;
      allEntries.push(...batch);
    }

    const nestedBase = basePath ? `${basePath}/${entry.name}` : entry.name;
    const nestedResults = await Promise.all(
      allEntries.map((child) => readDirectoryEntry(child, nestedBase)),
    );
    return nestedResults.flat();
  }

  return [];
}

export async function importDroppedDataTransfer(
  dataTransfer: DataTransfer,
): Promise<ImportedProjectData> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => entry != null);

  if (entries.length === 0) {
    return importFileList(dataTransfer.files);
  }

  if (
    entries.length === 1 &&
    entries[0].isFile &&
    entries[0].name.toLowerCase().endsWith(".zip")
  ) {
    const file = await new Promise<File>((resolve, reject) => {
      (entries[0] as FileSystemFileEntry).file(resolve, reject);
    });
    return importZipArchive(file);
  }

  const hasSingleDirectory = entries.length === 1 && entries[0].isDirectory;

  const collected = (
    await Promise.all(entries.map((entry) => readDirectoryEntry(entry, "")))
  ).flat();

  const finalEntries = hasSingleDirectory
    ? stripSingleCommonRoot(collected)
    : collected;
  const files = finalEntries.map((e) => e.file);

  return {
    files,
    suggestedMainName: detectMainTexFileName(files),
  };
}

export async function exportProjectAsZip(
  projectName: string,
  files: ProjectFile[],
): Promise<void> {
  const zip = new JSZip();

  for (const file of files) {
    if (isTextFile(file)) {
      zip.file(file.name, file.content ?? "");
    } else if (file.dataUrl) {
      zip.file(file.name, extractBase64FromDataUrl(file.dataUrl), {
        base64: true,
      });
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const safeName =
    projectName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "proyecto-latex";

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function buildFileTree(files: ProjectFile[]): FileTreeNode[] {
  const root: FileTreeFolderNode = {
    kind: "folder",
    name: "",
    path: "",
    children: [],
  };

  for (const file of files) {
    const parts = file.name.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      const folderPath = parts.slice(0, i + 1).join("/");
      let nextFolder = current.children.find(
        (c): c is FileTreeFolderNode =>
          c.kind === "folder" && c.name === folderName,
      );
      if (!nextFolder) {
        nextFolder = {
          kind: "folder",
          name: folderName,
          path: folderPath,
          children: [],
        };
        current.children.push(nextFolder);
      }
      current = nextFolder;
    }

    current.children.push({
      kind: "file",
      name: parts[parts.length - 1],
      path: file.name,
      file,
    });
  }

  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes
      .map((node) =>
        node.kind === "folder"
          ? { ...node, children: sortNodes(node.children) }
          : node,
      )
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name, "es");
      });
  };

  return sortNodes(root.children);
}
