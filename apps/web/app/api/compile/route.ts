import { NextResponse } from "next/server";
import { compileRatelimit, getIP } from "@/lib/ratelimit";

export const maxDuration = 60;

interface CompileResource {
  path: string;
  content?: string;
  file?: string;
  main?: boolean;
}

const ALLOWED_COMPILERS = new Set(["pdflatex", "lualatex", "xelatex"]);

export async function POST(req: Request) {
  if (compileRatelimit) {
    const ip = getIP(req);
    const { success, limit, remaining, reset } =
      await compileRatelimit.limit(ip);

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

  try {
    let payload: { resources: CompileResource[]; compiler?: string };
    try {
      const rawBody = await req.text();
      payload = JSON.parse(rawBody) as {
        resources: CompileResource[];
        compiler?: string;
      };
    } catch {
      return NextResponse.json(
        {
          error:
            "No se pudo leer la solicitud de compilación (formato inválido o demasiado grande).",
        },
        { status: 400 },
      );
    }

    const { resources, compiler } = payload;

    const resolvedCompiler =
      compiler && ALLOWED_COMPILERS.has(compiler) ? compiler : "pdflatex";

    if (!resources || resources.length === 0) {
      return NextResponse.json(
        { error: "No se proporcionaron recursos" },
        { status: 400 },
      );
    }

    const apiResources = resources.map((r) => {
      const resource: Record<string, unknown> = {
        path: r.path,
      };

      const isBase64Image =
        r.content &&
        !r.file &&
        (r.content.startsWith("/9j/") || r.content.startsWith("iVBOR"));

      if (isBase64Image) {
        const cleanBase64 = r.content?.replace(/\s/g, "");
        resource.file = cleanBase64;
      } else if (r.content) {
        resource.content = r.content;
      }

      if (r.file) {
        const cleanBase64 = r.file.replace(/\s/g, "");
        resource.file = cleanBase64;
      }
      if (r.main) resource.main = r.main;
      return resource;
    });

    const latexApiUrl = process.env.LATEX_API_URL || "http://localhost:3001";
    const response = await fetch(`${latexApiUrl}/builds/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        compiler: resolvedCompiler,
        resources: apiResources,
      }),
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || contentType.includes("application/json")) {
      const rawText = await response.text();
      let errorData: {
        error?: string;
        log_files?: Record<string, string>;
      } = {};
      try {
        errorData = JSON.parse(rawText) as {
          error?: string;
          log_files?: Record<string, string>;
        };
      } catch {
        errorData = { error: rawText.trim() || `HTTP ${response.status}` };
      }

      if (response.status === 413) {
        return NextResponse.json(
          {
            error:
              errorData.error ||
              "El proyecto completo (código e imágenes) supera el límite máximo permitido por el servidor de compilación.",
          },
          { status: 413 },
        );
      }

      const logContent = errorData.log_files?.["__main_document__.log"] ?? "";
      const errorLines = logContent
        .split("\n")
        .filter(
          (line: string) =>
            line.includes("Error") ||
            line.includes("!") ||
            line.includes("Missing") ||
            /^l\.\d+\b/.test(line.trim()),
        )
        .slice(0, 16)
        .join("\n");
      return NextResponse.json(
        {
          error: `Error de compilación: ${errorData.error || "Error desconocido"}`,
          details: errorLines || logContent.slice(-1000),
        },
        { status: response.status >= 400 ? response.status : 500 },
      );
    }

    const pdfBuffer = await response.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=document.pdf",
      },
    });
  } catch (error) {
    console.error("Compilation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error de compilación desconocido",
      },
      { status: 500 },
    );
  }
}
