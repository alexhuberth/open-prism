import {
  extractBase64FromDataUrl,
  isTextFile,
  isTexFile,
  type ProjectFile,
} from "@/lib/project-files";

export type LatexCompiler = "pdflatex" | "lualatex";

export interface CompileResource {
  path: string;
  content?: string;
  file?: string;
  main?: boolean;
}

export function gatherCompileResources(
  files: ProjectFile[],
  mainFileId: string | null,
): CompileResource[] {
  const mainFile =
    files.find((f) => f.id === mainFileId) ??
    files.find((f) => isTexFile(f) && f.name === "document.tex") ??
    files.find((f) => isTexFile(f) && f.name === "main.tex") ??
    files.find((f) => isTexFile(f));

  return files.map((f) => {
    if (isTextFile(f)) {
      return {
        path: f.name,
        content: f.content ?? "",
        main: mainFile ? f.id === mainFile.id : false,
      };
    }

    const base64 = f.dataUrl ? extractBase64FromDataUrl(f.dataUrl) : "";
    return {
      path: f.name,
      file: base64,
    };
  });
}

export async function compileLatex(
  resources: CompileResource[],
  compiler: LatexCompiler = "pdflatex",
): Promise<Uint8Array> {
  const payload = JSON.stringify({ compiler, resources });
  const response = await fetch("/api/compile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: payload,
  });

  if (!response.ok) {
    const rawText = await response.text();
    let parsed: { error?: string; details?: string } | null = null;
    try {
      parsed = JSON.parse(rawText) as { error?: string; details?: string };
    } catch {
      parsed = null;
    }

    if (
      response.status === 413 ||
      /payload too large|entity too large|request entity/i.test(rawText)
    ) {
      const payloadMb = (payload.length / (1024 * 1024)).toFixed(1);
      const serverMsg =
        parsed?.error ||
        `El proyecto enviado (${payloadMb} MB) supera el límite máximo permitido por el servidor.`;
      throw new Error(serverMsg);
    }

    if (parsed) {
      const message = parsed.details
        ? `${parsed.error}\n\n${parsed.details}`
        : parsed.error || "Error de compilación";
      throw new Error(message);
    }

    throw new Error(
      rawText.trim() || `Error de compilación (HTTP ${response.status})`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
