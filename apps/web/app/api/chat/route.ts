import { type GoogleLanguageModelOptions, google } from "@ai-sdk/google";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type ToolSet,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { chatRatelimit, getIP } from "@/lib/ratelimit";

export const maxDuration = 120;

const MAX_HISTORY_MESSAGES = 12;
const MAX_OLD_TOOL_OUTPUT_CHARS = 350;
const MAX_OLD_TEXT_CHARS = 2000;

const ALLOWED_MODELS = new Set([
  "gemini-4-hydrogen",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-4-argon",
  "gemini-4-carbon",
]);

const THINKING_LOW_MODELS = new Set([
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-4-argon",
  "gemini-4-carbon",
]);

const SYSTEM_PROMPT = `Eres un asistente experto en LaTeX. Responde en español latinoamericano claro y conciso. Usa \`\`\`latex para código.

Tienes control total del proyecto en un servidor con \`texlive-full\` + \`biber\` (\`pdflatex\`, \`xelatex\`, \`lualatex\`). En modo autónomo tus cambios se aplican al instante:
- Inspección: \`get_compile_diagnostics\` (errores, fragmentos, integridad), \`list_project_files\`, \`search_project_files\`, \`read_project_file(filePath, startLine, endLine)\`
- Edición: \`find_and_replace\`, \`rewrite_project_file\`, \`insert_latex\`, \`replace_selection\`, \`create_project_file\`
- Archivos/carpetas: \`rename_project_file\`, \`delete_project_file\`, \`move_project_folder\`, \`delete_project_folder\`
- Compilación: \`set_latex_compiler\`, \`set_main_file\`, \`compile_project\`

Reglas clave:
1. Para ahorrar tokens, lee solo las líneas necesarias con \`read_project_file(startLine, endLine)\` y llama \`get_compile_diagnostics\` con \`includeFullLog: false\` salvo que el error no quede claro.
2. Si falta un \`.sty\`/\`.cls\`, busca archivos locales o mayúsculas distintas (Linux es case-sensitive) con \`list_project_files\`/\`search_project_files\`.
3. Ante incompatibilidad de motor (\`fontspec\`, \`unicode-math\`, \`\\babelfont\`), usa \`set_latex_compiler\`; si el archivo principal no tiene \`\\documentclass\`, usa \`set_main_file\`.
4. Verifica tus correcciones con \`compile_project\` y nunca afirmes que algo compiló sin confirmarlo en el resultado.`;

function compactMessagesForModel(rawMessages: unknown): UIMessage[] {
  if (!Array.isArray(rawMessages)) return [];
  const messages = rawMessages as UIMessage[];

  // Keep a sliding window of the most recent messages starting on a user turn
  let startIndex = Math.max(0, messages.length - MAX_HISTORY_MESSAGES);
  while (
    startIndex < messages.length - 1 &&
    messages[startIndex]?.role !== "user"
  ) {
    startIndex++;
  }
  const windowed = messages.slice(startIndex);
  const preserveRecentFrom = Math.max(0, windowed.length - 2);

  return windowed.map((msg, idx) => {
    if (idx >= preserveRecentFrom || !Array.isArray(msg.parts)) {
      return msg;
    }

    const compactedParts = msg.parts.map((part) => {
      if (part.type === "file") {
        return {
          type: "text" as const,
          text: "[Imagen adjunta previa ya procesada]",
        };
      }

      if (
        part.type === "text" &&
        typeof part.text === "string" &&
        part.text.length > MAX_OLD_TEXT_CHARS
      ) {
        return {
          ...part,
          text: `${part.text.slice(0, 1400)}\n... [recortado para ahorrar tokens] ...\n${part.text.slice(-300)}`,
        };
      }

      if (
        typeof part.type === "string" &&
        part.type.startsWith("tool-") &&
        "state" in part &&
        part.state === "output-available" &&
        "output" in part
      ) {
        const serialized = JSON.stringify(part.output ?? "");
        if (serialized.length > MAX_OLD_TOOL_OUTPUT_CHARS) {
          return {
            ...part,
            output: {
              compacted: true,
              note: "Salida anterior resumida para ahorrar tokens; vuelve a invocar la herramienta si la necesitas.",
            },
          };
        }
      }

      return part;
    });

    return {
      ...msg,
      parts: compactedParts,
    } as UIMessage;
  });
}

export async function POST(req: Request) {
  if (chatRatelimit) {
    const ip = getIP(req);
    const { success, limit, remaining, reset } = await chatRatelimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        },
      );
    }
  }

  const { messages, system, tools, config } = await req.json();

  const requestedModel = config?.modelName;
  const modelName =
    typeof requestedModel === "string" && ALLOWED_MODELS.has(requestedModel)
      ? requestedModel
      : "gemini-3.5-flash-lite";

  const fullSystemPrompt = system
    ? `${SYSTEM_PROMPT}\n\n${system}`
    : SYSTEM_PROMPT;

  const compactedMessages = compactMessagesForModel(messages);

  const result = streamText({
    model: google(modelName),
    system: fullSystemPrompt,
    messages: await convertToModelMessages(compactedMessages),
    maxOutputTokens: 4096,
    stopWhen: stepCountIs(15),
    maxRetries: 1,
    tools: frontendTools(tools) as unknown as ToolSet,
    ...(THINKING_LOW_MODELS.has(modelName) && {
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: "low",
          },
        } satisfies GoogleLanguageModelOptions,
      },
    }),
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type === "finish") {
        return {
          usage: {
            inputTokens: part.totalUsage.inputTokens ?? 0,
            outputTokens: part.totalUsage.outputTokens ?? 0,
            totalTokens: part.totalUsage.totalTokens ?? 0,
          },
        };
      }
      return undefined;
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("quota") || msg.includes("429")) {
        return `El modelo ${modelName} alcanzó su límite de cuota en tu API key. Cambia a "Gemini 3.5 Flash-Lite" en el selector de modelo.`;
      }
      if (msg.includes("high demand") || msg.includes("503")) {
        return `El modelo ${modelName} está saturado temporalmente (503). Cambia a "Gemini 3.5 Flash-Lite" en el selector o intenta de nuevo.`;
      }
      return `Error del asistente (${modelName}): ${msg}`;
    },
  });
}
