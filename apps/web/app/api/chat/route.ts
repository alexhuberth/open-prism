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

export const maxDuration = 120;

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

Tienes control completo sobre los archivos y configuración de compilación dentro del proyecto actual. Cuando el usuario esté en modo autónomo (por defecto), tus acciones se aplican automáticamente en el proyecto para que puedas resolver todo de principio a fin y verificar que el PDF compile:
- Usa list_project_files para obtener el inventario completo de TODOS los archivos del proyecto (incluyendo imágenes, PDFs, fuentes, .sty, .cls, .bib y .tex)
- Usa get_compile_diagnostics para obtener todos los errores y advertencias parseados, fragmentos numerados del código fuente alrededor de cada error (sourceSnippet), alertas estructurales (integrity: archivo principal incorrecto, rutas con mayúsculas/minúsculas distintas o archivos faltantes), motor sugerido y cola del .log completo
- Usa search_project_files para buscar comandos, paquetes, etiquetas o rutas de imágenes/archivos en TODOS los archivos de texto del proyecto (.tex, .bib, .sty, .cls)
- Usa read_project_file para leer cualquier archivo del proyecto (con soporte opcional de startLine y endLine y salida numerada)
- Usa rename_project_file para renombrar o mover CUALQUIER archivo del proyecto (imágenes, PDFs, .sty, .cls, .bib, .tex), ideal para corregir mayúsculas/minúsculas, espacios o subcarpetas
- Usa delete_project_file para eliminar un archivo innecesario, duplicado o conflictivo del proyecto
- Usa move_project_folder para mover o renombrar una carpeta completa (pasa "" en newFolder si un .zip quedó dentro de una carpeta envolvente y quieres mover sus archivos a la raíz)
- Usa delete_project_folder para eliminar una carpeta completa del proyecto
- Usa set_latex_compiler para cambiar el motor de compilación (pdflatex, lualatex o xelatex) y recompilar, por ejemplo cuando fontspec, unicode-math o \\babelfont requieran xelatex o lualatex
- Usa set_main_file para cambiar el archivo principal (.tex que contiene \\documentclass) cuando un proyecto importado en .zip apuntó a un capítulo o archivo equivocado
- Usa find_and_replace para buscar y reemplazar un fragmento exacto en el archivo activo o en otro archivo indicando filePath
- Usa rewrite_project_file cuando necesites corregir múltiples líneas dispersas o reestructurar un archivo completo indicando filePath
- Usa insert_latex para insertar código en la posición del cursor del archivo activo
- Usa replace_selection para reemplazar el texto seleccionado (solo cuando el usuario haya seleccionado texto)
- Usa create_project_file para crear un archivo nuevo en el proyecto (por ejemplo referencias.bib, archivos de estilo o secciones)
- Usa compile_project para recompilar el proyecto después de tus cambios y verificar si ya genera PDF o identificar errores restantes

Flujo recomendado para hacer compilar cualquier proyecto (especialmente proyectos importados en .zip):
1. Nunca respondas que "no puedes" renombrar, mover ni eliminar archivos: sí tienes rename_project_file, delete_project_file, move_project_folder y delete_project_folder.
2. Llama primero a get_compile_diagnostics (y a list_project_files si hay activos o subcarpetas involucrados).
3. Revisa integrity.wrongMainFileCandidate (usa set_main_file), motor incompatible (usa set_latex_compiler), e integrity.caseMismatchedPaths o rutas con espacios (usa rename_project_file o find_and_replace).
4. Si un archivo .tex, .sty, .bib o recurso causa conflicto o falta, edítalo, renómbralo, créalo o elimínalo según convenga y ejecuta compile_project para confirmar que la compilación termine en éxito.
5. Nunca afirmes que un cambio quedó aplicado ni que el PDF compiló salvo que la herramienta correspondiente devuelva éxito en el resultado.

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
    stopWhen: stepCountIs(30),
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
