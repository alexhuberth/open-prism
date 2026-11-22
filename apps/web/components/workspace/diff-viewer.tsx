"use client";

import { useMemo } from "react";
import { CheckIcon, PlayIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildDiffHunks,
  computeDiffSummary,
  computeLineDiff,
} from "@/lib/text-diff";
import { cn } from "@/lib/utils";

interface DiffHunkViewProps {
  before: string;
  after: string;
  contextRadius?: number;
  maxHeightClass?: string;
}

export function DiffHunkView({
  before,
  after,
  contextRadius = 2,
  maxHeightClass = "max-h-60",
}: DiffHunkViewProps) {
  const { hunks, summary } = useMemo(() => {
    const lines = computeLineDiff(before, after);
    return {
      hunks: buildDiffHunks(lines, contextRadius),
      summary: computeDiffSummary(lines),
    };
  }, [before, after, contextRadius]);

  if (hunks.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
        Sin diferencias de texto detectadas.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-border border-b bg-muted/40 px-2.5 py-1 text-xs">
        <span className="font-medium text-muted-foreground">
          Vista previa de cambios
        </span>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-emerald-600 dark:text-emerald-400">
            +{summary.added}
          </span>
          <span className="text-red-600 dark:text-red-400">
            -{summary.removed}
          </span>
        </div>
      </div>
      <div className={cn("overflow-auto font-mono text-xs", maxHeightClass)}>
        {hunks.map((hunk, hunkIdx) => (
          <div key={hunk.id}>
            {hunkIdx > 0 && (
              <div className="border-border border-y bg-muted/30 px-2 py-0.5 text-center text-[11px] text-muted-foreground">
                ···
              </div>
            )}
            {hunk.lines.map((line, lineIdx) => (
              <div
                key={`${hunk.id}-${lineIdx}`}
                className={cn(
                  "flex items-stretch whitespace-pre-wrap break-all leading-5",
                  line.type === "added" &&
                    "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
                  line.type === "removed" &&
                    "bg-red-500/15 text-red-800 dark:text-red-200",
                  line.type === "context" && "text-muted-foreground",
                )}
              >
                <span className="w-8 shrink-0 select-none border-border/50 border-r px-1 text-right text-[10px] opacity-60">
                  {line.oldLine ?? ""}
                </span>
                <span className="w-8 shrink-0 select-none border-border/50 border-r px-1 text-right text-[10px] opacity-60">
                  {line.newLine ?? ""}
                </span>
                <span className="w-5 shrink-0 select-none text-center font-semibold">
                  {line.type === "added"
                    ? "+"
                    : line.type === "removed"
                      ? "-"
                      : " "}
                </span>
                <span className="min-w-0 flex-1 pr-2">{line.text || " "}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface DiffReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  before: string;
  after: string;
  onApprove: (andCompile?: boolean) => void;
  onReject: () => void;
}

export function DiffReviewDialog({
  open,
  onOpenChange,
  fileName,
  before,
  after,
  onApprove,
  onReject,
}: DiffReviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Revisar cambios propuestos — {fileName}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <DiffHunkView
            before={before}
            after={after}
            contextRadius={5}
            maxHeightClass="max-h-[58vh]"
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onReject();
              onOpenChange(false);
            }}
          >
            <XIcon className="mr-1.5 size-4 text-destructive" />
            Rechazar
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onApprove(false);
                onOpenChange(false);
              }}
            >
              <CheckIcon className="mr-1.5 size-4" />
              Aceptar cambio
            </Button>
            <Button
              type="button"
              onClick={() => {
                onApprove(true);
                onOpenChange(false);
              }}
            >
              <PlayIcon className="mr-1.5 size-4" />
              Aceptar y compilar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
