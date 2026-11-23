"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import {
  useAui,
  useAssistantTool,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import {
  CheckIcon,
  CpuIcon,
  ExpandIcon,
  FileCodeIcon,
  FilePlus2Icon,
  FileSearchIcon,
  GitCompareIcon,
  LoaderIcon,
  PlayIcon,
  PlusIcon,
  ReplaceIcon,
  ScrollTextIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  DiffHunkView,
  DiffReviewDialog,
} from "@/components/workspace/diff-viewer";
import { compileActiveProject } from "@/lib/compile-active-project";
import type { LatexCompiler } from "@/lib/latex-compiler";
import {
  analyzeCompileDiagnostics,
  type CompileAnalysisResult,
  extractSourceSnippet,
  inspectProjectCompileIntegrity,
  type ProjectIntegrityReport,
} from "@/lib/latex-log-parser";
import {
  classifyFileName,
  isTexFile,
  isTextFile,
  normalizeRelativePath,
  type ProjectFile,
} from "@/lib/project-files";
import { useDocumentStore } from "@/stores/document-store";

type LatexToolName =
  | "insert_latex"
  | "replace_selection"
  | "find_and_replace"
  | "create_project_file"
  | "rewrite_project_file";

interface ToolResult {
  success: boolean;
  rejected?: boolean;
  message?: string;
  error?: string;
}

interface ReadProjectFileResult extends ToolResult {
  filePath?: string;
  content?: string;
  numberedContent?: string;
  totalLines?: number;
  startLine?: number;
  endLine?: number;
}

interface ProposalSnapshot {
  isNewFile?: boolean;
  fileId: string;
  fileName: string;
  beforeContent: string;
  afterContent: string;
  validationError?: string;
}

function buildSnapshot(
  toolName: LatexToolName,
  args: Record<string, string>,
): ProposalSnapshot {
  const state = useDocumentStore.getState();

  if (
    toolName === "create_project_file" ||
    toolName === "rewrite_project_file"
  ) {
    const normalized = normalizeRelativePath(args.filePath ?? "");
    if (!normalized) {
      return {
        fileId: "",
        fileName: args.filePath ?? "",
        beforeContent: "",
        afterContent: "",
        validationError: "Ruta de archivo inválida",
      };
    }

    const existing = state.files.find((f) => f.name === normalized);
    if (existing) {
      return {
        fileId: existing.id,
        fileName: existing.name,
        beforeContent: existing.content ?? "",
        afterContent: (args.content ?? "").replace(/\r\n?/g, "\n"),
      };
    }

    return {
      isNewFile: true,
      fileId: "",
      fileName: normalized,
      beforeContent: "",
      afterContent: (args.content ?? "").replace(/\r\n?/g, "\n"),
    };
  }

  const requestedPath = args.filePath
    ? normalizeRelativePath(args.filePath)
    : null;
  const targetFile = requestedPath
    ? state.files.find((f) => f.name === requestedPath)
    : (state.files.find((f) => f.id === state.activeFileId) ?? state.files[0]);

  if (!targetFile || !isTextFile(targetFile)) {
    return {
      fileId: "",
      fileName: requestedPath ?? "document.tex",
      beforeContent: "",
      afterContent: "",
      validationError: requestedPath
        ? `No se encontró el archivo editable "${requestedPath}"`
        : "El archivo activo no es editable como texto",
    };
  }

  const fileId = targetFile.id;
  const fileName = targetFile.name;
  const beforeContent = targetFile.content ?? "";

  if (toolName === "insert_latex") {
    const code = args.code ?? "";
    const pos = Math.min(
      Math.max(0, state.cursorPosition),
      beforeContent.length,
    );
    return {
      fileId,
      fileName,
      beforeContent,
      afterContent:
        beforeContent.slice(0, pos) + code + beforeContent.slice(pos),
    };
  }

  if (toolName === "replace_selection") {
    const code = args.code ?? "";
    if (!state.selectionRange) {
      return {
        fileId,
        fileName,
        beforeContent,
        afterContent: beforeContent,
        validationError: "No hay texto seleccionado en el editor",
      };
    }
    const { start, end } = state.selectionRange;
    return {
      fileId,
      fileName,
      beforeContent,
      afterContent:
        beforeContent.slice(0, start) + code + beforeContent.slice(end),
    };
  }

  const normalizedBefore = beforeContent.replace(/\r\n?/g, "\n");
  const find = (args.find ?? "").replace(/\r\n?/g, "\n");
  const replace = (args.replace ?? "").replace(/\r\n?/g, "\n");
  if (!find || !normalizedBefore.includes(find)) {
    return {
      fileId,
      fileName,
      beforeContent: normalizedBefore,
      afterContent: normalizedBefore,
      validationError: `No se encontró el fragmento exacto en ${fileName}. Usa read_project_file o rewrite_project_file si necesitas editar múltiples partes.`,
    };
  }

  return {
    fileId,
    fileName,
    beforeContent: normalizedBefore,
    afterContent: normalizedBefore.replace(find, replace),
  };
}

interface ProposalCardProps {
  toolCallId: string;
  toolName: LatexToolName;
  title: string;
  completedLabel: string;
  pendingLabel: string;
  icon: "plus" | "replace" | "search" | "create";
  args: Record<string, string>;
  result: ToolResult | undefined;
  statusType: string;
}

const ProposalDiffCard: FC<ProposalCardProps> = ({
  toolCallId,
  toolName,
  title,
  completedLabel,
  pendingLabel,
  icon,
  args,
  result,
  statusType,
}) => {
  const aui = useAui();
  const addFile = useDocumentStore((s) => s.addFile);
  const updateFileContent = useDocumentStore((s) => s.updateFileContent);
  const registerPendingProposal = useDocumentStore(
    (s) => s.registerPendingProposal,
  );
  const unregisterPendingProposal = useDocumentStore(
    (s) => s.unregisterPendingProposal,
  );

  const [expandOpen, setExpandOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<ProposalSnapshot | null>(null);
  const autoReportedRef = useRef(false);

  const isWaitingAction = result == null && statusType === "requires-action";

  useEffect(() => {
    if (isWaitingAction && !snapshot) {
      setSnapshot(buildSnapshot(toolName, args));
    }
  }, [isWaitingAction, snapshot, toolName, args]);

  useEffect(() => {
    if (
      isWaitingAction &&
      snapshot?.validationError &&
      !autoReportedRef.current
    ) {
      autoReportedRef.current = true;
      aui.part().addToolResult({
        success: false,
        error: snapshot.validationError,
      });
    }
  }, [isWaitingAction, snapshot, aui]);

  const handleApprove = useCallback(
    (andCompile = false) => {
      if (!snapshot || snapshot.validationError) return;
      if (snapshot.isNewFile) {
        const classified = classifyFileName(snapshot.fileName);
        addFile({
          name: snapshot.fileName,
          type: classified === "tex" ? "tex" : "text",
          content: snapshot.afterContent,
        });
      } else {
        updateFileContent(snapshot.fileId, snapshot.afterContent);
      }
      unregisterPendingProposal(toolCallId);
      aui.part().addToolResult({
        success: true,
        message: "Cambio aprobado y aplicado por el usuario",
      });
      if (andCompile) {
        compileActiveProject();
      }
    },
    [
      snapshot,
      addFile,
      updateFileContent,
      unregisterPendingProposal,
      toolCallId,
      aui,
    ],
  );

  const handleReject = useCallback(() => {
    unregisterPendingProposal(toolCallId);
    aui.part().addToolResult({
      success: false,
      rejected: true,
      message: "Cambio rechazado por el usuario",
    });
  }, [unregisterPendingProposal, toolCallId, aui]);

  useEffect(() => {
    if (!isWaitingAction || !snapshot || snapshot.validationError) {
      unregisterPendingProposal(toolCallId);
      return;
    }

    registerPendingProposal({
      toolCallId,
      toolName,
      fileId: snapshot.fileId,
      fileName: snapshot.fileName,
      beforeContent: snapshot.beforeContent,
      afterContent: snapshot.afterContent,
      onApprove: handleApprove,
      onReject: handleReject,
    });

    return () => {
      unregisterPendingProposal(toolCallId);
    };
  }, [
    isWaitingAction,
    snapshot,
    toolCallId,
    toolName,
    registerPendingProposal,
    unregisterPendingProposal,
    handleApprove,
    handleReject,
  ]);

  const IconComp = useMemo(() => {
    if (icon === "plus") return PlusIcon;
    if (icon === "replace") return ReplaceIcon;
    if (icon === "create") return FilePlus2Icon;
    return SearchIcon;
  }, [icon]);

  if (result != null) {
    const isRejected = result.rejected === true;
    const isError = result.success === false && !isRejected;
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
        {isRejected ? (
          <XIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : isError ? (
          <span className="flex size-4 shrink-0 items-center justify-center font-bold text-amber-600">
            !
          </span>
        ) : (
          <CheckIcon className="size-4 shrink-0 text-emerald-600" />
        )}
        <IconComp className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          {isRejected
            ? "Cambio rechazado"
            : isError
              ? (result.error ?? "No se pudo aplicar el cambio")
              : completedLabel}
        </span>
      </div>
    );
  }

  if (!isWaitingAction || !snapshot) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
        <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
        <IconComp className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">{pendingLabel}</span>
      </div>
    );
  }

  if (snapshot.validationError) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-300">
        <span className="font-bold">!</span>
        <span>{snapshot.validationError}</span>
      </div>
    );
  }

  return (
    <div className="my-2 space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          <IconComp className="size-3.5 text-primary" />
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground">· {snapshot.fileName}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          title="Ver diff completo"
          onClick={() => setExpandOpen(true)}
        >
          <ExpandIcon className="size-3.5" />
        </Button>
      </div>

      <DiffHunkView
        before={snapshot.beforeContent}
        after={snapshot.afterContent}
        contextRadius={2}
        maxHeightClass="max-h-48"
      />

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleReject}
        >
          <XIcon className="mr-1 size-3.5 text-destructive" />
          Rechazar
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 text-xs"
          onClick={() => handleApprove(false)}
        >
          <CheckIcon className="mr-1 size-3.5" />
          Aceptar
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          onClick={() => handleApprove(true)}
        >
          <PlayIcon className="mr-1 size-3.5" />
          Aceptar y compilar
        </Button>
      </div>

      <DiffReviewDialog
        open={expandOpen}
        onOpenChange={setExpandOpen}
        fileName={snapshot.fileName}
        before={snapshot.beforeContent}
        after={snapshot.afterContent}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
};

function ReadProjectFileRender({
  args,
  result,
}: ToolCallMessagePartProps<{ filePath: string }, ReadProjectFileResult>) {
  const isComplete = result != null;
  const hasError = result?.success === false;
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
      {isComplete ? (
        hasError ? (
          <span className="font-bold text-amber-600">!</span>
        ) : (
          <CheckIcon className="size-3.5 text-emerald-600" />
        )
      ) : (
        <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
      )}
      <FileSearchIcon className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">
        {hasError
          ? result.error
          : isComplete
            ? `Archivo leído: ${args.filePath ?? ""}`
            : "Leyendo archivo del proyecto..."}
      </span>
    </div>
  );
}

function InsertLatexRender({
  toolCallId,
  args,
  result,
  status,
}: ToolCallMessagePartProps<{ code: string }, ToolResult>) {
  return (
    <ProposalDiffCard
      toolCallId={toolCallId}
      toolName="insert_latex"
      title="Propuesta de inserción"
      completedLabel="Código LaTeX aceptado y aplicado"
      pendingLabel="Preparando inserción de LaTeX..."
      icon="plus"
      args={args as Record<string, string>}
      result={result}
      statusType={status.type}
    />
  );
}

function ReplaceSelectionRender({
  toolCallId,
  args,
  result,
  status,
}: ToolCallMessagePartProps<{ code: string }, ToolResult>) {
  return (
    <ProposalDiffCard
      toolCallId={toolCallId}
      toolName="replace_selection"
      title="Propuesta de reemplazo"
      completedLabel="Selección reemplazada"
      pendingLabel="Preparando reemplazo de selección..."
      icon="replace"
      args={args as Record<string, string>}
      result={result}
      statusType={status.type}
    />
  );
}

function FindAndReplaceRender({
  toolCallId,
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { filePath?: string; find: string; replace: string },
  ToolResult
>) {
  return (
    <ProposalDiffCard
      toolCallId={toolCallId}
      toolName="find_and_replace"
      title="Propuesta de edición"
      completedLabel="Cambio aceptado y aplicado"
      pendingLabel="Preparando cambio en el documento..."
      icon="search"
      args={args as Record<string, string>}
      result={result}
      statusType={status.type}
    />
  );
}

function CreateProjectFileRender({
  toolCallId,
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { filePath: string; content: string },
  ToolResult
>) {
  return (
    <ProposalDiffCard
      toolCallId={toolCallId}
      toolName="create_project_file"
      title="Propuesta de nuevo archivo"
      completedLabel="Archivo creado"
      pendingLabel="Preparando nuevo archivo..."
      icon="create"
      args={args as Record<string, string>}
      result={result}
      statusType={status.type}
    />
  );
}

function RewriteProjectFileRender({
  toolCallId,
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { filePath: string; content: string },
  ToolResult
>) {
  return (
    <ProposalDiffCard
      toolCallId={toolCallId}
      toolName="rewrite_project_file"
      title="Propuesta de actualización completa"
      completedLabel="Archivo actualizado"
      pendingLabel="Preparando actualización de archivo..."
      icon="replace"
      args={args as Record<string, string>}
      result={result}
      statusType={status.type}
    />
  );
}

const READ_PROJECT_FILE_TOOL = {
  toolName: "read_project_file",
  description:
    "Read the text content of any file in the current project (e.g., sections, .bib, .sty, .cls), optionally scoped to startLine..endLine with line numbers",
  parameters: z.object({
    filePath: z
      .string()
      .describe("The relative path of the file to read in the project"),
    startLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Optional 1-based start line"),
    endLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Optional 1-based end line"),
  }),
  execute: async ({
    filePath,
    startLine,
    endLine,
  }: {
    filePath: string;
    startLine?: number;
    endLine?: number;
  }): Promise<ReadProjectFileResult> => {
    const normalized = normalizeRelativePath(filePath);
    const files = useDocumentStore.getState().files;
    const target = files.find((f) => f.name === (normalized ?? filePath));
    if (!target) {
      return {
        success: false,
        error: `No se encontró el archivo "${filePath}" en el proyecto`,
      };
    }
    if (!isTextFile(target)) {
      return {
        success: false,
        error: `"${target.name}" es un archivo binario/imagen y no se puede leer como texto`,
      };
    }
    const rawContent = (target.content ?? "").replace(/\r\n?/g, "\n");
    const allLines = rawContent.split("\n");
    const totalLines = allLines.length;
    const fromLine = Math.max(1, startLine ?? 1);
    const toLine = Math.min(totalLines, endLine ?? totalLines);
    const sliceLines = allLines.slice(fromLine - 1, toLine);
    const numberedContent = sliceLines
      .map((line, i) => `${String(fromLine + i).padStart(4, " ")}: ${line}`)
      .join("\n");

    return {
      success: true,
      filePath: target.name,
      content: sliceLines.join("\n"),
      numberedContent,
      totalLines,
      startLine: fromLine,
      endLine: toLine,
    };
  },
  render: ReadProjectFileRender,
};

interface SearchMatch {
  filePath: string;
  line: number;
  text: string;
}

interface SearchProjectFilesResult extends ToolResult {
  query?: string;
  matches?: SearchMatch[];
}

function SearchProjectFilesRender({
  args,
  result,
  status,
}: ToolCallMessagePartProps<{ query: string }, SearchProjectFilesResult>) {
  const isComplete = result != null || status.type === "complete";
  return (
    <div className="my-1.5 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs">
      {isComplete ? (
        result?.success ? (
          <CheckIcon className="size-3.5 text-emerald-600" />
        ) : (
          <XIcon className="size-3.5 text-destructive" />
        )
      ) : (
        <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
      )}
      <SearchIcon className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">
        {isComplete
          ? `Búsqueda "${args.query ?? ""}": ${result?.matches?.length ?? 0} coincidencia(s)`
          : `Buscando "${args.query ?? ""}" en el proyecto...`}
      </span>
    </div>
  );
}

const SEARCH_PROJECT_FILES_TOOL = {
  toolName: "search_project_files",
  description:
    "Search across all editable text files (.tex, .bib, .sty, .cls) in the project for a string or regex pattern, returning filePath, line number, and matching line",
  parameters: z.object({
    query: z.string().describe("Text or regex pattern to search for"),
    isRegex: z
      .boolean()
      .optional()
      .describe("Treat query as a regular expression (defaults to false)"),
  }),
  execute: async ({
    query,
    isRegex = false,
  }: {
    query: string;
    isRegex?: boolean;
  }): Promise<SearchProjectFilesResult> => {
    if (!query) {
      return { success: false, error: "La consulta no puede estar vacía." };
    }
    const files = useDocumentStore.getState().files;
    const matches: SearchMatch[] = [];
    let regex: RegExp;
    try {
      regex = isRegex
        ? new RegExp(query, "i")
        : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    } catch {
      return { success: false, error: `Expresión regular inválida: ${query}` };
    }

    for (const file of files) {
      if (!isTextFile(file) || !file.content) continue;
      const lines = file.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({
            filePath: file.name,
            line: i + 1,
            text: lines[i].slice(0, 200),
          });
          if (matches.length >= 40) {
            return { success: true, query, matches };
          }
        }
      }
    }

    return { success: true, query, matches };
  },
  render: SearchProjectFilesRender,
};

const INSERT_LATEX_TOOL = {
  toolName: "insert_latex",
  description:
    "Propose inserting LaTeX code at the current cursor position in the active document for user review",
  parameters: z.object({
    code: z
      .string()
      .describe("The LaTeX code to insert at the cursor position"),
  }),
  render: InsertLatexRender,
};

const REPLACE_SELECTION_TOOL = {
  toolName: "replace_selection",
  description:
    "Propose replacing the currently selected text in the document with LaTeX code for user review",
  parameters: z.object({
    code: z.string().describe("The LaTeX code to replace the selection with"),
  }),
  render: ReplaceSelectionRender,
};

const FIND_AND_REPLACE_TOOL = {
  toolName: "find_and_replace",
  description:
    "Propose finding and replacing exact text in the active document (or a specified project file) for user review before applying.",
  parameters: z.object({
    filePath: z
      .string()
      .optional()
      .describe(
        "Optional relative path of the project file to edit (defaults to active file)",
      ),
    find: z.string().describe("The exact text to find in the file"),
    replace: z.string().describe("The text to replace it with"),
  }),
  render: FindAndReplaceRender,
};

const CREATE_PROJECT_FILE_TOOL = {
  toolName: "create_project_file",
  description:
    "Propose creating a new text file in the project (such as referencias.bib or secciones/capitulo1.tex) for user review",
  parameters: z.object({
    filePath: z
      .string()
      .describe("The relative path of the new file to create"),
    content: z.string().describe("The full initial content of the file"),
  }),
  render: CreateProjectFileRender,
};

const REWRITE_PROJECT_FILE_TOOL = {
  toolName: "rewrite_project_file",
  description:
    "Propose replacing the full text content of an existing project file for user diff review (best when fixing multiple scattered lines or resolving encoding/whitespace mismatches)",
  parameters: z.object({
    filePath: z
      .string()
      .describe("Relative path of the project file to update"),
    content: z.string().describe("The complete updated text of the file"),
  }),
  render: RewriteProjectFileRender,
};

interface EnrichedDiagnosticItem {
  severity: "error" | "warning";
  title: string;
  file?: string;
  line?: number;
  excerpt: string;
  sourceSnippet?: string;
}

function enrichDiagnosticsForAI(
  analysis: CompileAnalysisResult,
  files: ProjectFile[],
  limit = 15,
): EnrichedDiagnosticItem[] {
  return analysis.diagnostics.slice(0, limit).map((d) => {
    let sourceSnippet: string | undefined;
    if (d.file && d.line != null) {
      const target = files.find(
        (f) =>
          f.name === d.file ||
          f.name.endsWith(`/${d.file}`) ||
          d.file?.endsWith(`/${f.name}`),
      );
      if (target && isTextFile(target) && target.content) {
        const snippet = extractSourceSnippet(target.content, d.line, 6);
        if (snippet) sourceSnippet = snippet;
      }
    }
    return {
      severity: d.severity,
      title: d.title,
      file: d.file,
      line: d.line,
      excerpt: d.excerpt.slice(0, 800),
      ...(sourceSnippet ? { sourceSnippet } : {}),
    };
  });
}

interface CompileDiagnosticsResult extends ToolResult {
  compiler?: LatexCompiler;
  mainFile?: string;
  hasPdf?: boolean;
  compileError?: string | null;
  errorCount?: number;
  warningCount?: number;
  suggestedCompiler?: LatexCompiler | null;
  integrity?: ProjectIntegrityReport;
  diagnostics?: EnrichedDiagnosticItem[];
  fullLogTail?: string;
}

function GetCompileDiagnosticsRender({
  result,
  status,
}: ToolCallMessagePartProps<
  { includeFullLog?: boolean },
  CompileDiagnosticsResult
>) {
  const isComplete = result != null || status.type === "complete";
  const hasError = result?.success === false;
  const errCount = result?.errorCount ?? 0;
  const warnCount = result?.warningCount ?? 0;

  return (
    <div className="my-1.5 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs">
      {isComplete ? (
        hasError ? (
          <XIcon className="size-3.5 text-destructive" />
        ) : (
          <CheckIcon className="size-3.5 text-emerald-600" />
        )
      ) : (
        <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
      )}
      <ScrollTextIcon className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">
        {isComplete
          ? `Registros analizados (${errCount} error(es), ${warnCount} advertencia(s))`
          : "Leyendo registros de compilación..."}
      </span>
    </div>
  );
}

const GET_COMPILE_DIAGNOSTICS_TOOL = {
  toolName: "get_compile_diagnostics",
  description:
    "Read structured compilation errors, source line snippets around each error, project integrity checks (wrong main file, case mismatches, missing inputs), active/suggested compiler, and compiler log tail",
  parameters: z.object({
    includeFullLog: z
      .boolean()
      .optional()
      .describe(
        "Whether to include the tail of the raw LaTeX log (helpful for deep debugging)",
      ),
  }),
  execute: async ({
    includeFullLog = true,
  }: {
    includeFullLog?: boolean;
  }): Promise<CompileDiagnosticsResult> => {
    const state = useDocumentStore.getState();
    const mainFile =
      state.files.find((f) => f.id === state.mainFileId) ?? state.files[0];

    let fullLog = state.compileFullLog;
    if (includeFullLog && !fullLog && state.compileBuildId) {
      try {
        const res = await fetch(
          `/api/compile/log?id=${encodeURIComponent(state.compileBuildId)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { log?: string };
          fullLog = data.log ?? null;
        }
      } catch {
        // Ignore network fetch errors; still return parsed store state
      }
    }

    const analysis = analyzeCompileDiagnostics({
      fullLog,
      compileError: state.compileError,
      compileWarnings: state.compileWarnings,
      compiler: state.compiler,
      projectFileNames: state.files.map((f) => f.name),
      mainFileName: mainFile?.name,
    });
    const integrity = inspectProjectCompileIntegrity({
      files: state.files,
      mainFileId: state.mainFileId,
    });

    return {
      success: true,
      compiler: state.compiler,
      mainFile: mainFile?.name,
      hasPdf: Boolean(state.pdfData),
      compileError: state.compileError,
      errorCount: analysis.errorCount,
      warningCount: Math.max(state.compileWarningCount, analysis.warningCount),
      suggestedCompiler: analysis.suggestedCompiler,
      integrity,
      diagnostics: enrichDiagnosticsForAI(analysis, state.files, 15),
      ...(includeFullLog && fullLog
        ? { fullLogTail: fullLog.slice(-18000) }
        : {}),
    };
  },
  render: GetCompileDiagnosticsRender,
};

interface CompilerToolResult extends ToolResult {
  compiler?: LatexCompiler;
  compiled?: boolean;
  compileError?: string | null;
  warningCount?: number;
}

function SetLatexCompilerRender({
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { compiler: LatexCompiler; reason: string },
  CompilerToolResult
>) {
  const aui = useAui();
  const currentCompiler = useDocumentStore((s) => s.compiler);
  const [applying, setApplying] = useState(false);

  const handleReject = () => {
    aui.part().addToolResult({
      success: false,
      rejected: true,
      compiler: currentCompiler,
      message: `El usuario decidió mantener el motor ${currentCompiler}.`,
    });
  };

  const handleApplyAndCompile = async () => {
    setApplying(true);
    try {
      const store = useDocumentStore.getState();
      store.setProjectCompiler(args.compiler);
      const compiled = await compileActiveProject(args.compiler);
      const latest = useDocumentStore.getState();
      aui.part().addToolResult({
        success: true,
        compiler: args.compiler,
        compiled,
        compileError: latest.compileError,
        warningCount: latest.compileWarningCount,
        message: compiled
          ? `Motor cambiado a ${args.compiler} y compilado correctamente.`
          : `Motor cambiado a ${args.compiler}, pero la compilación aún reportó errores.`,
      });
    } finally {
      setApplying(false);
    }
  };

  if (result != null) {
    const isRejected = result.rejected === true;
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
        {isRejected ? (
          <XIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : result.compiled ? (
          <CheckIcon className="size-4 shrink-0 text-emerald-600" />
        ) : (
          <CpuIcon className="size-4 shrink-0 text-amber-500" />
        )}
        <span className="text-muted-foreground">
          {result.message || `Motor: ${result.compiler ?? args.compiler}`}
        </span>
      </div>
    );
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-border border-b bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <CpuIcon className="size-4 text-primary" />
          <span className="font-medium text-foreground text-xs">
            Cambiar motor LaTeX: {currentCompiler} → {args.compiler}
          </span>
        </div>
        {status.type === "running" && (
          <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      {args.reason && (
        <p className="px-3 py-2 text-muted-foreground text-xs">{args.reason}</p>
      )}
      <div className="flex items-center justify-end gap-1.5 border-border border-t bg-muted/20 px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={handleReject}
          disabled={applying || status.type === "running"}
        >
          Mantener {currentCompiler}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1 px-2.5 text-xs"
          onClick={handleApplyAndCompile}
          disabled={applying || status.type === "running"}
        >
          {applying ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <PlayIcon className="size-3" />
          )}
          Usar {args.compiler} y compilar
        </Button>
      </div>
    </div>
  );
}

const SET_LATEX_COMPILER_TOOL = {
  toolName: "set_latex_compiler",
  description:
    "Propose switching the project's LaTeX compiler engine (pdflatex, lualatex, or xelatex) and recompiling, e.g. when fontspec or unicode-math requires xelatex or lualatex",
  parameters: z.object({
    compiler: z
      .enum(["pdflatex", "lualatex", "xelatex"])
      .describe("Target LaTeX compiler engine"),
    reason: z
      .string()
      .describe("Short explanation in Spanish of why this compiler is needed"),
  }),
  render: SetLatexCompilerRender,
};

interface CompileProjectResult extends ToolResult {
  compiled?: boolean;
  compiler?: LatexCompiler;
  hasPdf?: boolean;
  compileError?: string | null;
  errorCount?: number;
  warningCount?: number;
  suggestedCompiler?: LatexCompiler | null;
  diagnostics?: EnrichedDiagnosticItem[];
}

function CompileProjectRender({
  result,
  status,
}: ToolCallMessagePartProps<Record<string, never>, CompileProjectResult>) {
  const isComplete = result != null || status.type === "complete";
  return (
    <div className="my-1.5 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs">
      {isComplete ? (
        result?.compiled ? (
          <CheckIcon className="size-3.5 text-emerald-600" />
        ) : (
          <XIcon className="size-3.5 text-destructive" />
        )
      ) : (
        <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
      )}
      <PlayIcon className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">
        {isComplete
          ? result?.compiled
            ? `Compilado correctamente (${result.warningCount ?? 0} advertencia(s))`
            : `Compilación fallida (${result?.errorCount ?? 1} error(es))`
          : "Compilando proyecto para verificar cambios..."}
      </span>
    </div>
  );
}

const COMPILE_PROJECT_TOOL = {
  toolName: "compile_project",
  description:
    "Trigger a LaTeX compilation of the current project to verify fixes and inspect any remaining errors or warnings",
  parameters: z.object({}),
  execute: async (): Promise<CompileProjectResult> => {
    const compiled = await compileActiveProject();
    const state = useDocumentStore.getState();
    const mainFile =
      state.files.find((f) => f.id === state.mainFileId) ?? state.files[0];

    const analysis = analyzeCompileDiagnostics({
      fullLog: state.compileFullLog,
      compileError: state.compileError,
      compileWarnings: state.compileWarnings,
      compiler: state.compiler,
      projectFileNames: state.files.map((f) => f.name),
      mainFileName: mainFile?.name,
    });

    return {
      success: true,
      compiled,
      compiler: state.compiler,
      hasPdf: Boolean(state.pdfData),
      compileError: state.compileError,
      errorCount: analysis.errorCount,
      warningCount: Math.max(state.compileWarningCount, analysis.warningCount),
      suggestedCompiler: analysis.suggestedCompiler,
      diagnostics: enrichDiagnosticsForAI(analysis, state.files, 10),
    };
  },
  render: CompileProjectRender,
};

interface SetMainFileResult extends ToolResult {
  filePath?: string;
  compiled?: boolean;
  compileError?: string | null;
}

function SetMainFileRender({
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { filePath: string; reason: string },
  SetMainFileResult
>) {
  const aui = useAui();
  const files = useDocumentStore((s) => s.files);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const currentMain =
    files.find((f) => f.id === mainFileId)?.name ?? "main.tex";
  const [applying, setApplying] = useState(false);

  const handleReject = () => {
    aui.part().addToolResult({
      success: false,
      rejected: true,
      filePath: currentMain,
      message: `El usuario decidió mantener "${currentMain}" como archivo principal.`,
    });
  };

  const handleApplyAndCompile = async () => {
    setApplying(true);
    try {
      const store = useDocumentStore.getState();
      const normalized = normalizeRelativePath(args.filePath);
      const target = store.files.find(
        (f) => f.name === (normalized ?? args.filePath) && isTexFile(f),
      );
      if (!target) {
        aui.part().addToolResult({
          success: false,
          error: `No se encontró el archivo .tex "${args.filePath}" en el proyecto.`,
        });
        return;
      }
      store.setMainFile(target.id);
      store.setActiveFile(target.id);
      const compiled = await compileActiveProject();
      const latest = useDocumentStore.getState();
      aui.part().addToolResult({
        success: true,
        filePath: target.name,
        compiled,
        compileError: latest.compileError,
        message: compiled
          ? `"${target.name}" establecido como principal y compilado correctamente.`
          : `"${target.name}" establecido como principal, pero aún hay errores al compilar.`,
      });
    } finally {
      setApplying(false);
    }
  };

  if (result != null) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
        {result.rejected ? (
          <XIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : result.compiled ? (
          <CheckIcon className="size-4 shrink-0 text-emerald-600" />
        ) : (
          <FileCodeIcon className="size-4 shrink-0 text-amber-500" />
        )}
        <span className="text-muted-foreground">
          {result.message ||
            result.error ||
            `Archivo principal: ${args.filePath}`}
        </span>
      </div>
    );
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-border border-b bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <FileCodeIcon className="size-4 text-primary" />
          <span className="font-medium text-foreground text-xs">
            Cambiar archivo principal: {currentMain} → {args.filePath}
          </span>
        </div>
        {status.type === "running" && (
          <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      {args.reason && (
        <p className="px-3 py-2 text-muted-foreground text-xs">{args.reason}</p>
      )}
      <div className="flex items-center justify-end gap-1.5 border-border border-t bg-muted/20 px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={handleReject}
          disabled={applying || status.type === "running"}
        >
          Mantener {currentMain}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1 px-2.5 text-xs"
          onClick={handleApplyAndCompile}
          disabled={applying || status.type === "running"}
        >
          {applying ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <PlayIcon className="size-3" />
          )}
          Establecer y compilar
        </Button>
      </div>
    </div>
  );
}

const SET_MAIN_FILE_TOOL = {
  toolName: "set_main_file",
  description:
    "Propose changing which .tex file is the project's root entrypoint (for example when an imported .zip selected a chapter file instead of the root \\documentclass file) and recompile",
  parameters: z.object({
    filePath: z
      .string()
      .describe(
        "Relative path of the root .tex file containing \\documentclass",
      ),
    reason: z
      .string()
      .describe(
        "Brief explanation in Spanish of why this should be the main file",
      ),
  }),
  render: SetMainFileRender,
};

export const LatexTools: FC = memo(function LatexTools() {
  useAssistantTool(READ_PROJECT_FILE_TOOL);
  useAssistantTool(SEARCH_PROJECT_FILES_TOOL);
  useAssistantTool(GET_COMPILE_DIAGNOSTICS_TOOL);
  useAssistantTool(SET_LATEX_COMPILER_TOOL);
  useAssistantTool(SET_MAIN_FILE_TOOL);
  useAssistantTool(COMPILE_PROJECT_TOOL);
  useAssistantTool(INSERT_LATEX_TOOL);
  useAssistantTool(REPLACE_SELECTION_TOOL);
  useAssistantTool(FIND_AND_REPLACE_TOOL);
  useAssistantTool(REWRITE_PROJECT_FILE_TOOL);
  useAssistantTool(CREATE_PROJECT_FILE_TOOL);

  return null;
});

export const PendingProposalsBanner: FC = () => {
  const pendingProposals = useDocumentStore((s) => s.pendingProposals);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  const pendingList = useMemo(
    () => Object.values(pendingProposals),
    [pendingProposals],
  );
  const firstPendingProposal = pendingList[0] ?? null;

  if (!firstPendingProposal) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-amber-500/30 border-b bg-amber-500/10 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
          <GitCompareIcon className="size-3.5 shrink-0" />
          <span>
            {pendingList.length === 1
              ? `Cambio propuesto en ${firstPendingProposal.fileName} pendiente de validación`
              : `${pendingList.length} cambios propuestos pendientes de validación`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setReviewDialogOpen(true)}
          >
            Ver diff
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => firstPendingProposal.onReject()}
          >
            <XIcon className="mr-1 size-3 text-destructive" />
            Rechazar
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => firstPendingProposal.onApprove(false)}
          >
            <CheckIcon className="mr-1 size-3" />
            Aceptar
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => firstPendingProposal.onApprove(true)}
          >
            <PlayIcon className="mr-1 size-3" />
            Aceptar y compilar
          </Button>
        </div>
      </div>

      <DiffReviewDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        fileName={firstPendingProposal.fileName}
        before={firstPendingProposal.beforeContent}
        after={firstPendingProposal.afterContent}
        onApprove={firstPendingProposal.onApprove}
        onReject={firstPendingProposal.onReject}
      />
    </>
  );
};
