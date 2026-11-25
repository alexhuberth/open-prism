"use client";

import { useEffect } from "react";
import { useAui } from "@assistant-ui/store";
import {
  analyzeCompileDiagnostics,
  inspectProjectCompileIntegrity,
} from "@/lib/latex-log-parser";
import { buildProjectOutline } from "@/lib/latex-outline";
import { isTextFile, type ProjectFile } from "@/lib/project-files";
import { useDocumentStore } from "@/stores/document-store";

const MAX_ACTIVE_FILE_CHARS = 5500;
const MAX_FILES_IN_CONTEXT = 35;
const MAX_OUTLINE_ITEMS = 25;

function formatContentForContext(
  content: string,
  cursorPosition: number,
): string {
  if (content.length <= MAX_ACTIVE_FILE_CHARS) {
    return content;
  }

  const lines = content.split("\n");
  const safePos = Math.min(Math.max(0, cursorPosition), content.length);
  const cursorLine = content.slice(0, safePos).split("\n").length;

  // Always include top preamble/header lines + a focused window around the cursor
  const headLines = lines.slice(0, 28);
  const headText = headLines.join("\n").slice(0, 1400);

  const windowStart = Math.max(28, cursorLine - 25);
  const windowEnd = Math.min(lines.length, cursorLine + 25);
  const windowSlice = lines
    .slice(windowStart, windowEnd)
    .map((line, i) => `${windowStart + i + 1}: ${line}`)
    .join("\n")
    .slice(0, 3400);

  return `${headText}\n\n% ... [Archivo de ${lines.length} líneas; mostrando líneas ${windowStart + 1}-${windowEnd} cerca del cursor (línea ${cursorLine}). Usa read_project_file(filePath, startLine, endLine) o search_project_files para ver otras partes.] ...\n\n${windowSlice}`;
}

function summarizeProjectFiles(
  files: ProjectFile[],
  mainFileId: string,
  activeFileId: string,
): string {
  const prioritized = [...files].sort((a, b) => {
    const score = (f: ProjectFile) => {
      if (f.id === mainFileId) return 0;
      if (f.id === activeFileId) return 1;
      if (isTextFile(f)) return 2;
      return 3;
    };
    return score(a) - score(b);
  });

  const shown = prioritized.slice(0, MAX_FILES_IN_CONTEXT);
  const hiddenCount = prioritized.length - shown.length;

  const lines = shown.map((f) => {
    const flags: string[] = [];
    if (f.id === mainFileId) flags.push("principal");
    if (f.id === activeFileId) flags.push("activo");
    const tag = flags.length > 0 ? ` (${flags.join(",")})` : "";
    return `- ${f.name} [${f.type}]${tag}`;
  });

  if (hiddenCount > 0) {
    lines.push(
      `- ... y ${hiddenCount} archivo(s) más (usa list_project_files para ver todos)`,
    );
  }

  return lines.join("\n");
}

export function useDocumentContext() {
  const aui = useAui();

  useEffect(() => {
    return aui.modelContext().register({
      getModelContext: () => {
        const state = useDocumentStore.getState();
        const activeProject =
          state.projects.find((p) => p.id === state.activeProjectId) ??
          state.projects[0];
        const mainFile =
          state.files.find((f) => f.id === state.mainFileId) ?? state.files[0];

        const projectFilesSummary = summarizeProjectFiles(
          state.files,
          state.mainFileId,
          state.activeFileId,
        );

        const outline = buildProjectOutline(state.files, state.mainFileId);
        const outlineBlock =
          outline.length > 0
            ? `\nEsquema:\n${outline
                .slice(0, MAX_OUTLINE_ITEMS)
                .map(
                  (item) =>
                    `${"  ".repeat(Math.max(0, item.level))}- ${item.title} (${item.fileName}:${item.line})`,
                )
                .join(
                  "\n",
                )}${outline.length > MAX_OUTLINE_ITEMS ? `\n- ... (+${outline.length - MAX_OUTLINE_ITEMS} secciones)` : ""}\n`
            : "";

        const integrity = inspectProjectCompileIntegrity({
          files: state.files,
          mainFileId: state.mainFileId,
        });
        const integrityHints: string[] = [];
        if (integrity.wrongMainFileCandidate) {
          integrityHints.push(
            `Alerta: "${mainFile?.name}" no tiene \\documentclass; "${integrity.wrongMainFileCandidate}" sí (usa set_main_file).`,
          );
        }
        if (integrity.caseMismatchedPaths.length > 0) {
          const sample = integrity.caseMismatchedPaths
            .slice(0, 3)
            .map(
              (m) =>
                `${m.inFile}:${m.line} "${m.referenced}"→"${m.actualFile}"`,
            )
            .join("; ");
          integrityHints.push(`Mayúsculas distintas: ${sample}`);
        }
        if (integrity.missingReferencedFiles.length > 0) {
          const sample = integrity.missingReferencedFiles
            .slice(0, 3)
            .map((m) => `${m.inFile}:${m.line} \\${m.command}{${m.target}}`)
            .join("; ");
          integrityHints.push(`Referencias faltantes: ${sample}`);
        }

        let compileStatusSummary = "Compilación: sin compilar.";
        if (
          state.compileError ||
          state.pdfData ||
          state.compileWarningCount > 0
        ) {
          const analysis = analyzeCompileDiagnostics({
            fullLog: state.compileFullLog,
            compileError: state.compileError,
            compileWarnings: state.compileWarnings,
            compiler: state.compiler,
            projectFileNames: state.files.map((f) => f.name),
            mainFileName: mainFile?.name,
          });
          const statusLine = state.compileError
            ? `Compilación: ERROR (${analysis.errorCount} err, ${analysis.warningCount} warn).`
            : `Compilación: OK (${Math.max(state.compileWarningCount, analysis.warningCount)} warn).`;
          const topItems = analysis.diagnostics
            .slice(0, 4)
            .map((item) => {
              const loc = item.file
                ? item.line
                  ? `${item.file}:${item.line}`
                  : item.file
                : (mainFile?.name ?? "main.tex");
              return `- [${item.severity.toUpperCase()}] ${loc}: ${item.title.slice(0, 140)}`;
            })
            .join("\n");
          const engineHint = analysis.suggestedCompiler
            ? `\nMotor sugerido: ${analysis.suggestedCompiler} (usa set_latex_compiler).`
            : "";
          compileStatusSummary = `${statusLine}${engineHint}${topItems ? `\n${topItems}` : ""}`;
        }

        if (integrityHints.length > 0) {
          compileStatusSummary += `\n${integrityHints.join("\n")}`;
        }

        const selectionInfo =
          state.selectionRange !== null
            ? `\nSelección activa en "${state.fileName}":\n\`\`\`\n${state.content
                .slice(state.selectionRange.start, state.selectionRange.end)
                .slice(0, 2500)}\n\`\`\``
            : "";

        return {
          config: {
            modelName: state.aiModel,
          },
          system: `Proyecto: "${activeProject?.name ?? "Proyecto"}" | Motor: ${state.compiler} | Principal: ${mainFile?.name ?? "main.tex"}
${compileStatusSummary}

Archivos:
${projectFilesSummary}
${outlineBlock}
Archivo activo "${state.fileName}":
\`\`\`latex
${formatContentForContext(state.content, state.cursorPosition)}
\`\`\`${selectionInfo}`,
        };
      },
    });
  }, [aui]);
}
