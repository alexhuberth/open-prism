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
  ExpandIcon,
  FilePlus2Icon,
  FileSearchIcon,
  GitCompareIcon,
  LoaderIcon,
  PlayIcon,
  PlusIcon,
  ReplaceIcon,
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
import {
  classifyFileName,
  isTextFile,
  normalizeRelativePath,
} from "@/lib/project-files";
import { useDocumentStore } from "@/stores/document-store";

type LatexToolName =
  | "insert_latex"
  | "replace_selection"
  | "find_and_replace"
  | "create_project_file";

interface ToolResult {
  success: boolean;
  rejected?: boolean;
  message?: string;
  error?: string;
}

interface ReadProjectFileResult extends ToolResult {
  filePath?: string;
  content?: string;
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

  if (toolName === "create_project_file") {
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
        afterContent: args.content ?? "",
      };
    }

    return {
      isNewFile: true,
      fileId: "",
      fileName: normalized,
      beforeContent: "",
      afterContent: args.content ?? "",
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

  const find = args.find ?? "";
  const replace = args.replace ?? "";
  if (!find || !beforeContent.includes(find)) {
    return {
      fileId,
      fileName,
      beforeContent,
      afterContent: beforeContent,
      validationError: `No se encontró "${find}" en ${fileName}`,
    };
  }

  return {
    fileId,
    fileName,
    beforeContent,
    afterContent: beforeContent.replace(find, replace),
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

const READ_PROJECT_FILE_TOOL = {
  toolName: "read_project_file",
  description:
    "Read the text content of any file in the current project (e.g., sections, .bib, .sty, .cls)",
  parameters: z.object({
    filePath: z
      .string()
      .describe("The relative path of the file to read in the project"),
  }),
  execute: async ({
    filePath,
  }: {
    filePath: string;
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
    return {
      success: true,
      filePath: target.name,
      content: target.content ?? "",
    };
  },
  render: ReadProjectFileRender,
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

export const LatexTools: FC = memo(function LatexTools() {
  useAssistantTool(READ_PROJECT_FILE_TOOL);
  useAssistantTool(INSERT_LATEX_TOOL);
  useAssistantTool(REPLACE_SELECTION_TOOL);
  useAssistantTool(FIND_AND_REPLACE_TOOL);
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
