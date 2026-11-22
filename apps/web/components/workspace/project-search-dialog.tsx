"use client";

import { useMemo, useState } from "react";
import { FileTextIcon, SearchIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  searchAcrossProjectFiles,
  type ProjectSearchMatch,
} from "@/lib/latex-outline";
import { useDocumentStore } from "@/stores/document-store";

interface ProjectSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSearchDialog({
  open,
  onOpenChange,
}: ProjectSearchDialogProps) {
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const requestJumpToPosition = useDocumentStore(
    (s) => s.requestJumpToPosition,
  );

  const [query, setQuery] = useState("");

  const matches = useMemo(
    () => searchAcrossProjectFiles(files, query, 120),
    [files, query],
  );

  const handleSelectMatch = (match: ProjectSearchMatch) => {
    if (match.fileId !== activeFileId) {
      setActiveFile(match.fileId);
    }
    setTimeout(() => {
      requestJumpToPosition(match.offset);
    }, 35);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SearchIcon className="size-4 text-primary" />
            Buscar en todo el proyecto
          </DialogTitle>
          <DialogDescription>
            Encuentra texto, comandos o citas a través de todos los archivos del
            libro o tesis.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Buscar texto, \label{...}, \cite{...}..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto py-1">
          {!query.trim() ? (
            <div className="py-8 text-center text-muted-foreground text-xs">
              Escribe un término para buscar en todos los archivos de texto del
              proyecto.
            </div>
          ) : matches.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-xs">
              No se encontraron coincidencias para "{query.trim()}".
            </div>
          ) : (
            matches.map((match, idx) => (
              <button
                key={`${match.fileId}-${match.line}-${idx}`}
                type="button"
                onClick={() => handleSelectMatch(match)}
                className="flex w-full flex-col gap-0.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 truncate font-medium text-foreground">
                    <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    {match.fileName}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    Línea {match.line}
                  </span>
                </div>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {match.preview}
                </p>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
