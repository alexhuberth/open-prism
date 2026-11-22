"use client";

import { useState } from "react";
import { BookMarkedIcon, LoaderIcon, PlusIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDocumentStore } from "@/stores/document-store";

interface CitationImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function extractBibKey(bibtex: string): string | null {
  const match = bibtex.match(/^@\w+\s*\{\s*([^,\s]+)\s*,/);
  return match ? match[1] : null;
}

export function CitationImportDialog({
  open,
  onOpenChange,
}: CitationImportDialogProps) {
  const files = useDocumentStore((s) => s.files);
  const addFile = useDocumentStore((s) => s.addFile);
  const updateFileContent = useDocumentStore((s) => s.updateFileContent);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bibtexPreview, setBibtexPreview] = useState("");

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setBibtexPreview("");

    try {
      const res = await fetch("/api/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = (await res.json()) as { bibtex?: string; error?: string };
      if (!res.ok || !data.bibtex) {
        throw new Error(data.error || "No se encontró la cita.");
      }
      setBibtexPreview(data.bibtex);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al buscar la cita.");
    } finally {
      setLoading(false);
    }
  };

  const handleInsertIntoBib = () => {
    const trimmed = bibtexPreview.trim();
    if (!trimmed) return;

    const existingBib = files.find((f) =>
      f.name.toLowerCase().endsWith(".bib"),
    );
    const key = extractBibKey(trimmed);

    if (existingBib) {
      const current = existingBib.content ?? "";
      if (key && current.includes(`{${key},`)) {
        toast.info(`La clave "${key}" ya existe en ${existingBib.name}`);
        setActiveFile(existingBib.id);
        onOpenChange(false);
        return;
      }
      const nextContent = current.trim()
        ? `${current.trimEnd()}\n\n${trimmed}\n`
        : `${trimmed}\n`;
      updateFileContent(existingBib.id, nextContent);
      setActiveFile(existingBib.id);
      toast.success(
        `Cita ${key ? `(${key}) ` : ""}agregada a ${existingBib.name}`,
      );
    } else {
      addFile({
        name: "referencias.bib",
        type: "text",
        content: `${trimmed}\n`,
      });
      toast.success("Archivo referencias.bib creado con la cita");
    }

    setQuery("");
    setBibtexPreview("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookMarkedIcon className="size-4 text-primary" />
            Importar cita bibliográfica (DOI / arXiv)
          </DialogTitle>
          <DialogDescription>
            Pega un DOI o un identificador/enlace de arXiv para generar la
            entrada BibTeX automáticamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleLookup} className="flex gap-2">
          <Input
            placeholder="Ej. 10.1038/nature14539 o 1706.03762"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <>
                <SearchIcon className="mr-1.5 size-4" />
                Buscar
              </>
            )}
          </Button>
        </form>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
            {error}
          </div>
        )}

        {bibtexPreview && (
          <div className="space-y-2">
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
              {bibtexPreview}
            </pre>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={handleInsertIntoBib}>
                <PlusIcon className="mr-1.5 size-4" />
                Agregar al .bib
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
