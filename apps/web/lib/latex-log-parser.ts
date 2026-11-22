import type { LatexCompiler } from "@/lib/latex-compiler";

export type DiagnosticSeverity = "error" | "warning";

export interface CompileDiagnosticItem {
  id: string;
  severity: DiagnosticSeverity;
  title: string;
  file?: string;
  line?: number;
  isProjectFile: boolean;
  excerpt: string;
  suggestedCompiler?: LatexCompiler;
}

export interface CompileAnalysisResult {
  diagnostics: CompileDiagnosticItem[];
  errorCount: number;
  warningCount: number;
  suggestedCompiler: LatexCompiler | null;
  engineHintTitle: string | null;
  engineHintDescription: string | null;
}

function normalizeLogFileToken(rawToken: string): string {
  let clean = rawToken.trim().replace(/^"+|"+$/g, "");
  clean = clean.replaceAll("\\", "/");
  clean = clean.replace(/^\/tmp\/latex-[a-f0-9-]+\//i, "");
  clean = clean.replace(
    /^\/var\/folders\/[^/]+\/[^/]+\/[^/]+\/latex-[a-f0-9-]+\//i,
    "",
  );
  clean = clean.replace(/^\.\//, "");
  return clean;
}

function matchProjectFile(
  candidate: string | undefined,
  projectFileNames: string[],
): { resolved: string | undefined; isProjectFile: boolean } {
  if (!candidate) return { resolved: undefined, isProjectFile: false };
  const normalized = normalizeLogFileToken(candidate);
  const direct = projectFileNames.find((name) => name === normalized);
  if (direct) return { resolved: direct, isProjectFile: true };

  const suffixMatch = projectFileNames.find(
    (name) =>
      normalized.endsWith(`/${name}`) || name.endsWith(`/${normalized}`),
  );
  if (suffixMatch) return { resolved: suffixMatch, isProjectFile: true };

  const base = normalized.split("/").pop() || normalized;
  return { resolved: base, isProjectFile: false };
}

function detectSuggestedCompiler(
  sourceText: string,
  currentCompiler: LatexCompiler,
): LatexCompiler | null {
  if (currentCompiler !== "pdflatex") return null;
  if (
    /cannot-use-pdftex|fontspec package requires either XeTeX or LuaTeX|requires XeTeX or LuaTeX|unicode-math.*XeTeX|xunicode.*XeTeX|Fatal Package (?:fontspec|polyglossia) Error|\\babelfont/i.test(
      sourceText,
    )
  ) {
    return "xelatex";
  }
  return null;
}

function updateParenFileStack(line: string, stack: string[]): void {
  const tokenRegex =
    /\(([^()\s"']+\.(?:tex|sty|cls|bib|bbl|fd|def|clo|cfg))|\)/g;
  let match = tokenRegex.exec(line);
  while (match) {
    if (match[1]) {
      stack.push(match[1]);
    } else if (match[0] === ")" && stack.length > 0) {
      stack.pop();
    }
    match = tokenRegex.exec(line);
  }
}

export function analyzeCompileDiagnostics(params: {
  fullLog?: string | null;
  compileError?: string | null;
  compileWarnings?: string[];
  compiler: LatexCompiler;
  projectFileNames: string[];
  mainFileName?: string;
}): CompileAnalysisResult {
  const {
    fullLog,
    compileError,
    compileWarnings = [],
    compiler,
    projectFileNames,
    mainFileName,
  } = params;

  const combinedSource = [fullLog ?? "", compileError ?? ""]
    .filter(Boolean)
    .join("\n");
  const suggestedCompiler = detectSuggestedCompiler(combinedSource, compiler);
  const diagnostics: CompileDiagnosticItem[] = [];
  const seenKeys = new Set<string>();

  const primaryLog =
    fullLog && fullLog.trim().length > 0 ? fullLog : (compileError ?? "");
  const lines = primaryLog ? primaryLog.split("\n") : [];
  const fileStack: string[] = mainFileName ? [mainFileName] : [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    updateParenFileStack(rawLine, fileStack);
    const currentStackTop = fileStack[fileStack.length - 1];

    // 1. Standard TeX/LaTeX "! ..." error blocks
    if (trimmed.startsWith("!")) {
      const title = trimmed.replace(/^!\s*/, "");
      const excerptLines: string[] = [rawLine];
      let detectedLine: number | undefined;
      let explicitFile: string | undefined;

      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        const nextRaw = lines[j];
        const nextTrim = nextRaw.trim();
        if (nextTrim.startsWith("!")) break;

        excerptLines.push(nextRaw);

        const pkgLineMatch = nextTrim.match(
          /^\(([^()\s]+\.(?:sty|cls|tex))\)\s*/i,
        );
        if (pkgLineMatch && !explicitFile) {
          explicitFile = pkgLineMatch[1];
        }

        const colonFileMatch = nextTrim.match(
          /^([^:\s]+\.(?:tex|sty|cls|bib)):(\d+)/i,
        );
        if (colonFileMatch) {
          explicitFile = colonFileMatch[1];
          detectedLine = Number.parseInt(colonFileMatch[2], 10);
        }

        const lineNumMatch = nextTrim.match(/^l\.(\d+)\b/);
        if (lineNumMatch && detectedLine === undefined) {
          detectedLine = Number.parseInt(lineNumMatch[1], 10);
          // Capture the continuation error context line right after l.<num> if present
          if (lines[j + 1]?.trim()) {
            excerptLines.push(lines[j + 1]);
          }
          break;
        }
      }

      // Skip trailing blank lines in excerpt
      while (
        excerptLines.length > 1 &&
        !excerptLines[excerptLines.length - 1].trim()
      ) {
        excerptLines.pop();
      }

      const fileInfo = matchProjectFile(
        explicitFile ?? currentStackTop,
        projectFileNames,
      );
      const dedupeKey = `error:${title}:${fileInfo.resolved ?? ""}:${detectedLine ?? ""}`;

      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        diagnostics.push({
          id: `err-${diagnostics.length}`,
          severity: "error",
          title,
          file: fileInfo.resolved ?? mainFileName,
          line: detectedLine,
          isProjectFile:
            fileInfo.isProjectFile || fileInfo.resolved === mainFileName,
          excerpt: excerptLines.join("\n"),
          suggestedCompiler: /fontspec|cannot-use-pdftex|unicode-math/i.test(
            `${title}\n${excerptLines.join("\n")}`,
          )
            ? (suggestedCompiler ?? undefined)
            : undefined,
        });
      }
      continue;
    }

    // 2. File:line: error style (e.g. ./main.tex:14: Undefined control sequence)
    const fileErrorMatch = trimmed.match(
      /^(\.?\/?[^:\s]+\.(?:tex|sty|cls|bib)):(\d+):\s*(.+)$/,
    );
    if (fileErrorMatch) {
      const fileInfo = matchProjectFile(fileErrorMatch[1], projectFileNames);
      const lineNum = Number.parseInt(fileErrorMatch[2], 10);
      const title = fileErrorMatch[3].trim();
      const dedupeKey = `error:${title}:${fileInfo.resolved ?? ""}:${lineNum}`;
      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        const excerpt = lines
          .slice(i, Math.min(lines.length, i + 4))
          .join("\n")
          .trimEnd();
        diagnostics.push({
          id: `err-${diagnostics.length}`,
          severity: "error",
          title,
          file: fileInfo.resolved,
          line: Number.isFinite(lineNum) ? lineNum : undefined,
          isProjectFile: fileInfo.isProjectFile,
          excerpt,
        });
      }
      continue;
    }

    // 3. Warnings found in log
    if (
      /^LaTeX(?:\s+Font)?\s+Warning:/i.test(trimmed) ||
      /^Package\s+\S+\s+Warning:/i.test(trimmed) ||
      /^Class\s+\S+\s+Warning:/i.test(trimmed) ||
      /^Overfull\s+\\hbox/i.test(trimmed) ||
      /^Underfull\s+\\hbox/i.test(trimmed) ||
      /^Missing character:/i.test(trimmed)
    ) {
      const excerptLines = [rawLine];
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const nextTrim = lines[j].trim();
        if (!nextTrim) break;
        if (
          nextTrim.startsWith("(") ||
          nextTrim.startsWith("on input line") ||
          trimmed.endsWith(":")
        ) {
          excerptLines.push(lines[j]);
        } else {
          break;
        }
      }

      const excerpt = excerptLines.join("\n");
      const lineMatch = excerpt.match(/(?:on input line|lines?)\s+(\d+)/i);
      const lineNum = lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined;
      const fileInfo = matchProjectFile(currentStackTop, projectFileNames);
      const dedupeKey = `warn:${trimmed.slice(0, 80)}:${lineNum ?? ""}`;

      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        diagnostics.push({
          id: `warn-${diagnostics.length}`,
          severity: "warning",
          title: trimmed,
          file: fileInfo.resolved,
          line: Number.isFinite(lineNum) ? lineNum : undefined,
          isProjectFile: fileInfo.isProjectFile,
          excerpt,
        });
      }
    }
  }

  // Merge any header warnings when fullLog isn't loaded yet
  for (const warning of compileWarnings) {
    const trimmed = warning.trim();
    if (!trimmed) continue;
    const lineMatch = trimmed.match(/(?:on input line|lines?)\s+(\d+)/i);
    const lineNum = lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined;
    const dedupeKey = `warn:${trimmed.slice(0, 80)}:${lineNum ?? ""}`;
    if (!seenKeys.has(dedupeKey)) {
      seenKeys.add(dedupeKey);
      diagnostics.push({
        id: `warn-${diagnostics.length}`,
        severity: "warning",
        title: trimmed,
        file: mainFileName,
        line: Number.isFinite(lineNum) ? lineNum : undefined,
        isProjectFile: Boolean(mainFileName),
        excerpt: trimmed,
      });
    }
  }

  // Fallback if compile failed with a non-! error message (timeout, size, raw stderr)
  const hasErrors = diagnostics.some((d) => d.severity === "error");
  if (compileError && !hasErrors) {
    diagnostics.unshift({
      id: "err-fallback",
      severity: "error",
      title: compileError.split("\n")[0] || "Error de compilación",
      file: mainFileName,
      isProjectFile: Boolean(mainFileName),
      excerpt: compileError,
      suggestedCompiler: suggestedCompiler ?? undefined,
    });
  }

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter(
    (d) => d.severity === "warning",
  ).length;

  const engineHintTitle = suggestedCompiler
    ? compileError
      ? "No se creó PDF"
      : "Motor de compilación sugerido"
    : null;
  const engineHintDescription = suggestedCompiler
    ? "Parece que usas el motor equivocado. Intenta con XeLaTeX o LuaLaTeX en lugar de PdfLaTeX."
    : null;

  return {
    diagnostics: diagnostics.slice(0, 50),
    errorCount,
    warningCount,
    suggestedCompiler,
    engineHintTitle,
    engineHintDescription,
  };
}

export function buildFixPromptForDiagnostics(params: {
  diagnostics: CompileDiagnosticItem[];
  compiler: LatexCompiler;
  mainFileName?: string;
  suggestedCompiler?: LatexCompiler | null;
  singleItemOnly?: boolean;
}): string {
  const {
    diagnostics,
    compiler,
    mainFileName,
    suggestedCompiler,
    singleItemOnly,
  } = params;

  const formattedItems = diagnostics
    .slice(0, 8)
    .map((item, index) => {
      const location = item.file
        ? item.line
          ? `${item.file}:${item.line}`
          : item.file
        : (mainFileName ?? "documento");
      return `${index + 1}. [${item.severity.toUpperCase()}] ${item.title}\n   Ubicación: ${location}\n\`\`\`\n${item.excerpt.slice(0, 600)}\n\`\`\``;
    })
    .join("\n\n");

  const engineNote = suggestedCompiler
    ? `\nNota detectada: este proyecto parece requerir el motor \`${suggestedCompiler}\` (o \`lualatex\`) en lugar de \`${compiler}\`. Si corresponde, usa la herramienta \`set_latex_compiler\`.\n`
    : "";

  const header = singleItemOnly
    ? `Por favor corrige el siguiente diagnóstico de compilación (motor actual: ${compiler}, archivo principal: ${mainFileName ?? "main.tex"}):`
    : `Por favor analiza y corrige todos los errores y advertencias de compilación pendientes (motor actual: ${compiler}, archivo principal: ${mainFileName ?? "main.tex"}):`;

  return `${header}
${engineNote}
${formattedItems}

Usa las herramientas necesarias (\`get_compile_diagnostics\`, \`read_project_file\`, \`find_and_replace\`, \`create_project_file\`, \`set_latex_compiler\`, \`compile_project\`) para diagnosticar la causa raíz y proponer la solución.`;
}
