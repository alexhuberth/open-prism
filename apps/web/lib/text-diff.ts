export interface DiffLine {
  type: "context" | "added" | "removed";
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  id: string;
  lines: DiffLine[];
}

export interface ParsedLatexError {
  line?: number;
  message: string;
}

export function computeLineDiff(before: string, after: string): DiffLine[] {
  const oldLines = before === "" ? [] : before.split("\n");
  const newLines = after === "" ? [] : after.split("\n");

  const m = oldLines.length;
  const n = newLines.length;

  // Para archivos muy grandes, evitar matriz O(m*n) recortando prefijo/sufijo común.
  let prefix = 0;
  while (prefix < m && prefix < n && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < m - prefix &&
    suffix < n - prefix &&
    oldLines[m - 1 - suffix] === newLines[n - 1 - suffix]
  ) {
    suffix++;
  }

  const result: DiffLine[] = [];

  for (let i = 0; i < prefix; i++) {
    result.push({
      type: "context",
      text: oldLines[i],
      oldLine: i + 1,
      newLine: i + 1,
    });
  }

  const midOld = oldLines.slice(prefix, m - suffix);
  const midNew = newLines.slice(prefix, n - suffix);
  const midM = midOld.length;
  const midN = midNew.length;

  if (midM * midN > 250000) {
    for (let i = 0; i < midM; i++) {
      result.push({
        type: "removed",
        text: midOld[i],
        oldLine: prefix + i + 1,
      });
    }
    for (let j = 0; j < midN; j++) {
      result.push({
        type: "added",
        text: midNew[j],
        newLine: prefix + j + 1,
      });
    }
  } else {
    const dp: Uint32Array[] = Array.from(
      { length: midM + 1 },
      () => new Uint32Array(midN + 1),
    );

    for (let i = midM - 1; i >= 0; i--) {
      for (let j = midN - 1; j >= 0; j--) {
        if (midOld[i] === midNew[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < midM && j < midN) {
      if (midOld[i] === midNew[j]) {
        result.push({
          type: "context",
          text: midOld[i],
          oldLine: prefix + i + 1,
          newLine: prefix + j + 1,
        });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        result.push({
          type: "removed",
          text: midOld[i],
          oldLine: prefix + i + 1,
        });
        i++;
      } else {
        result.push({
          type: "added",
          text: midNew[j],
          newLine: prefix + j + 1,
        });
        j++;
      }
    }

    while (i < midM) {
      result.push({
        type: "removed",
        text: midOld[i],
        oldLine: prefix + i + 1,
      });
      i++;
    }

    while (j < midN) {
      result.push({
        type: "added",
        text: midNew[j],
        newLine: prefix + j + 1,
      });
      j++;
    }
  }

  for (let s = 0; s < suffix; s++) {
    const oldIdx = m - suffix + s;
    const newIdx = n - suffix + s;
    result.push({
      type: "context",
      text: oldLines[oldIdx],
      oldLine: oldIdx + 1,
      newLine: newIdx + 1,
    });
  }

  return result;
}

export function buildDiffHunks(
  lines: DiffLine[],
  contextRadius = 3,
): DiffHunk[] {
  const changedIndices: number[] = [];
  lines.forEach((line, idx) => {
    if (line.type !== "context") {
      changedIndices.push(idx);
    }
  });

  if (changedIndices.length === 0) return [];

  const ranges: [number, number][] = [];
  for (const idx of changedIndices) {
    const start = Math.max(0, idx - contextRadius);
    const end = Math.min(lines.length - 1, idx + contextRadius);
    const prev = ranges[ranges.length - 1];
    if (prev && start <= prev[1] + 1) {
      prev[1] = Math.max(prev[1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  return ranges.map(([start, end], i) => ({
    id: `hunk-${i}-${start}`,
    lines: lines.slice(start, end + 1),
  }));
}

export function computeDiffSummary(lines: DiffLine[]): {
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === "added") added++;
    else if (line.type === "removed") removed++;
  }
  return { added, removed };
}

export function parseLatexLogErrors(details: string): ParsedLatexError[] {
  if (!details) return [];
  const lines = details.split("\n");
  const errors: ParsedLatexError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("!")) {
      let lineNumber: number | undefined;
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        const match = lines[j].match(/^l\.(\d+)\b/);
        if (match) {
          lineNumber = Number.parseInt(match[1], 10);
          break;
        }
      }
      errors.push({
        line: lineNumber,
        message: line.replace(/^!\s*/, ""),
      });
    } else {
      const lineMatch = line.match(/^l\.(\d+)\s+(.*)$/);
      if (lineMatch && errors.length === 0) {
        errors.push({
          line: Number.parseInt(lineMatch[1], 10),
          message: lineMatch[2] || line,
        });
      }
    }
  }

  return errors.slice(0, 8);
}
