import { posix } from "node:path";
import { gunzipSync } from "node:zlib";

export interface SyncTexNode {
  page: number;
  file: string;
  line: number;
  x: number;
  yTop: number;
  yBaseline: number;
  width: number;
  height: number;
  isBox: boolean;
}

export interface SyncTexIndex {
  files: string[];
  byPage: Map<number, SyncTexNode[]>;
  byFileLine: Map<string, SyncTexNode[]>;
}

const TEX_TO_BP = 65536 * (72.27 / 72);

function normalizeFileRel(rawPath: string, workDir: string): string | null {
  const cleanWorkDir = posix.normalize(workDir.replaceAll("\\", "/"));
  const cleanInput = posix.normalize(rawPath.replaceAll("\\", "/"));
  if (!cleanInput.startsWith("/")) {
    return cleanInput.replace(/^\.\//, "");
  }
  const rel = posix.relative(cleanWorkDir, cleanInput);
  if (!rel || rel.startsWith("..")) {
    return null;
  }
  return rel.replace(/^\.\//, "");
}

export function parseSyncTexGz(
  gzBuffer: Buffer,
  workDir: string,
): SyncTexIndex | null {
  try {
    const rawText = gunzipSync(gzBuffer).toString("utf-8");
    const lines = rawText.split("\n");

    const inputFiles = new Map<number, string>();
    const byPage = new Map<number, SyncTexNode[]>();
    const byFileLine = new Map<string, SyncTexNode[]>();

    let magnification = 1000;
    let unit = 1;
    let xOffset = 0;
    let yOffset = 0;
    let currentPage = 0;
    let inContent = false;

    const addNode = (node: SyncTexNode) => {
      let pageList = byPage.get(node.page);
      if (!pageList) {
        pageList = [];
        byPage.set(node.page, pageList);
      }
      pageList.push(node);

      const key = `${node.file}:${node.line}`;
      let flList = byFileLine.get(key);
      if (!flList) {
        flList = [];
        byFileLine.set(key, flList);
      }
      flList.push(node);
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith("Input:")) {
        const rest = line.slice(6);
        const sep = rest.indexOf(":");
        if (sep > 0) {
          const id = Number.parseInt(rest.slice(0, sep), 10);
          const pathPart = rest.slice(sep + 1);
          const rel = normalizeFileRel(pathPart, workDir);
          if (rel && Number.isFinite(id)) {
            inputFiles.set(id, rel);
          }
        }
        continue;
      }

      if (!inContent) {
        if (line === "Content:") {
          inContent = true;
          continue;
        }
        if (line.startsWith("Magnification:")) {
          magnification = Number.parseFloat(line.slice(14)) || 1000;
        } else if (line.startsWith("Unit:")) {
          unit = Number.parseFloat(line.slice(5)) || 1;
        } else if (line.startsWith("X Offset:")) {
          xOffset = Number.parseFloat(line.slice(9)) || 0;
        } else if (line.startsWith("Y Offset:")) {
          yOffset = Number.parseFloat(line.slice(9)) || 0;
        }
        continue;
      }

      if (line.startsWith("{")) {
        currentPage = Number.parseInt(line.slice(1), 10) || 0;
        continue;
      }
      if (line === "}" || currentPage <= 0) {
        if (line === "}") currentPage = 0;
        continue;
      }

      const scale = ((unit || 1) * (magnification / 1000)) / TEX_TO_BP;
      const xOffPt = xOffset * scale;
      const yOffPt = yOffset * scale;

      const firstChar = line[0];
      if (firstChar === "(") {
        // hbox record: (<input>,<line>:<h>,<v>:<W>,<H>,<D>
        const match = line.match(
          /^\((\d+),(\d+):(-?\d+),(-?\d+):(-?\d+),(-?\d+),(-?\d+)/,
        );
        if (match) {
          const inputId = Number.parseInt(match[1], 10);
          const file = inputFiles.get(inputId);
          const srcLine = Number.parseInt(match[2], 10);
          if (!file || srcLine <= 0) continue;

          const h = Number.parseFloat(match[3]) * scale + xOffPt;
          const v = Number.parseFloat(match[4]) * scale + yOffPt;
          const W = Number.parseFloat(match[5]) * scale;
          const H = Number.parseFloat(match[6]) * scale;
          const D = Number.parseFloat(match[7]) * scale;

          addNode({
            page: currentPage,
            file,
            line: srcLine,
            x: h,
            yTop: v - H,
            yBaseline: v,
            width: Math.max(0, W),
            height: Math.max(4, H + D),
            isBox: true,
          });
        }
      } else if (
        firstChar === "x" ||
        firstChar === "h" ||
        firstChar === "g" ||
        firstChar === "k"
      ) {
        const match = line.match(/^[xhgk](\d+),(\d+):(-?\d+),(-?\d+)/);
        if (match) {
          const inputId = Number.parseInt(match[1], 10);
          const file = inputFiles.get(inputId);
          const srcLine = Number.parseInt(match[2], 10);
          if (!file || srcLine <= 0) continue;

          const h = Number.parseFloat(match[3]) * scale + xOffPt;
          const v = Number.parseFloat(match[4]) * scale + yOffPt;

          addNode({
            page: currentPage,
            file,
            line: srcLine,
            x: h,
            yTop: v - 10,
            yBaseline: v,
            width: 12,
            height: 12,
            isBox: false,
          });
        }
      }
    }

    return {
      files: Array.from(new Set(inputFiles.values())),
      byPage,
      byFileLine,
    };
  } catch {
    return null;
  }
}

export function inverseLookupSyncTex(
  index: SyncTexIndex,
  page: number,
  xPt: number,
  yPt: number,
): { file: string; line: number } | null {
  const nodes = index.byPage.get(page);
  if (!nodes || nodes.length === 0) return null;

  // 1. Prefer smallest enclosing hbox containing (xPt, yPt)
  let bestEnclosing: SyncTexNode | null = null;
  let bestEnclosingScore = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    if (!node.isBox || node.width <= 0) continue;
    const withinX = xPt >= node.x - 4 && xPt <= node.x + node.width + 4;
    const withinY = yPt >= node.yTop - 3 && yPt <= node.yTop + node.height + 3;
    if (!withinX || !withinY) continue;

    // Prefer tighter boxes and lines close to vertical center
    const area = node.width * node.height;
    const centerY = node.yTop + node.height / 2;
    const score = area + Math.abs(yPt - centerY) * 50;
    if (score < bestEnclosingScore) {
      bestEnclosingScore = score;
      bestEnclosing = node;
    }
  }

  // Refine with nearest leaf node sharing a nearby vertical band inside the enclosing box
  if (bestEnclosing) {
    let bestLeaf: SyncTexNode | null = null;
    let bestLeafDist = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      if (node.isBox) continue;
      if (Math.abs(node.yBaseline - bestEnclosing.yBaseline) > 12) continue;
      const dist = Math.hypot(xPt - node.x, (yPt - node.yBaseline) * 2);
      if (dist < bestLeafDist) {
        bestLeafDist = dist;
        bestLeaf = node;
      }
    }
    const chosen = bestLeaf && bestLeafDist < 48 ? bestLeaf : bestEnclosing;
    return { file: chosen.file, line: chosen.line };
  }

  // 2. Fallback: nearest node on the page
  let nearest: SyncTexNode | null = null;
  let minDist = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const cx = node.isBox
      ? Math.max(node.x, Math.min(xPt, node.x + node.width))
      : node.x;
    const cy = node.yTop + node.height / 2;
    const dist = Math.hypot(xPt - cx, (yPt - cy) * 1.5);
    if (dist < minDist) {
      minDist = dist;
      nearest = node;
    }
  }

  return nearest ? { file: nearest.file, line: nearest.line } : null;
}

export function forwardLookupSyncTex(
  index: SyncTexIndex,
  rawFile: string,
  targetLine: number,
): {
  page: number;
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  file: string;
  line: number;
} | null {
  const cleanFile = rawFile.replaceAll("\\", "/").replace(/^\.\//, "");
  const matchedFile =
    index.files.find((f) => f === cleanFile) ??
    index.files.find((f) => f.endsWith(`/${cleanFile}`)) ??
    index.files.find((f) => cleanFile.endsWith(`/${f}`));

  if (!matchedFile) return null;

  // Search target line, then closest lines within +-8 lines (for blank/\label lines)
  for (let delta = 0; delta <= 8; delta++) {
    const candidates =
      delta === 0 ? [targetLine] : [targetLine + delta, targetLine - delta];
    for (const candidateLine of candidates) {
      if (candidateLine <= 0) continue;
      const list = index.byFileLine.get(`${matchedFile}:${candidateLine}`);
      if (!list || list.length === 0) continue;

      const box = list.find((n) => n.isBox && n.width > 0) ?? list[0];
      return {
        page: box.page,
        xPt: box.x,
        yPt: box.yTop,
        widthPt: Math.max(box.width, 120),
        heightPt: Math.max(box.height, 14),
        file: matchedFile,
        line: candidateLine,
      };
    }
  }

  return null;
}
