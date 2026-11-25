"use client";

import type { FC } from "react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import {
  AlertCircleIcon,
  ImageIcon,
  ImagePlusIcon,
  ShieldCheckIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type GeminiModelId, useDocumentStore } from "@/stores/document-store";

export const ComposerAttachmentPill: FC = () => {
  return (
    <AttachmentPrimitive.Root className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-2 py-1 text-xs">
      <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="max-w-36 truncate">
        <AttachmentPrimitive.Name />
      </span>
      <AttachmentPrimitive.Remove asChild>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Quitar imagen"
        >
          <XIcon className="size-3" />
        </button>
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
};

export const MessageAttachmentPill: FC = () => {
  return (
    <AttachmentPrimitive.Root className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/70 px-2 py-1 text-xs">
      <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="max-w-44 truncate">
        <AttachmentPrimitive.Name />
      </span>
    </AttachmentPrimitive.Root>
  );
};

export const AttachImageButton: FC<{ side?: "top" | "bottom" }> = ({
  side = "top",
}) => {
  return (
    <ComposerPrimitive.AddAttachment asChild>
      <TooltipIconButton
        tooltip="Adjuntar imagen (ecuación o diagrama)"
        side={side}
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-full text-muted-foreground"
        aria-label="Adjuntar imagen"
      >
        <ImagePlusIcon className="size-4" />
      </TooltipIconButton>
    </ComposerPrimitive.AddAttachment>
  );
};

export const GeminiModelSelector: FC = () => {
  const aiModel = useDocumentStore((s) => s.aiModel);
  const setAiModel = useDocumentStore((s) => s.setAiModel);

  return (
    <Select
      value={aiModel}
      onValueChange={(v) => setAiModel(v as GeminiModelId)}
    >
      <SelectTrigger size="sm" className="h-7! w-auto text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="gemini-3.5-flash-lite">
          Gemini 3.5 Flash-Lite (Económico)
        </SelectItem>
        <SelectItem value="gemini-3.1-flash-lite">
          Gemini 3.1 Flash-Lite (Económico)
        </SelectItem>
        <SelectItem value="gemini-3.8-flash">
          Gemini 3.8 Flash (Estándar)
        </SelectItem>
        <SelectItem value="gemini-4-hydrogen">
          Gemini 4 Hydrogen (Potente)
        </SelectItem>
        <SelectItem value="gemini-4-argon">Gemini 4 Argon (Potente)</SelectItem>
        <SelectItem value="gemini-4-carbon">
          Gemini 4 Carbon (Potente)
        </SelectItem>
      </SelectContent>
    </Select>
  );
};

export const AiAutonomousToggle: FC = () => {
  const aiAutonomousMode = useDocumentStore((s) => s.aiAutonomousMode);
  const setAiAutonomousMode = useDocumentStore((s) => s.setAiAutonomousMode);

  return (
    <button
      type="button"
      onClick={() => setAiAutonomousMode(!aiAutonomousMode)}
      title={
        aiAutonomousMode
          ? "Modo autónomo activo: la IA crea, edita, renombra, elimina archivos y compila automáticamente"
          : "Modo con confirmación: la IA espera tu aprobación en cada cambio"
      }
      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 font-medium text-xs transition-colors ${
        aiAutonomousMode
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {aiAutonomousMode ? (
        <>
          <ZapIcon className="size-3.5" />
          <span>Autónomo</span>
        </>
      ) : (
        <>
          <ShieldCheckIcon className="size-3.5" />
          <span>Confirmar</span>
        </>
      )}
    </button>
  );
};

export const AssistantErrorNotice: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="my-1.5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
        <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
        <ErrorPrimitive.Message className="leading-relaxed" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

export const ThreadChatErrorBanner: FC = () => {
  const chatError = useDocumentStore((s) => s.chatError);
  const setChatError = useDocumentStore((s) => s.setChatError);

  if (!chatError) return null;

  return (
    <div className="mx-3 mb-2 flex items-start justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
      <div className="flex items-start gap-2">
        <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
        <span className="leading-relaxed">{chatError}</span>
      </div>
      <button
        type="button"
        onClick={() => setChatError(null)}
        className="shrink-0 rounded p-0.5 hover:bg-destructive/15"
        aria-label="Cerrar aviso de error"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
};
