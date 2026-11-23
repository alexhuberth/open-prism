"use client";

import { useEffect, useMemo } from "react";
import { useAui } from "@assistant-ui/store";
import {
  analyzeCompileDiagnostics,
  inspectProjectCompileIntegrity,
} from "@/lib/latex-log-parser";
import { buildProjectOutline } from "@/lib/latex-outline";
import { useDocumentStore } from "@/stores/document-store";

const MAX_ACTIVE_FILE_CHARS = 35000;

function formatContentForContext(content: string): string {
  if (content.length <= MAX_ACTIVE_FILE_CHARS) {
    return content;
  }
  const head = content.slice(0, 18000);
  const tail = content.slice(-14000);
  return `${head}\n\n% ... [${content.length - 32000} caracteres intermedios omitidos; usa read_project_file si necesitas inspeccionar todo] ...\n\n${tail}`;
}

export function useDocumentContext() {
  const aui = useAui();
  const projects = useDocumentStore((s) => s.projects);
  const activeProjectId = useDocumentStore((s) => s.activeProjectId);
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const compiler = useDocumentStore((s) => s.compiler);
  const aiModel = useDocumentStore((s) => s.aiModel);
  const fileName = useDocumentStore((s) => s.fileName);
  const content = useDocumentStore((s) => s.content);
  const selectionRange = useDocumentStore((s) => s.selectionRange);
  const pdfData = useDocumentStore((s) => s.pdfData);
  const compileError = useDocumentStore((s) => s.compileError);
  const compileWarnings = useDocumentStore((s) => s.compileWarnings);
  const compileWarningCount = useDocumentStore((s) => s.compileWarningCount);
  const compileFullLog = useDocumentStore((s) => s.compileFullLog);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId],
  );

  const hasSelection = selectionRange !== null;
  const selectedText = hasSelection
    ? content.slice(selectionRange.start, selectionRange.end)
    : null;

  const projectFilesSummary = useMemo(() => {
    return files
      .map((f) => {
        const flags: string[] = [];
        if (f.id === mainFileId) flags.push("principal");
        if (f.id === activeFileId) flags.push("activo");
        const tag = flags.length > 0 ? ` (${flags.join(", ")})` : "";
        return `- ${f.name} [${f.type}]${tag}`;
      })
      .join("\n");
  }, [files, mainFileId, activeFileId]);

  const outlineSummary = useMemo(() => {
    const outline = buildProjectOutline(files, mainFileId);
    if (outline.length === 0) return "";
    return outline
      .slice(0, 80)
      .map(
        (item) =>
          `${"  ".repeat(Math.max(0, item.level))}- ${item.title} (${item.fileName}:${item.line})`,
      )
      .join("\n");
  }, [files, mainFileId]);

  const compileStatusSummary = useMemo(() => {
    const mainFile = files.find((f) => f.id === mainFileId) ?? files[0];
    const integrity = inspectProjectCompileIntegrity({ files, mainFileId });

    const integrityHints: string[] = [];
    if (integrity.wrongMainFileCandidate) {
      integrityHints.push(
        `Alerta estructural: el archivo principal actual ("${mainFile?.name}") NO declara \\documentclass, mientras que "${integrity.wrongMainFileCandidate}" sí lo hace. Considera usar set_main_file.`,
      );
    }
    if (integrity.caseMismatchedPaths.length > 0) {
      const sample = integrity.caseMismatchedPaths
        .slice(0, 3)
        .map(
          (m) =>
            `${m.inFile}:${m.line} referencia "${m.referenced}" pero el archivo real es "${m.actualFile}"`,
        )
        .join("; ");
      integrityHints.push(
        `Diferencias de mayúsculas/minúsculas (Linux es case-sensitive): ${sample}`,
      );
    }
    if (integrity.missingReferencedFiles.length > 0) {
      const sample = integrity.missingReferencedFiles
        .slice(0, 3)
        .map((m) => `${m.inFile}:${m.line} (\\${m.command}{${m.target}})`)
        .join("; ");
      integrityHints.push(`Archivos incluidos no encontrados: ${sample}`);
    }

    const integrityBlock =
      integrityHints.length > 0 ? `\n${integrityHints.join("\n")}` : "";

    if (!compileError && !pdfData && compileWarningCount === 0) {
      return `Estado de compilación: aún no compilado.${integrityBlock}`;
    }

    const analysis = analyzeCompileDiagnostics({
      fullLog: compileFullLog,
      compileError,
      compileWarnings,
      compiler,
      projectFileNames: files.map((f) => f.name),
      mainFileName: mainFile?.name,
    });

    const statusLine = compileError
      ? `Estado de compilación: ERROR (${analysis.errorCount} error(es), ${analysis.warningCount} advertencia(s)).`
      : `Estado de compilación: PDF compilado correctamente (${Math.max(compileWarningCount, analysis.warningCount)} advertencia(s)).`;

    const topItems = analysis.diagnostics
      .slice(0, 5)
      .map((item) => {
        const loc = item.file
          ? item.line
            ? `${item.file}:${item.line}`
            : item.file
          : (mainFile?.name ?? "main.tex");
        return `- [${item.severity.toUpperCase()}] ${loc}: ${item.title}`;
      })
      .join("\n");

    const engineHint = analysis.suggestedCompiler
      ? `\nSugerencia detectada: el log indica incompatibilidad con "${compiler}". Considera cambiar a "${analysis.suggestedCompiler}" o "lualatex" mediante set_latex_compiler.`
      : "";

    return `${statusLine}${engineHint}${integrityBlock}${topItems ? `\nDiagnósticos recientes:\n${topItems}` : ""}`;
  }, [
    files,
    mainFileId,
    compiler,
    pdfData,
    compileError,
    compileWarnings,
    compileWarningCount,
    compileFullLog,
  ]);

  useEffect(() => {
    const selectionInfo = hasSelection
      ? `El usuario tiene seleccionado el siguiente texto en "${fileName}":\n\`\`\`\n${selectedText}\n\`\`\`\nPuedes usar replace_selection para proponer su reemplazo.`
      : "El usuario NO tiene texto seleccionado. No uses replace_selection.";

    const outlineBlock = outlineSummary
      ? `\nEstructura del documento:\n${outlineSummary}\n`
      : "";

    return aui.modelContext().register({
      getModelContext: () => ({
        config: {
          modelName: aiModel,
        },
        system: `Proyecto actual: "${activeProject?.name ?? "Proyecto"}" (motor: ${compiler}).
${compileStatusSummary}

Archivos del proyecto:
${projectFilesSummary}
${outlineBlock}
El usuario está editando actualmente el archivo "${fileName}":
\`\`\`latex
${formatContentForContext(content)}
\`\`\`

${selectionInfo}

Si necesitas consultar otro archivo de la lista (por ejemplo .bib o capítulos incluidos), usa read_project_file. Para inspeccionar el log completo o detalles de advertencias/errores, usa get_compile_diagnostics.`,
      }),
    });
  }, [
    aui,
    activeProject?.name,
    compiler,
    compileStatusSummary,
    aiModel,
    projectFilesSummary,
    outlineSummary,
    fileName,
    content,
    hasSelection,
    selectedText,
  ]);
}
