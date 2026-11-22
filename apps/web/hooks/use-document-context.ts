"use client";

import { useEffect, useMemo } from "react";
import { useAui } from "@assistant-ui/store";
import { useDocumentStore } from "@/stores/document-store";

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

  useEffect(() => {
    const selectionInfo = hasSelection
      ? `El usuario tiene seleccionado el siguiente texto en "${fileName}":\n\`\`\`\n${selectedText}\n\`\`\`\nPuedes usar replace_selection para proponer su reemplazo.`
      : "El usuario NO tiene texto seleccionado. No uses replace_selection.";

    return aui.modelContext().register({
      getModelContext: () => ({
        config: {
          modelName: aiModel,
        },
        system: `Proyecto actual: "${activeProject?.name ?? "Proyecto"}" (motor: ${compiler}).
Archivos del proyecto:
${projectFilesSummary}

El usuario está editando actualmente el archivo "${fileName}":
\`\`\`latex
${content}
\`\`\`

${selectionInfo}

Si necesitas consultar otro archivo de la lista (por ejemplo .bib o capítulos incluidos), usa la herramienta read_project_file.`,
      }),
    });
  }, [
    aui,
    activeProject?.name,
    compiler,
    aiModel,
    projectFilesSummary,
    fileName,
    content,
    hasSelection,
    selectedText,
  ]);
}
