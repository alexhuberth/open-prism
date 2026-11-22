export interface MathExpressionMatch {
  tex: string;
  displayMode: boolean;
  from: number;
  to: number;
}

const DISPLAY_ENV_NAMES = [
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "flalign",
  "flalign*",
  "eqnarray",
  "eqnarray*",
];

function sanitizeMathForKatex(raw: string, envName?: string): string {
  let cleaned = raw
    .replace(/\\label\s*\{[^}]*\}/g, "")
    .replace(/\\tag\*?\s*\{[^}]*\}/g, "")
    .replace(/\\nonumber\b/g, "")
    .replace(/\\notag\b/g, "")
    .trim();

  if (
    envName &&
    (envName.startsWith("align") || envName.startsWith("flalign"))
  ) {
    cleaned = `\\begin{aligned}\n${cleaned}\n\\end{aligned}`;
  } else if (envName?.startsWith("gather")) {
    cleaned = `\\begin{gathered}\n${cleaned}\n\\end{gathered}`;
  }

  return cleaned;
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  let i = index - 1;
  while (i >= 0 && text[i] === "\\") {
    backslashes++;
    i--;
  }
  return backslashes % 2 === 1;
}

export function findMathExpressionAtCursor(
  content: string,
  cursorPos: number,
): MathExpressionMatch | null {
  if (!content || cursorPos < 0 || cursorPos > content.length) return null;

  // 1. Check display environments (\begin{equation}...\end{equation}, etc.)
  const envPattern = new RegExp(
    `\\\\begin\\{(${DISPLAY_ENV_NAMES.map((e) => e.replace("*", "\\*")).join("|")})\\}([\\s\\S]*?)\\\\end\\{\\1\\}`,
    "g",
  );
  for (const match of content.matchAll(envPattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (cursorPos >= start && cursorPos <= end) {
      const tex = sanitizeMathForKatex(match[2], match[1]);
      if (!tex) return null;
      return { tex, displayMode: true, from: start, to: end };
    }
  }

  // 2. Check \[ ... \]
  const bracketDisplayRegex = /\\\[([\s\S]*?)\\\]/g;
  for (const match of content.matchAll(bracketDisplayRegex)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (cursorPos >= start && cursorPos <= end) {
      const tex = sanitizeMathForKatex(match[1]);
      if (!tex) return null;
      return { tex, displayMode: true, from: start, to: end };
    }
  }

  // 3. Check $$ ... $$
  const doubleDollarRegex = /\$\$([\s\S]*?)\$\$/g;
  for (const match of content.matchAll(doubleDollarRegex)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (isEscaped(content, start)) continue;
    if (cursorPos >= start && cursorPos <= end) {
      const tex = sanitizeMathForKatex(match[1]);
      if (!tex) return null;
      return { tex, displayMode: true, from: start, to: end };
    }
  }

  // 4. Check \( ... \)
  const parenInlineRegex = /\\\(([\s\S]*?)\\\)/g;
  for (const match of content.matchAll(parenInlineRegex)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (cursorPos >= start && cursorPos <= end) {
      const tex = sanitizeMathForKatex(match[1]);
      if (!tex) return null;
      return { tex, displayMode: false, from: start, to: end };
    }
  }

  // 5. Check single-line $ ... $ around the cursor's current line
  const lineStart = content.lastIndexOf("\n", Math.max(0, cursorPos - 1)) + 1;
  const lineEndIdx = content.indexOf("\n", cursorPos);
  const lineEnd = lineEndIdx === -1 ? content.length : lineEndIdx;
  const line = content.slice(lineStart, lineEnd);

  // Skip commented-out text
  const relCursor = cursorPos - lineStart;
  for (let i = 0; i < relCursor; i++) {
    if (line[i] === "%" && !isEscaped(line, i)) {
      return null;
    }
  }

  // Scan paired single $ delimiters on this line
  let openIdx: number | null = null;
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "$" || isEscaped(line, i)) continue;
    if (line[i + 1] === "$") {
      i++;
      continue;
    }

    if (openIdx === null) {
      openIdx = i;
    } else {
      const absStart = lineStart + openIdx;
      const absEnd = lineStart + i + 1;
      if (cursorPos >= absStart && cursorPos <= absEnd) {
        const tex = sanitizeMathForKatex(line.slice(openIdx + 1, i));
        if (!tex) return null;
        return { tex, displayMode: false, from: absStart, to: absEnd };
      }
      openIdx = null;
    }
  }

  return null;
}
