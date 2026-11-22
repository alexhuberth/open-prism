"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  LoaderIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDocumentStore } from "@/stores/document-store";

interface CompileLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJumpToLine: (line: number) => void;
}

function extractWarningLine(warning: string): number | null {
  const match = warning.match(/(?:on input line|lines?)\s+(\d+)/i);
  if (!match) return null;
  const line = Number.parseInt(match[1], 10);
  return Number.isFinite(line) && line > 0 ? line : null;
}

export function CompileLogDialog({
  open,
  onOpenChange,
  onJumpToLine,
}: CompileLogDialogProps) {
  const compiler = useDocumentStore((s) => s.compiler);
  const compileBuildId = useDocumentStore((s) => s.compileBuildId);
  const compileWarnings = useDocumentStore((s) => s.compileWarnings);
  const compileWarningCount = useDocumentStore((s) => s.compileWarningCount);
  const compileFullLog = useDocumentStore((s) => s.compileFullLog);
  const compileError = useDocumentStore((s) => s.compileError);

  const [tab, setTab] = useState<"warnings" | "log">("warnings");
  const [fetchedLog, setFetchedLog] = useState<string | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [logFetchError, setLogFetchError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (compileError && compileWarnings.length === 0) {
      setTab("log");
    } else {
      setTab("warnings");
    }
  }, [open, compileError, compileWarnings.length]);

  useEffect(() => {
    setFetchedLog(null);
    setLogFetchError(null);
  }, [compileBuildId]);

  useEffect(() => {
    if (!open || tab !== "log") return;
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
  }, [open, tab, compileBuildId, compileFullLog, fetchedLog]);

  const resolvedLog = compileFullLog ?? fetchedLog;

  const handleCopyLog = async () => {
    if (!resolvedLog) return;
    await navigator.clipboard.writeText(resolvedLog);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileTextIcon className="size-4 text-primary" />
            Diagnóstico y log de compilación ({compiler})
          </DialogTitle>
          <DialogDescription>
            Revisa advertencias de LaTeX y la salida completa del compilador.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-border border-b pb-2">
          <div className="flex items-center gap-1 rounded-md bg-muted p-1">
            <button
              type="button"
              onClick={() => setTab("warnings")}
              className={`rounded px-2.5 py-1 font-medium text-xs transition-colors ${
                tab === "warnings"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Advertencias ({compileWarningCount})
            </button>
            <button
              type="button"
              onClick={() => setTab("log")}
              className={`rounded px-2.5 py-1 font-medium text-xs transition-colors ${
                tab === "log"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Log completo
            </button>
          </div>

          {tab === "log" && resolvedLog && (
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

        {tab === "warnings" ? (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1">
            {compileWarnings.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-muted-foreground text-xs">
                {compileBuildId || compileFullLog
                  ? "No se detectaron advertencias en esta compilación."
                  : "Compila el documento para ver advertencias y detalles de esta ejecución."}
              </div>
            ) : (
              compileWarnings.map((warning, idx) => {
                const lineNum = extractWarningLine(warning);
                return (
                  <div
                    key={`${idx}-${warning.slice(0, 24)}`}
                    className="flex items-start justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                      <span className="break-words font-mono text-foreground">
                        {warning}
                      </span>
                    </div>
                    {lineNum != null && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-xs"
                        onClick={() => {
                          onJumpToLine(lineNum);
                          onOpenChange(false);
                        }}
                      >
                        Ir a línea {lineNum}
                      </Button>
                    )}
                  </div>
                );
              })
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
              <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] text-muted-foreground leading-relaxed">
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
      </DialogContent>
    </Dialog>
  );
}
