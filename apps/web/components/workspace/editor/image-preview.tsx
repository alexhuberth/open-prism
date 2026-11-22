"use client";

import { useAui } from "@assistant-ui/react";
import { ImageIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectFile } from "@/stores/document-store";

interface ImagePreviewProps {
  file: ProjectFile;
  scale: number;
}

export function ImagePreview({ file, scale }: ImagePreviewProps) {
  const aui = useAui();

  if (!file.dataUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-muted/30 p-8">
        <ImageIcon className="mb-4 size-16 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">
          No hay datos de imagen disponibles
        </p>
      </div>
    );
  }

  const handleTranscribeToLatex = () => {
    if (!file.dataUrl) return;
    aui.thread().append({
      role: "user",
      content: [
        {
          type: "image",
          image: file.dataUrl,
          filename: file.name,
        },
        {
          type: "text",
          text: `Analiza esta imagen (${file.name}) y genera el código LaTeX o TikZ equivalente listo para compilar.`,
        },
      ],
    });
  };

  return (
    <div className="relative h-full overflow-auto bg-muted/50 p-4">
      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleTranscribeToLatex}
        >
          <SparklesIcon className="mr-1.5 size-4" />
          Convertir a LaTeX con IA
        </Button>
      </div>
      <div className="flex justify-center">
        <img
          src={file.dataUrl}
          alt={file.name}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top center",
          }}
          className="max-w-none transition-transform"
        />
      </div>
    </div>
  );
}
