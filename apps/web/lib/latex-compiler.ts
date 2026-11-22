import {
  extractBase64FromDataUrl,
  isTextFile,
  isTexFile,
  type ProjectFile,
} from "@/lib/project-files";

export type LatexCompiler = "pdflatex" | "lualatex" | "xelatex";

export interface CompileResource {
  path: string;
  content?: string;
  file?: string;
  main?: boolean;
}

export interface CompileSuccessResult {
  pdf: Uint8Array;
  buildId: string | null;
  warnings: string[];
  warningCount: number;
}

export class CompileFailureError extends Error {
  fullLog: string | null;
  buildId: string | null;

  constructor(
    message: string,
    options?: { fullLog?: string | null; buildId?: string | null },
  ) {
    super(message);
    this.name = "CompileFailureError";
    this.fullLog = options?.fullLog ?? null;
    this.buildId = options?.buildId ?? null;
  }
}

interface BinaryCacheEntry {
  hash: string;
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

const dataUrlBinaryCache = new Map<string, BinaryCacheEntry>();
const serverConfirmedHashes = new Set<string>();

function decodeBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const clean = base64.replace(/\s/g, "");
  const binary = atob(clean);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function computeSha256Hex(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return null;
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function resolveBinaryEntry(base64: string): Promise<{
  bytes: Uint8Array<ArrayBuffer>;
  hash: string | null;
  mimeType: string;
}> {
  const cached = dataUrlBinaryCache.get(base64);
  if (cached) return cached;

  const bytes = decodeBase64ToBytes(base64);
  const hash = await computeSha256Hex(bytes);
  const mimeType = "application/octet-stream";

  if (hash) {
    if (dataUrlBinaryCache.size > 100) {
      const oldest = dataUrlBinaryCache.keys().next().value;
      if (oldest) dataUrlBinaryCache.delete(oldest);
    }
    dataUrlBinaryCache.set(base64, { hash, bytes, mimeType });
  }

  return { bytes, hash, mimeType };
}

function decodeWarningsHeader(headerValue: string | null): string[] {
  if (!headerValue) return [];
  try {
    const binary = atob(headerValue);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
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

async function buildMultipartCompileBody(
  resources: CompileResource[],
  compiler: LatexCompiler,
): Promise<{
  formData: FormData;
  sentHashes: string[];
  approximateBytes: number;
}> {
  const formData = new FormData();
  const manifestResources: Array<{
    path: string;
    content?: string;
    binaryHash?: string;
    fileField?: string;
    main?: boolean;
  }> = [];
  const sentHashes: string[] = [];
  let approximateBytes = 0;
  let fieldIndex = 0;

  for (const resource of resources) {
    if (resource.file) {
      const { bytes, hash, mimeType } = await resolveBinaryEntry(resource.file);
      if (hash && serverConfirmedHashes.has(hash)) {
        manifestResources.push({
          path: resource.path,
          binaryHash: hash,
          main: resource.main,
        });
      } else {
        const fieldName = `file_${fieldIndex++}`;
        const blob = new Blob([bytes], { type: mimeType });
        formData.append(
          fieldName,
          blob,
          resource.path.split("/").pop() || "asset.bin",
        );
        approximateBytes += bytes.byteLength;
        if (hash) sentHashes.push(hash);

        manifestResources.push({
          path: resource.path,
          binaryHash: hash ?? undefined,
          fileField: fieldName,
          main: resource.main,
        });
      }
    } else {
      const content = resource.content ?? "";
      approximateBytes += content.length;
      manifestResources.push({
        path: resource.path,
        content,
        main: resource.main,
      });
    }
  }

  const manifestJson = JSON.stringify({
    compiler,
    resources: manifestResources,
  });
  approximateBytes += manifestJson.length;
  formData.set("manifest", manifestJson);

  return { formData, sentHashes, approximateBytes };
}

export async function compileLatex(
  resources: CompileResource[],
  compiler: LatexCompiler = "pdflatex",
): Promise<CompileSuccessResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { formData, sentHashes, approximateBytes } =
      await buildMultipartCompileBody(resources, compiler);

    const response = await fetch("/api/compile", {
      method: "POST",
      body: formData,
    });

    if (response.status === 409 && attempt === 0) {
      const conflictText = await response.text();
      try {
        const parsed = JSON.parse(conflictText) as { missingHashes?: string[] };
        for (const h of parsed.missingHashes ?? []) {
          serverConfirmedHashes.delete(h);
        }
      } catch {
        serverConfirmedHashes.clear();
      }
      continue;
    }

    if (!response.ok) {
      const rawText = await response.text();
      let parsed: {
        error?: string;
        details?: string;
        fullLog?: string;
        buildId?: string;
      } | null = null;
      try {
        parsed = JSON.parse(rawText) as {
          error?: string;
          details?: string;
          fullLog?: string;
          buildId?: string;
        };
      } catch {
        parsed = null;
      }

      if (
        response.status === 413 ||
        /payload too large|entity too large|request entity/i.test(rawText)
      ) {
        const payloadMb = (approximateBytes / (1024 * 1024)).toFixed(1);
        const serverMsg =
          parsed?.error ||
          `El proyecto enviado (${payloadMb} MB) supera el límite máximo permitido por el servidor.`;
        throw new CompileFailureError(serverMsg);
      }

      if (parsed) {
        const message = parsed.details
          ? `${parsed.error}\n\n${parsed.details}`
          : parsed.error || "Error de compilación";
        throw new CompileFailureError(message, {
          fullLog: parsed.fullLog ?? null,
          buildId: parsed.buildId ?? null,
        });
      }

      throw new CompileFailureError(
        rawText.trim() || `Error de compilación (HTTP ${response.status})`,
      );
    }

    for (const h of sentHashes) {
      serverConfirmedHashes.add(h);
    }

    const buildId = response.headers.get("x-latex-build-id");
    const warningCountHeader = Number(
      response.headers.get("x-latex-warnings-count") ?? "0",
    );
    const warnings = decodeWarningsHeader(
      response.headers.get("x-latex-warnings"),
    );

    const arrayBuffer = await response.arrayBuffer();
    return {
      pdf: new Uint8Array(arrayBuffer),
      buildId,
      warnings,
      warningCount: Number.isFinite(warningCountHeader)
        ? Math.max(warningCountHeader, warnings.length)
        : warnings.length,
    };
  }

  throw new CompileFailureError("No se pudo completar la compilación.");
}
