"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { ThemeProvider } from "next-themes";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AppearanceController } from "@/components/workspace/appearance-controller";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { initCloudSync } from "@/lib/supabase/cloud-sync";
import { useDocumentStore } from "@/stores/document-store";

export function RootProvider({ children }: { children: ReactNode }) {
  useEffect(() => initCloudSync(), []);
  const attachmentsAdapter = useMemo(
    () => new SimpleImageAttachmentAdapter(),
    [],
  );

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    adapters: {
      attachments: attachmentsAdapter,
    },
    onError: (error) => {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "No se pudo obtener respuesta del asistente.";
      useDocumentStore.getState().setChatError(message);
      toast.error(message);
    },
  });

  useKeyboardShortcuts();

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AppearanceController />
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
        <Toaster />
      </AssistantRuntimeProvider>
    </ThemeProvider>
  );
}
