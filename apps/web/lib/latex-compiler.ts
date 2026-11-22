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
  const response = await fetch("/api/compile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ compiler, resources }),
  });

  if (!response.ok) {
    const data = await response.json();
    const message = data.details
      ? `${data.error}\n\n${data.details}`
      : data.error || "Error de compilación";
    throw new Error(message);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
