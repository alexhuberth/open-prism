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

const SYSTEM_PROMPT = `Eres un asistente experto en LaTeX. Ayudas a los usuarios a redactar, corregir y editar documentos en LaTeX.
Responde siempre en un perfecto español latinoamericano, de forma natural, clara y precisa (evita expresiones propias de España).

Al proporcionar código LaTeX:
- Usa sintaxis LaTeX correcta
- Explica brevemente qué hace cada parte
- Sugiere buenas prácticas
- Usa bloques de código con \`\`\`latex para el código LaTeX

Tienes acceso al documento actual del usuario, el cual se incluye en el contexto.

Cuando el usuario te pida ayuda con su documento:
- Haz referencia a partes específicas de su documento
- Sugiere mejoras y correcciones
- Proporciona fragmentos de código completos que pueda utilizar

Tienes herramientas disponibles para modificar el documento directamente:
- Usa insert_latex para insertar código en la posición del cursor del usuario
- Usa replace_selection para reemplazar el texto seleccionado (solo cuando el usuario haya seleccionado texto)
- Usa find_and_replace para buscar y reemplazar texto específico en el documento

Cuando el usuario te pida agregar, insertar o escribir código LaTeX en su documento, usa la herramienta insert_latex.
Cuando el usuario te pida reemplazar o modificar el texto seleccionado, usa la herramienta replace_selection.
Cuando el usuario te pida cambiar, modificar o reemplazar un texto específico en el documento, usa la herramienta find_and_replace.

Tareas frecuentes en las que ayudas:
- Redacción de ecuaciones matemáticas
- Estructura de documentos (secciones, capítulos)
- Tablas y figuras
- Bibliografía y citas
- Formato y estilo
- Recomendación de paquetes
- Depuración de errores de LaTeX`;

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

  const { messages, system, tools } = await req.json();

  const fullSystemPrompt = system
    ? `${SYSTEM_PROMPT}\n\n${system}`
    : SYSTEM_PROMPT;

  const result = streamText({
    model: google("gemini-4-hydrogen"),
    system: fullSystemPrompt,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(10),
    tools: frontendTools(tools) as unknown as ToolSet,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: "low",
        },
      } satisfies GoogleLanguageModelOptions,
    },
  });

  return result.toUIMessageStreamResponse();
}
