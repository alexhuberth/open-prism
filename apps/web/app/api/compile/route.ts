import { NextResponse } from "next/server";
import { compileRatelimit, getIP } from "@/lib/ratelimit";

export const maxDuration = 180;

interface CompileResource {
  path: string;
  content?: string;
  file?: string;
  binaryHash?: string;
  fileField?: string;
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
    const reqContentType = req.headers.get("content-type") ?? "";
    const latexApiUrl = process.env.LATEX_API_URL || "http://localhost:3001";
    let upstreamResponse: Response;

    if (reqContentType.includes("multipart/form-data")) {
      let incomingForm: FormData;
      try {
        incomingForm = await req.formData();
      } catch {
        return NextResponse.json(
          {
            error:
              "No se pudieron leer los archivos enviados para compilación.",
          },
          { status: 400 },
        );
      }

      const manifestRaw = incomingForm.get("manifest");
      if (typeof manifestRaw !== "string") {
        return NextResponse.json(
          { error: "Falta el manifiesto de compilación." },
          { status: 400 },
        );
      }

      let parsedManifest: {
        resources?: CompileResource[];
        compiler?: string;
      };
      try {
        parsedManifest = JSON.parse(manifestRaw) as {
          resources?: CompileResource[];
          compiler?: string;
        };
      } catch {
        return NextResponse.json(
          { error: "Manifiesto de compilación inválido." },
          { status: 400 },
        );
      }

      if (!parsedManifest.resources || parsedManifest.resources.length === 0) {
        return NextResponse.json(
          { error: "No se proporcionaron recursos" },
          { status: 400 },
        );
      }

      const resolvedCompiler =
        parsedManifest.compiler &&
        ALLOWED_COMPILERS.has(parsedManifest.compiler)
          ? parsedManifest.compiler
          : "pdflatex";

      const forwardForm = new FormData();
      forwardForm.set(
        "manifest",
        JSON.stringify({
          compiler: resolvedCompiler,
          resources: parsedManifest.resources,
        }),
      );

      for (const [key, value] of incomingForm.entries()) {
        if (key !== "manifest" && typeof value !== "string") {
          forwardForm.append(key, value);
        }
      }

      upstreamResponse = await fetch(`${latexApiUrl}/builds/sync`, {
        method: "POST",
        body: forwardForm,
      });
    } else {
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
        } else if (r.content !== undefined) {
          resource.content = r.content;
        }

        if (r.file) {
          const cleanBase64 = r.file.replace(/\s/g, "");
          resource.file = cleanBase64;
        }
        if (r.binaryHash) resource.binaryHash = r.binaryHash;
        if (r.main) resource.main = r.main;
        return resource;
      });

      upstreamResponse = await fetch(`${latexApiUrl}/builds/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          compiler: resolvedCompiler,
          resources: apiResources,
        }),
      });
    }

    const contentType = upstreamResponse.headers.get("content-type") ?? "";

    if (!upstreamResponse.ok || contentType.includes("application/json")) {
      const rawText = await upstreamResponse.text();
      let errorData: {
        error?: string;
        log_files?: Record<string, string>;
        missingHashes?: string[];
        buildId?: string;
      } = {};
      try {
        errorData = JSON.parse(rawText) as {
          error?: string;
          log_files?: Record<string, string>;
          missingHashes?: string[];
          buildId?: string;
        };
      } catch {
        errorData = {
          error: rawText.trim() || `HTTP ${upstreamResponse.status}`,
        };
      }

      if (upstreamResponse.status === 409 && errorData.missingHashes) {
        return NextResponse.json(
          {
            error: errorData.error || "Faltan archivos en caché",
            missingHashes: errorData.missingHashes,
          },
          { status: 409 },
        );
      }

      if (upstreamResponse.status === 413) {
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
          details: errorLines || logContent.slice(-1500),
          buildId: errorData.buildId,
          fullLog: logContent.slice(-60000),
        },
        {
          status:
            upstreamResponse.status >= 400 ? upstreamResponse.status : 500,
        },
      );
    }

    const pdfBuffer = await upstreamResponse.arrayBuffer();
    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=document.pdf",
    };

    const buildId = upstreamResponse.headers.get("x-latex-build-id");
    const warningsCount = upstreamResponse.headers.get(
      "x-latex-warnings-count",
    );
    const warnings = upstreamResponse.headers.get("x-latex-warnings");

    if (buildId) headers["X-Latex-Build-Id"] = buildId;
    if (warningsCount) headers["X-Latex-Warnings-Count"] = warningsCount;
    if (warnings) headers["X-Latex-Warnings"] = warnings;

    return new NextResponse(pdfBuffer, { headers });
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
