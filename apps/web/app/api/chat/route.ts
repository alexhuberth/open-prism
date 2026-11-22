import { type GoogleLanguageModelOptions, google } from "@ai-sdk/google";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type ToolSet,
} from "ai";
import { NextResponse } from "next/server";
import { chatRatelimit, getIP } from "@/lib/ratelimit";

export const maxDuration = 30;

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

const SYSTEM_PROMPT = `Eres un asistente experto en LaTeX. Ayudas a los usuarios a redactar, corregir y editar documentos en LaTeX.
Responde siempre en un perfecto español latinoamericano, de forma natural, clara y precisa (evita expresiones propias de España).

Al proporcionar código LaTeX:
- Usa sintaxis LaTeX correcta
- Explica brevemente qué hace cada parte
- Sugiere buenas prácticas
- Usa bloques de código con \`\`\`latex para el código LaTeX

Tienes acceso al archivo activo y a la lista de archivos del proyecto en el contexto. Si el usuario adjunta imágenes (como fotos de ecuaciones escritas a mano, pizarras o diagramas), transcríbelas a código LaTeX o TikZ limpio y listo para compilar.

Tienes herramientas disponibles para inspeccionar el proyecto y proponer cambios (el usuario revisará el diff antes de aceptarlos y compilar):
- Usa read_project_file para leer el contenido de otro archivo del proyecto (.tex, .bib, .sty, .cls, etc.) cuando necesites revisarlo
- Usa insert_latex para proponer insertar código en la posición del cursor del archivo activo
- Usa replace_selection para proponer reemplazar el texto seleccionado (solo cuando el usuario haya seleccionado texto)
- Usa find_and_replace para proponer buscar y reemplazar un fragmento exacto en el archivo activo o en otro archivo indicando filePath
- Usa create_project_file para proponer crear un archivo nuevo en el proyecto (por ejemplo referencias.bib o secciones/capitulo1.tex)

Nunca afirmes que un cambio ya quedó aplicado hasta que la herramienta devuelva el resultado de aprobación del usuario.

Tareas frecuentes en las que ayudas:
- Redacción de ecuaciones matemáticas y transcripción desde imágenes
- Estructura de documentos multiproyecto (secciones, capítulos, archivos .bib)
- Tablas y figuras (TikZ, pgfplots, graphicx)
- Bibliografía y citas
- Formato, estilo y depuración de errores de LaTeX`;

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
      : "gemini-4-hydrogen";

  const fullSystemPrompt = system
    ? `${SYSTEM_PROMPT}\n\n${system}`
    : SYSTEM_PROMPT;

  const result = streamText({
    model: google(modelName),
    system: fullSystemPrompt,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(10),
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
