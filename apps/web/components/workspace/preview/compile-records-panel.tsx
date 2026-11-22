"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  LoaderIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LatexCompiler } from "@/lib/latex-compiler";
import {
  analyzeCompileDiagnostics,
  buildFixPromptForDiagnostics,
  type CompileDiagnosticItem,
} from "@/lib/latex-log-parser";
import { useDocumentStore } from "@/stores/document-store";

interface CompileRecordsPanelProps {
  mode: "panel" | "dialog";
  onJumpToLocation: (fileName: string | undefined, lineNumber: number) => void;
  onFixWithAI: (prompt: string) => void;
  onSwitchCompilerAndCompile: (compiler: LatexCompiler) => void;
  onRetryCompile?: () => void;
  onAfterNavigate?: () => void;
}

function DiagnosticCard({
  item,
  onJumpToLocation,
  onFixItem,
  onAfterNavigate,
}: {
  item: CompileDiagnosticItem;
  onJumpToLocation: (fileName: string | undefined, lineNumber: number) => void;
  onFixItem: (item: CompileDiagnosticItem) => void;
  onAfterNavigate?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const excerptLines = useMemo(() => item.excerpt.split("\n"), [item.excerpt]);
  const isTruncatable = excerptLines.length > 4 || item.excerpt.length > 220;
  const displayedExcerpt = expanded
    ? item.excerpt
    : excerptLines.slice(0, 4).join("\n").slice(0, 220);

  const locationLabel = item.file
    ? item.line
      ? `${item.file}:${item.line}`
      : item.file
    : null;
  const canJump = Boolean(item.isProjectFile && item.line != null);

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        item.severity === "error"
          ? "border-destructive/30 bg-destructive/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {item.severity === "error" ? (
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          )}
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium text-foreground text-xs leading-snug">
              {item.title}
            </p>
            {locationLabel && (
              <div className="mt-0.5">
                {canJump && item.line != null ? (
                  <button
                    type="button"
                    onClick={() => {
                      onJumpToLocation(item.file, item.line!);
                      onAfterNavigate?.();
                    }}
                    className="font-mono text-[11px] text-primary hover:underline"
                    title="Saltar a esta línea en el editor"
                  >
                    {locationLabel}
                  </button>
                ) : (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {locationLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-6 shrink-0 gap-1 px-2 text-[11px]"
          onClick={() => onFixItem(item)}
        >
          <SparklesIcon className="size-3" />
          Arreglar con IA
        </Button>
      </div>

      {item.excerpt.trim() && item.excerpt.trim() !== item.title.trim() && (
        <div className="mt-2 pl-6">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground leading-relaxed">
            {displayedExcerpt}
            {!expanded && isTruncatable ? "..." : ""}
          </pre>
          {isTruncatable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 font-medium text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {expanded ? (
                <>
                  Mostrar menos <ChevronUpIcon className="size-3" />
                </>
              ) : (
                <>
                  Mostrar más <ChevronDownIcon className="size-3" />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CompileRecordsPanel({
  mode,
  onJumpToLocation,
  onFixWithAI,
  onSwitchCompilerAndCompile,
  onRetryCompile,
  onAfterNavigate,
}: CompileRecordsPanelProps) {
  const files = useDocumentStore((s) => s.files);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const compiler = useDocumentStore((s) => s.compiler);
  const isCompiling = useDocumentStore((s) => s.isCompiling);
  const compileError = useDocumentStore((s) => s.compileError);
  const compileBuildId = useDocumentStore((s) => s.compileBuildId);
  const compileWarnings = useDocumentStore((s) => s.compileWarnings);
  const compileWarningCount = useDocumentStore((s) => s.compileWarningCount);
  const compileFullLog = useDocumentStore((s) => s.compileFullLog);

  const [activeTab, setActiveTab] = useState<"diagnostics" | "log">(
    "diagnostics",
  );
  const [severityFilter, setSeverityFilter] = useState<
    "all" | "error" | "warning"
  >("all");
  const [fetchedLog, setFetchedLog] = useState<string | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [logFetchError, setLogFetchError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mainFile = useMemo(
    () => files.find((f) => f.id === mainFileId) ?? files[0],
    [files, mainFileId],
  );

  const resolvedLog = compileFullLog ?? fetchedLog;

  useEffect(() => {
    setFetchedLog(null);
    setLogFetchError(null);
  }, [compileBuildId]);

  useEffect(() => {
    if (activeTab !== "log") return;
    if (compileFullLog || fetchedLog || !compileBuildId) return;

    let cancelled = false;
    setLoadingLog(true);
    setLogFetchError(null);

    fetch(`/api/compile/log?id=${encodeURIComponent(compileBuildId)}`)
      .then(async (res) => {
        const data = (await res.json()) as { log?: string; error?: string };
        if (!res.ok) {
          throw new Error(
            data.error || "No se pudo obtener el log de compilación.",
          );
        }
        if (!cancelled) {
          setFetchedLog(data.log ?? "");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLogFetchError(
            err instanceof Error
              ? err.message
              : "Error al cargar el log completo.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, compileBuildId, compileFullLog, fetchedLog]);

  const analysis = useMemo(
    () =>
      analyzeCompileDiagnostics({
        fullLog: resolvedLog,
        compileError,
        compileWarnings,
        compiler,
        projectFileNames: files.map((f) => f.name),
        mainFileName: mainFile?.name,
      }),
    [
      resolvedLog,
      compileError,
      compileWarnings,
      compiler,
      files,
      mainFile?.name,
    ],
  );

  const totalDiagnostics = analysis.diagnostics.length;
  const effectiveWarningCount = Math.max(
    compileWarningCount,
    analysis.warningCount,
  );

  const visibleDiagnostics = useMemo(() => {
    if (severityFilter === "all") return analysis.diagnostics;
    return analysis.diagnostics.filter((d) => d.severity === severityFilter);
  }, [analysis.diagnostics, severityFilter]);

  const handleCopyLog = async () => {
    if (!resolvedLog) return;
    await navigator.clipboard.writeText(resolvedLog);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleFixAll = () => {
    if (analysis.diagnostics.length === 0) return;
    const prompt = buildFixPromptForDiagnostics({
      diagnostics: analysis.diagnostics,
      compiler,
      mainFileName: mainFile?.name,
      suggestedCompiler: analysis.suggestedCompiler,
      singleItemOnly: false,
    });
    onFixWithAI(prompt);
    onAfterNavigate?.();
  };

  const handleFixSingle = (item: CompileDiagnosticItem) => {
    const prompt = buildFixPromptForDiagnostics({
      diagnostics: [item],
      compiler,
      mainFileName: mainFile?.name,
      suggestedCompiler: item.suggestedCompiler ?? analysis.suggestedCompiler,
      singleItemOnly: true,
    });
    onFixWithAI(prompt);
    onAfterNavigate?.();
  };

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${
        mode === "panel" ? "bg-background p-4" : ""
      }`}
    >
      {/* Header row matching Prism "Advertencias y errores" + "Arreglar todo con IA" */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-foreground text-sm">
            Advertencias y errores
          </h3>
          {analysis.errorCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-[11px] text-destructive">
              <AlertCircleIcon className="size-3" />
              {analysis.errorCount}{" "}
              {analysis.errorCount === 1 ? "error" : "errores"}
            </span>
          )}
          {effectiveWarningCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangleIcon className="size-3" />
              {effectiveWarningCount}{" "}
              {effectiveWarningCount === 1 ? "advertencia" : "advertencias"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onRetryCompile && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={onRetryCompile}
              disabled={isCompiling}
            >
              <RefreshCwIcon
                className={`size-3.5 ${isCompiling ? "animate-spin" : ""}`}
              />
              Reintentar
            </Button>
          )}
          {totalDiagnostics > 0 && (
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={handleFixAll}
            >
              <SparklesIcon className="size-3.5" />
              Arreglar todo con IA
            </Button>
          )}
        </div>
      </div>

      {/* Tabs + severity filters */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-border border-b pb-2">
        <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("diagnostics")}
            className={`rounded px-2.5 py-1 font-medium text-xs transition-colors ${
              activeTab === "diagnostics"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Registros ({totalDiagnostics})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("log")}
            className={`rounded px-2.5 py-1 font-medium text-xs transition-colors ${
              activeTab === "log"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Log completo
          </button>
        </div>

        {activeTab === "diagnostics" &&
          analysis.errorCount > 0 &&
          analysis.warningCount > 0 && (
            <div className="flex items-center gap-1 text-[11px]">
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "error", label: "Errores" },
                  { id: "warning", label: "Advertencias" },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setSeverityFilter(chip.id)}
                  className={`rounded-md px-2 py-0.5 transition-colors ${
                    severityFilter === chip.id
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

        {activeTab === "log" && resolvedLog && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleCopyLog}
          >
            {copied ? (
              <>
                <CheckIcon className="size-3.5 text-emerald-500" />
                Copiado
              </>
            ) : (
              <>
                <CopyIcon className="size-3.5" />
                Copiar log
              </>
            )}
          </Button>
        )}
      </div>

      {/* Body */}
      {activeTab === "diagnostics" ? (
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5">
          {analysis.engineHintTitle &&
            analysis.engineHintDescription &&
            analysis.suggestedCompiler && (
              <div className="rounded-lg border border-destructive/35 bg-destructive/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div>
                      <p className="font-semibold text-foreground text-xs">
                        {analysis.engineHintTitle}
                      </p>
                      {mainFile?.name && (
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {mainFile.name}
                        </p>
                      )}
                      <p className="mt-1 text-muted-foreground text-xs">
                        {analysis.engineHintDescription}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => {
                        onSwitchCompilerAndCompile("xelatex");
                        onAfterNavigate?.();
                      }}
                      disabled={isCompiling}
                    >
                      Usar XeLaTeX
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => {
                        onSwitchCompilerAndCompile("lualatex");
                        onAfterNavigate?.();
                      }}
                      disabled={isCompiling}
                    >
                      Usar LuaLaTeX
                    </Button>
                  </div>
                </div>
              </div>
            )}

          {visibleDiagnostics.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 p-6 text-center text-muted-foreground text-xs">
              <CheckCircle2Icon className="size-6 text-emerald-500" />
              <p>
                {compileBuildId || resolvedLog
                  ? "No se detectaron errores ni advertencias en esta compilación."
                  : "Compila el documento para revisar errores, advertencias y registros del compilador."}
              </p>
            </div>
          ) : (
            visibleDiagnostics.map((item) => (
              <DiagnosticCard
                key={item.id}
                item={item}
                onJumpToLocation={onJumpToLocation}
                onFixItem={handleFixSingle}
                onAfterNavigate={onAfterNavigate}
              />
            ))
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          {loadingLog ? (
            <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground text-xs">
              <LoaderIcon className="size-4 animate-spin" />
              Cargando log de compilación...
            </div>
          ) : logFetchError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs">
              {logFetchError}
            </div>
          ) : resolvedLog ? (
            <pre className="h-full max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] text-muted-foreground leading-relaxed">
              {resolvedLog}
            </pre>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-muted-foreground text-xs">
              No hay un log disponible todavía para este proyecto. Haz clic en
              Recompilar para generarlo.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
