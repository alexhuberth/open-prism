"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  type AssistantRuntime,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { ThemeProvider } from "next-themes";
import { toast } from "sonner";
import z from "zod";
import { Toaster } from "@/components/ui/sonner";
import { AppearanceController } from "@/components/workspace/appearance-controller";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  loadProjectChatMessages,
  saveProjectChatMessages,
} from "@/lib/project-chat-storage";
import { initCloudSync } from "@/lib/supabase/cloud-sync";
import { useDocumentStore } from "@/stores/document-store";

function buildFrontendToolSchemas(
  tools: Record<
    string,
    {
      description?: string;
      parameters?: unknown;
      disabled?: boolean;
      type?: string;
    }
  >,
) {
  return Object.fromEntries(
    Object.entries(tools)
      .filter(([, tool]) => !tool.disabled && tool.type !== "backend")
      .map(([name, tool]) => [
        name,
        {
          ...(tool.description ? { description: tool.description } : undefined),
          parameters:
            tool.parameters instanceof z.ZodType
              ? z.toJSONSchema(tool.parameters)
              : tool.parameters,
        },
      ]),
  );
}

export function RootProvider({ children }: { children: ReactNode }) {
  useEffect(() => initCloudSync(), []);
  useKeyboardShortcuts();

  const hydrated = useDocumentStore((s) => s.hydrated);
  const activeProjectId = useDocumentStore((s) => s.activeProjectId);
  const chatSessionVersion = useDocumentStore((s) => s.chatSessionVersion);

  const attachmentsAdapter = useMemo(
    () => new SimpleImageAttachmentAdapter(),
    [],
  );

  const runtimeRef = useRef<AssistantRuntime | null>(null);
  const loadedProjectIdRef = useRef<string | null>(null);
  const lastSessionVersionRef = useRef(chatSessionVersion);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        prepareSendMessagesRequest: async (options) => {
          const context = runtimeRef.current?.thread.getModelContext();
          const tools = buildFrontendToolSchemas(
            (context?.tools ?? {}) as Record<
              string,
              {
                description?: string;
                parameters?: unknown;
                disabled?: boolean;
                type?: string;
              }
            >,
          );
          return {
            body: {
              callSettings: context?.callSettings,
              system: context?.system,
              config: context?.config,
              tools,
              id: options.id,
              messages: options.messages,
              trigger: options.trigger,
              messageId: options.messageId,
              metadata: options.requestMetadata,
            },
          };
        },
      }),
    [],
  );

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: (error) => {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "No se pudo obtener respuesta del asistente.";
      useDocumentStore.getState().setChatError(message);
      toast.error(message);
    },
  });

  const runtime = useAISDKRuntime(chat, {
    adapters: {
      attachments: attachmentsAdapter,
    },
  });
  runtimeRef.current = runtime;

  const chatMessagesRef = useRef<UIMessage[]>(chat.messages);
  chatMessagesRef.current = chat.messages;
  const chatSetMessagesRef = useRef(chat.setMessages);
  chatSetMessagesRef.current = chat.setMessages;
  const chatStopRef = useRef(chat.stop);
  chatStopRef.current = chat.stop;

  // Switch threads cleanly in-place when activeProjectId changes
  useEffect(() => {
    if (!hydrated || !activeProjectId) return;

    const prevId = loadedProjectIdRef.current;
    if (prevId && prevId !== activeProjectId) {
      const stillExists = useDocumentStore
        .getState()
        .projects.some((p) => p.id === prevId);
      if (stillExists) {
        saveProjectChatMessages(prevId, chatMessagesRef.current);
      }
      void chatStopRef.current();
    }

    if (prevId !== activeProjectId) {
      loadedProjectIdRef.current = activeProjectId;
      const saved = loadProjectChatMessages(activeProjectId);
      chatSetMessagesRef.current(saved);
    }
  }, [hydrated, activeProjectId]);

  // Clear messages cleanly in-place when user clicks "Nuevo chat"
  useEffect(() => {
    if (lastSessionVersionRef.current === chatSessionVersion) return;
    lastSessionVersionRef.current = chatSessionVersion;
    void chatStopRef.current();
    chatSetMessagesRef.current([]);
  }, [chatSessionVersion]);

  // Persist settled messages for the active project
  useEffect(() => {
    if (!hydrated || !activeProjectId) return;
    if (loadedProjectIdRef.current !== activeProjectId) return;
    if (chat.status === "submitted" || chat.status === "streaming") return;

    saveProjectChatMessages(activeProjectId, chat.messages);
  }, [hydrated, activeProjectId, chat.messages, chat.status]);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AppearanceController />
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
      <Toaster />
    </ThemeProvider>
  );
}
