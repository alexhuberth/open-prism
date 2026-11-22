"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAui } from "@assistant-ui/react";
import { toast } from "sonner";
import {
  FileTextIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  LoaderIcon,
  RefreshCwIcon,
  DownloadIcon,
  ScrollTextIcon,
  ScanIcon,
  ChevronDownIcon,
  CheckIcon,
} from "lucide-react";
import { CompileLogDialog } from "./compile-log-dialog";
import { CompileRecordsPanel } from "./compile-records-panel";
import { useDocumentStore } from "@/stores/document-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compileActiveProject } from "@/lib/compile-active-project";
import type { LatexCompiler } from "@/lib/latex-compiler";

const ZOOM_PRESETS = [
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "100%" },
  { value: 1.5, label: "150%" },
  { value: 2, label: "200%" },
  { value: 3, label: "300%" },
  { value: 4, label: "400%" },
];

const PdfViewer = dynamic(
  () => import("./pdf-viewer").then((mod) => mod.PdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function PdfPreview() {
  const aui = useAui();
  const activeProjectId = useDocumentStore((s) => s.activeProjectId);
  const compiler = useDocumentStore((s) => s.compiler);
  const setProjectCompiler = useDocumentStore((s) => s.setProjectCompiler);
  const pdfData = useDocumentStore((s) => s.pdfData);
  const compileError = useDocumentStore((s) => s.compileError);
  const compileBuildId = useDocumentStore((s) => s.compileBuildId);
  const compileWarningCount = useDocumentStore((s) => s.compileWarningCount);
  const compileFullLog = useDocumentStore((s) => s.compileFullLog);
  const pdfSyncTarget = useDocumentStore((s) => s.pdfSyncTarget);
  const clearPdfSyncTarget = useDocumentStore((s) => s.clearPdfSyncTarget);
  const isCompiling = useDocumentStore((s) => s.isCompiling);
  const isSaving = useDocumentStore((s) => s.isSaving);
  const requestJumpToPosition = useDocumentStore(
    (s) => s.requestJumpToPosition,
  );
  const hydrated = useDocumentStore((s) => s.hydrated);
  const initialized = useDocumentStore((s) => s.initialized);

  const [pdfError, setPdfError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState<string>("1");
  const [jumpToPage, setJumpToPage] = useState<{
    page: number;
    nonce: number;
  } | null>(null);
  const [fitToWidth, setFitToWidth] = useState<boolean>(true);
  const [scale, setScale] = useState<number>(1.0);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const compiledProjectsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!pdfSyncTarget) return;
    const timer = setTimeout(() => {
      clearPdfSyncTarget();
    }, 2600);
    return () => clearTimeout(timer);
  }, [pdfSyncTarget, clearPdfSyncTarget]);

  const handlePageDoubleClick = useCallback(
    async ({ page, xPt, yPt }: { page: number; xPt: number; yPt: number }) => {
      const state = useDocumentStore.getState();
      const buildId = state.compileBuildId;

      if (!buildId) {
        toast.info(
          "Recompila el documento una vez para activar el salto exacto SyncTeX.",
        );
        return;
      }

      try {
        const res = await fetch("/api/compile/synctex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buildId,
            direction: "inverse",
            page,
            xPt,
            yPt,
          }),
        });
        const data = (await res.json()) as {
          file?: string;
          line?: number;
          error?: string;
        };
        if (!res.ok || !data.file || !data.line) {
          toast.error(data.error || "No se pudo ubicar la línea en el código.");
          return;
        }

        const latest = useDocumentStore.getState();
        const normalizedTarget = data.file
          .replaceAll("\\", "/")
          .replace(/^\.\//, "");
        const targetFile =
          latest.files.find((f) => f.name === normalizedTarget) ??
          latest.files.find(
            (f) =>
              f.name.endsWith(`/${normalizedTarget}`) ||
              normalizedTarget.endsWith(`/${f.name}`),
          );

        if (!targetFile) {
          toast.error(`No se encontró el archivo ${normalizedTarget}`);
          return;
        }

        if (latest.activeFileId !== targetFile.id) {
          latest.setActiveFile(targetFile.id);
        }

        const lines = (targetFile.content ?? "").split("\n");
        let offset = 0;
        for (let i = 0; i < data.line - 1 && i < lines.length; i++) {
          offset += lines[i].length + 1;
        }

        setTimeout(() => {
          requestJumpToPosition(offset);
        }, 35);

        toast.success(`${targetFile.name} : línea ${data.line}`, {
          duration: 1600,
        });
      } catch {
        toast.error("Error al consultar SyncTeX.");
      }
    },
    [requestJumpToPosition],
  );

  const runCompile = useCallback(async (overrideCompiler?: LatexCompiler) => {
    setPdfError(null);
    await compileActiveProject(overrideCompiler);
  }, []);

  useEffect(() => {
    if (!hydrated || !initialized) return;
    if (compiledProjectsRef.current.has(activeProjectId)) return;
    if (pdfData || isCompiling || compileError) return;

    compiledProjectsRef.current.add(activeProjectId);
    runCompile();
  }, [
    activeProjectId,
    hydrated,
    initialized,
    pdfData,
    isCompiling,
    compileError,
    runCompile,
  ]);

  const zoomIn = useCallback(() => {
    setFitToWidth(false);
    setScale((s) => Math.min(4, Math.round((s + 0.15) * 100) / 100));
  }, []);

  const zoomOut = useCallback(() => {
    setFitToWidth(false);
    setScale((s) => Math.max(0.25, Math.round((s - 0.15) * 100) / 100));
  }, []);

  const handleSelectFitToWidth = useCallback(() => {
    setFitToWidth(true);
  }, []);

  const handleSelectZoomPreset = useCallback((preset: number) => {
    setFitToWidth(false);
    setScale(preset);
  }, []);

  const handleDownload = () => {
    if (!pdfData) return;
    const blob = new Blob([new Uint8Array(pdfData)], {
      type: "application/pdf",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadSuccess = useCallback((pages: number) => {
    setNumPages(pages);
  }, []);

  const handleCurrentPageChange = useCallback((page: number) => {
    setCurrentPage(page);
    setPageInput(String(page));
  }, []);

  const handlePageJumpCommit = () => {
    if (numPages <= 1) return;
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    const clamped = Math.min(numPages, Math.max(1, parsed));
    setPageInput(String(clamped));
    setJumpToPage((prev) => ({
      page: clamped,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  };

  const handleFitScaleChange = useCallback((newScale: number) => {
    setScale(newScale);
  }, []);

  const handleManualScaleChange = useCallback((newScale: number) => {
    setFitToWidth(false);
    setScale(newScale);
  }, []);

  const handleCompilerChange = (nextCompiler: string) => {
    const resolved = nextCompiler as LatexCompiler;
    setProjectCompiler(resolved);
    runCompile(resolved);
  };

  const handleJumpToLocation = useCallback(
    (targetFileName: string | undefined, lineNumber: number) => {
      const state = useDocumentStore.getState();
      const targetFile =
        (targetFileName &&
          (state.files.find((f) => f.name === targetFileName) ??
            state.files.find(
              (f) =>
                f.name.endsWith(`/${targetFileName}`) ||
                targetFileName.endsWith(`/${f.name}`),
            ))) ||
        state.files.find((f) => f.id === state.mainFileId) ||
        state.files[0];
      if (!targetFile) return;

      if (state.activeFileId !== targetFile.id) {
        state.setActiveFile(targetFile.id);
      }

      const lines = (targetFile.content ?? "").split("\n");
      let offset = 0;
      for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
        offset += lines[i].length + 1;
      }

      setTimeout(() => {
        useDocumentStore.getState().requestJumpToPosition(offset);
      }, 35);
    },
    [],
  );

  const handleFixWithAI = useCallback(
    (customPrompt: string) => {
      aui.thread().append({
        role: "user",
        content: [{ type: "text", text: customPrompt }],
      });
    },
    [aui],
  );

  const renderContent = () => {
    if (compileError) {
      return (
        <CompileRecordsPanel
          mode="panel"
          onJumpToLocation={handleJumpToLocation}
          onFixWithAI={handleFixWithAI}
          onSwitchCompilerAndCompile={handleCompilerChange}
          onRetryCompile={() => runCompile()}
        />
      );
    }

    if (!pdfData) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center bg-muted/30 p-8">
          <FileTextIcon className="mb-4 size-16 text-muted-foreground/50" />
          <h2 className="mb-2 font-medium text-lg text-muted-foreground">
            Vista previa del PDF
          </h2>
          <p className="text-center text-muted-foreground text-sm">
            Presiona Enter en el editor para compilar y ver tu documento
          </p>
        </div>
      );
    }

    if (pdfError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center bg-muted/30 p-8">
          <AlertCircleIcon className="mb-4 size-12 text-destructive" />
          <h2 className="mb-2 font-medium text-destructive text-lg">
            Error al cargar el PDF
          </h2>
          <p className="max-w-md text-center text-muted-foreground text-sm">
            {pdfError}
          </p>
        </div>
      );
    }

    return (
      <PdfViewer
        data={pdfData}
        scale={scale}
        fitToWidth={fitToWidth}
        jumpToPage={jumpToPage}
        syncHighlight={pdfSyncTarget}
        onError={setPdfError}
        onLoadSuccess={handleLoadSuccess}
        onCurrentPageChange={handleCurrentPageChange}
        onFitScaleChange={handleFitScaleChange}
        onManualScaleChange={handleManualScaleChange}
        onPageDoubleClick={handlePageDoubleClick}
      />
    );
  };

  return (
    <div
      className="@container flex h-full flex-col bg-muted/50"
      onKeyDown={(e) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        if (e.key === "0") {
          e.preventDefault();
          handleSelectFitToWidth();
        } else if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          zoomIn();
        } else if (e.key === "-") {
          e.preventDefault();
          zoomOut();
        }
      }}
    >
      <div className="flex h-9 items-center justify-between gap-2 overflow-x-auto border-border border-b bg-background px-2 [&::-webkit-scrollbar]:hidden">
        <div className="flex shrink-0 items-center gap-1">
          {isSaving && (
            <>
              <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground text-xs">
                Guardando...
              </span>
            </>
          )}
          {!isSaving && isCompiling && (
            <>
              <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground text-xs">
                Compilando...
              </span>
            </>
          )}
          {!isSaving && !isCompiling && pdfData && (
            <>
              <span className="text-muted-foreground text-xs">Listo</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => runCompile()}
                title="Recompilar"
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
            </>
          )}
          {!isSaving && !isCompiling && compileError && (
            <>
              <span className="text-destructive text-xs">Error</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => runCompile()}
                title="Reintentar compilación"
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
            </>
          )}
          {!isSaving && !isCompiling && !pdfData && !compileError && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => runCompile()}
              title="Compilar"
            >
              <RefreshCwIcon className="size-3.5" />
            </Button>
          )}

          <Select value={compiler} onValueChange={handleCompilerChange}>
            <SelectTrigger size="sm" className="ml-1 h-6! w-auto text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdflatex">pdflatex</SelectItem>
              <SelectItem value="lualatex">lualatex</SelectItem>
              <SelectItem value="xelatex">xelatex</SelectItem>
            </SelectContent>
          </Select>

          {(compileBuildId || compileFullLog) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-1 h-6 gap-1 px-1.5 text-xs"
              onClick={() => setLogDialogOpen(true)}
              title="Registros: ver advertencias, errores y log completo"
            >
              {compileWarningCount > 0 ? (
                <>
                  <AlertTriangleIcon className="size-3.5 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">
                    {compileWarningCount}
                  </span>
                </>
              ) : (
                <ScrollTextIcon className="size-3.5 text-muted-foreground" />
              )}
            </Button>
          )}
        </div>

        {pdfData && (
          <div className="flex shrink-0 items-center gap-0.5">
            {numPages > 1 ? (
              <div className="mr-1 flex items-center gap-1 whitespace-nowrap text-muted-foreground text-xs">
                <span className="@[450px]:inline hidden">Pág.</span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Ir a página del PDF"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onBlur={handlePageJumpCommit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                      handlePageJumpCommit();
                    }
                  }}
                  className="h-5 w-8 rounded border border-input bg-background px-1 text-center text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span>/ {numPages}</span>
              </div>
            ) : (
              <span className="mr-1 whitespace-nowrap text-muted-foreground text-xs">
                {numPages} {numPages === 1 ? "página" : "páginas"}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 whitespace-nowrap px-1.5 font-normal text-xs"
                  aria-label="Opciones de zoom del PDF"
                  title={
                    fitToWidth
                      ? "Ajustar al tamaño (⌘0)"
                      : `Zoom ${Math.round(scale * 100)}%`
                  }
                >
                  <ScanIcon className="size-3.5 text-muted-foreground" />
                  <span>
                    {fitToWidth ? (
                      <>
                        Ajustar
                        <span className="@[480px]:inline hidden">
                          {" "}
                          al tamaño
                        </span>
                      </>
                    ) : (
                      `${Math.round(scale * 100)}%`
                    )}
                  </span>
                  <ChevronDownIcon className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={handleSelectFitToWidth}>
                  <CheckIcon
                    className={`size-3.5 ${fitToWidth ? "opacity-100" : "opacity-0"}`}
                  />
                  <span>Ajustar al tamaño</span>
                  <DropdownMenuShortcut>⌘0</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={zoomIn} disabled={scale >= 4}>
                  <span className="size-3.5" />
                  <span>Acercar</span>
                  <DropdownMenuShortcut>⌘+</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={zoomOut} disabled={scale <= 0.25}>
                  <span className="size-3.5" />
                  <span>Alejar</span>
                  <DropdownMenuShortcut>⌘-</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {ZOOM_PRESETS.map((preset) => {
                  const isActive =
                    !fitToWidth && Math.abs(scale - preset.value) < 0.02;
                  return (
                    <DropdownMenuItem
                      key={preset.value}
                      onSelect={() => handleSelectZoomPreset(preset.value)}
                    >
                      <CheckIcon
                        className={`size-3.5 ${isActive ? "opacity-100" : "opacity-0"}`}
                      />
                      <span>{preset.label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={handleDownload}
              title="Descargar PDF"
            >
              <DownloadIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {renderContent()}

      <CompileLogDialog
        open={logDialogOpen}
        onOpenChange={setLogDialogOpen}
        onJumpToLocation={handleJumpToLocation}
        onFixWithAI={handleFixWithAI}
        onSwitchCompilerAndCompile={handleCompilerChange}
      />
    </div>
  );
}
