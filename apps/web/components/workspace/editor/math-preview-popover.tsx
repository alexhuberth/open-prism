"use client";

import { useEffect, useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { SigmaIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findMathExpressionAtCursor } from "@/lib/latex-math-preview";

interface MathPreviewPopoverProps {
  content: string;
  cursorPosition: number;
  visible: boolean;
}

export function MathPreviewPopover({
  content,
  cursorPosition,
  visible,
}: MathPreviewPopoverProps) {
  const match = useMemo(
    () =>
      visible ? findMathExpressionAtCursor(content, cursorPosition) : null,
    [visible, content, cursorPosition],
  );

  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const blockKey = match ? `${match.from}:${match.to}` : null;

  useEffect(() => {
    if (!match) {
      setDismissedKey(null);
    }
  }, [match]);

  const rendered = useMemo(() => {
    if (!match) return null;
    try {
      const html = katex.renderToString(match.tex, {
        displayMode: match.displayMode,
        throwOnError: true,
        strict: false,
        trust: true,
      });
      return { html, hasError: false };
    } catch {
      const fallbackHtml = katex.renderToString(match.tex, {
        displayMode: match.displayMode,
        throwOnError: false,
        strict: false,
        trust: true,
      });
      return { html: fallbackHtml, hasError: true };
    }
  }, [match]);

  if (!match || !rendered || (blockKey && dismissedKey === blockKey)) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Vista previa de ecuación KaTeX"
      className="pointer-events-auto absolute top-2 right-3 z-20 max-w-md rounded-lg border border-border bg-card/95 px-3 py-2 text-card-foreground shadow-lg backdrop-blur-sm"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <SigmaIcon className="size-3.5 text-primary" />
          <span className="font-medium">
            Vista previa ({match.displayMode ? "Bloque" : "En línea"})
          </span>
          {rendered.hasError && (
            <span className="rounded bg-amber-500/15 px-1 text-[10px] text-amber-600 dark:text-amber-400">
              Sintaxis incompleta
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5"
          title="Ocultar vista previa"
          onClick={() => setDismissedKey(blockKey)}
        >
          <XIcon className="size-3" />
        </Button>
      </div>
      <div
        className="max-h-36 overflow-auto py-1 text-sm"
        // Safe KaTeX-generated HTML from user's own LaTeX source
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    </div>
  );
}
