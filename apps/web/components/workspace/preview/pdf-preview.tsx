"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAui } from "@assistant-ui/react";
import {
  FileTextIcon,
  AlertCircleIcon,
  LoaderIcon,
  RefreshCwIcon,
  MinusIcon,
  PlusIcon,
  DownloadIcon,
  SparklesIcon,
} from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compileActiveProject } from "@/lib/compile-active-project";
import type { LatexCompiler } from "@/lib/latex-compiler";
import { parseLatexLogErrors } from "@/lib/text-diff";

const ZOOM_OPTIONS = [
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
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
  const isCompiling = useDocumentStore((s) => s.isCompiling);
  const isSaving = useDocumentStore((s) => s.isSaving);
  const content = useDocumentStore((s) => s.content);
  const requestJumpToPosition = useDocumentStore(
    (s) => s.requestJumpToPosition,
  );
  const initialized = useDocumentStore((s) => s.initialized);

  const [pdfError, setPdfError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const compiledProjectsRef = useRef<Set<string>>(new Set());

  const parsedErrors = useMemo(
    () => (compileError ? parseLatexLogErrors(compileError) : []),
    [compileError],
  );

  const handleTextClick = useCallback(
    (text: string) => {
      let index = content.indexOf(text);

      if (index === -1) {
        const cleanText = text.replace(/[{}\\$]/g, "");
        if (cleanText.length > 2) {
          index = content.indexOf(cleanText);
        }
      }

      if (index === -1 && text.length > 5) {
        const words = text.split(/\s+/).filter((w) => w.length > 3);
        for (const word of words) {
          index = content.indexOf(word);
          if (index !== -1) break;
        }
      }

      if (index !== -1) {
        requestJumpToPosition(index);
      }
    },
    [content, requestJumpToPosition],
  );

  const runCompile = useCallback(async (overrideCompiler?: LatexCompiler) => {
    setPdfError(null);
    await compileActiveProject(overrideCompiler);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (compiledProjectsRef.current.has(activeProjectId)) return;
    if (pdfData || isCompiling || compileError) return;

    compiledProjectsRef.current.add(activeProjectId);
    runCompile();
  }, [
    activeProjectId,
    initialized,
    pdfData,
    isCompiling,
    compileError,
    runCompile,
  ]);

  const zoomIn = () => setScale((s) => Math.min(4, s + 0.1));
  const zoomOut = () => setScale((s) => Math.max(0.25, s - 0.1));

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

  const handleLoadSuccess = (pages: number) => {
    setNumPages(pages);
  };

  const handleScaleChange = (newScale: number) => {
    setScale(newScale);
  };

  const handleCompilerChange = (nextCompiler: string) => {
    const resolved = nextCompiler as LatexCompiler;
    setProjectCompiler(resolved);
    runCompile(resolved);
  };

  const handleJumpToMainLine = (lineNumber: number) => {
    const state = useDocumentStore.getState();
    const mainFile =
      state.files.find((f) => f.id === state.mainFileId) ?? state.files[0];
    if (!mainFile) return;

    if (state.activeFileId !== mainFile.id) {
      state.setActiveFile(mainFile.id);
    }

    const lines = (mainFile.content ?? "").split("\n");
    let offset = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }

    setTimeout(() => {
      useDocumentStore.getState().requestJumpToPosition(offset);
    }, 30);
  };

  const handleFixWithAI = () => {
    if (!compileError) return;
    const state = useDocumentStore.getState();
    const mainFile =
      state.files.find((f) => f.id === state.mainFileId) ?? state.files[0];

    if (mainFile && state.activeFileId !== mainFile.id) {
      state.setActiveFile(mainFile.id);
    }

    const prompt = `Ocurrió el siguiente error al compilar con ${state.compiler} (archivo principal: ${mainFile?.name ?? "document.tex"}):\n\n\`\`\`\n${compileError.slice(0, 1500)}\n\`\`\`\n\nPor favor diagnostica el problema y propón el cambio con find_and_replace para corregirlo.`;

    aui.thread().append({
      role: "user",
      content: [{ type: "text", text: prompt }],
    });
  };

  const renderContent = () => {
    if (compileError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center overflow-auto bg-muted/30 p-6">
          <AlertCircleIcon className="mb-3 size-10 text-destructive" />
          <h2 className="mb-2 font-medium text-destructive text-lg">
            Error de compilación
          </h2>

          {parsedErrors.length > 0 && (
            <div className="mb-3 w-full max-w-lg space-y-1.5">
              {parsedErrors.map((err, idx) => (
                <div
                  key={`${idx}-${err.line ?? "x"}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs"
                >
                  <span className="truncate font-mono text-destructive">
                    {err.message}
                  </span>
                  {err.line != null && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 shrink-0 px-2 text-xs"
                      onClick={() => handleJumpToMainLine(err.line!)}
                    >
                      Ir a línea {err.line}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <pre className="mb-4 max-h-56 w-full max-w-lg overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-mono text-muted-foreground text-xs">
            {compileError}
          </pre>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleFixWithAI}>
              <SparklesIcon className="mr-1.5 size-4" />
              Corregir con IA
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => runCompile()}
              disabled={isCompiling}
            >
              <RefreshCwIcon className="mr-1.5 size-4" />
              Reintentar
            </Button>
          </div>
        </div>
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
        onError={setPdfError}
        onLoadSuccess={handleLoadSuccess}
        onScaleChange={handleScaleChange}
        onTextClick={handleTextClick}
      />
    );
  };

  return (
    <div className="flex h-full flex-col bg-muted/50">
      <div className="flex h-9 items-center justify-between border-border border-b bg-background px-2">
        <div className="flex items-center gap-1.5">
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
            </SelectContent>
          </Select>
        </div>

        {pdfData && (
          <div className="flex items-center gap-0.5">
            <span className="mr-2 text-muted-foreground text-xs">
              {numPages} {numPages === 1 ? "página" : "páginas"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={zoomOut}
              disabled={scale <= 0.25}
            >
              <MinusIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={zoomIn}
              disabled={scale >= 4}
            >
              <PlusIcon className="size-3.5" />
            </Button>
            <Select
              value={scale.toString()}
              onValueChange={(v) => setScale(Number(v))}
            >
              <SelectTrigger size="sm" className="h-6! w-auto text-xs">
                <SelectValue>{Math.round(scale * 100)}%</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ZOOM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
    </div>
  );
}
