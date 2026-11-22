"use client";

import { FileTextIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LatexCompiler } from "@/lib/latex-compiler";
import { useDocumentStore } from "@/stores/document-store";
import { CompileRecordsPanel } from "./compile-records-panel";

interface CompileLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJumpToLocation: (fileName: string | undefined, lineNumber: number) => void;
  onFixWithAI: (prompt: string) => void;
  onSwitchCompilerAndCompile: (compiler: LatexCompiler) => void;
}

export function CompileLogDialog({
  open,
  onOpenChange,
  onJumpToLocation,
  onFixWithAI,
  onSwitchCompilerAndCompile,
}: CompileLogDialogProps) {
  const compiler = useDocumentStore((s) => s.compiler);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[84vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileTextIcon className="size-4 text-primary" />
            Registros de compilación ({compiler})
          </DialogTitle>
          <DialogDescription>
            Revisa errores, advertencias y la salida completa del compilador o
            pide a la IA que los corrija.
          </DialogDescription>
        </DialogHeader>

        <CompileRecordsPanel
          mode="dialog"
          onJumpToLocation={onJumpToLocation}
          onFixWithAI={onFixWithAI}
          onSwitchCompilerAndCompile={onSwitchCompilerAndCompile}
          onAfterNavigate={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
