import type { UIMessage } from "ai";

const CHAT_STORAGE_PREFIX = "open-prism-chat:";
const MAX_PERSISTED_MESSAGES = 40;
const MAX_STORAGE_BYTES = 180_000;

function getChatKey(projectId: string): string {
  return `${CHAT_STORAGE_PREFIX}${projectId}`;
}

function sanitizeMessagesForStorage(messages: UIMessage[]): UIMessage[] {
  const trimmed = messages.slice(-MAX_PERSISTED_MESSAGES);
  return trimmed.map((msg) => ({
    ...msg,
    parts: (msg.parts ?? [])
      .map((part) => {
        if (
          part.type === "file" &&
          "url" in part &&
          typeof part.url === "string" &&
          part.url.startsWith("data:") &&
          part.url.length > 24_000
        ) {
          return {
            type: "text" as const,
            text: "[Imagen adjunta omitida del historial guardado]",
          };
        }
        // Only persist finalized tool calls or clear pending state so restored threads never hang
        if (
          typeof part.type === "string" &&
          part.type.startsWith("tool-") &&
          "state" in part &&
          (part.state === "input-streaming" || part.state === "input-available")
        ) {
          return {
            ...part,
            state: "output-error" as const,
            errorText: "Sesión anterior interrumpida antes de responder.",
          };
        }
        return part;
      })
      .filter(Boolean),
  })) as UIMessage[];
}

export function loadProjectChatMessages(projectId: string): UIMessage[] {
  if (typeof window === "undefined" || !projectId) return [];
  try {
    const raw = window.localStorage.getItem(getChatKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveProjectChatMessages(
  projectId: string,
  messages: UIMessage[],
): void {
  if (typeof window === "undefined" || !projectId) return;
  try {
    if (messages.length === 0) {
      window.localStorage.removeItem(getChatKey(projectId));
      return;
    }

    let sanitized = sanitizeMessagesForStorage(messages);
    let serialized = JSON.stringify(sanitized);

    while (serialized.length > MAX_STORAGE_BYTES && sanitized.length > 2) {
      sanitized = sanitized.slice(2);
      serialized = JSON.stringify(sanitized);
    }

    window.localStorage.setItem(getChatKey(projectId), serialized);
  } catch {
    // Ignore localStorage quota failures cleanly
  }
}

export function deleteProjectChatMessages(projectId: string): void {
  if (typeof window === "undefined" || !projectId) return;
  try {
    window.localStorage.removeItem(getChatKey(projectId));
  } catch {
    // Ignore cleanup errors
  }
}
