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

export const maxDuration = 90;

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

Tienes herramientas disponibles para inspeccionar el proyecto completo, diagnosticar compilaciones y proponer cambios (el usuario revisará el diff o confirmación antes de aplicar):
- Usa get_compile_diagnostics para obtener todos los errores y advertencias parseados, fragmentos numerados del código fuente alrededor de cada error (sourceSnippet), alertas estructurales (integrity: archivo principal incorrecto, rutas con mayúsculas/minúsculas distintas o archivos faltantes), motor sugerido y cola del .log completo
- Usa search_project_files para buscar comandos, paquetes, etiquetas o rutas de imágenes/archivos en TODOS los archivos de texto del proyecto (.tex, .bib, .sty, .cls)
- Usa read_project_file para leer cualquier archivo del proyecto (con soporte opcional de startLine y endLine y salida numerada)
- Usa set_latex_compiler para proponer cambiar el motor de compilación (pdflatex, lualatex o xelatex) y recompilar, por ejemplo cuando fontspec, unicode-math o \\babelfont requieran xelatex o lualatex
- Usa set_main_file para proponer cambiar el archivo principal (.tex que contiene \\documentclass) cuando un proyecto importado en .zip apuntó a un capítulo o archivo equivocado
- Usa find_and_replace para proponer buscar y reemplazar un fragmento exacto en el archivo activo o en otro archivo indicando filePath
- Usa rewrite_project_file cuando necesites corregir múltiples líneas dispersas o reestructurar un archivo completo indicando filePath
- Usa insert_latex para proponer insertar código en la posición del cursor del archivo activo
- Usa replace_selection para proponer reemplazar el texto seleccionado (solo cuando el usuario haya seleccionado texto)
- Usa create_project_file para proponer crear un archivo nuevo en el proyecto (por ejemplo referencias.bib o secciones/capitulo1.tex)
- Usa compile_project cuando necesites recompilar el proyecto para verificar si ya genera PDF o identificar errores restantes

Flujo recomendado para corregir errores de compilación (especialmente en proyectos importados en .zip):
1. Llama primero a get_compile_diagnostics si necesitas el panorama completo (errores, fragmentos fuente, integrity y log).
2. Revisa integrity.wrongMainFileCandidate: si el archivo principal no tiene \\documentclass, propón set_main_file.
3. Revisa si el error indica motor incompatible (ej. fontspec con pdflatex): propón set_latex_compiler antes de reescribir el preámbulo.
4. Revisa integrity.caseMismatchedPaths: como el compilador corre en Linux (sensible a mayúsculas/minúsculas), corrige con find_and_replace las rutas para que coincidan exactamente con los archivos del proyecto.
5. Si falta un archivo o comando en varios archivos, usa search_project_files y read_project_file con líneas antes de editar. Si find_and_replace falla o hay varios cambios en un archivo, usa rewrite_project_file.
6. Nunca afirmes que un cambio ya quedó aplicado hasta que la herramienta devuelva el resultado de aprobación del usuario.

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
    stopWhen: stepCountIs(20),
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
