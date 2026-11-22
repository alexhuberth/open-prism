import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import {
  mkdir,
  rm,
  writeFile,
  readFile,
  access,
  copyFile,
  readdir,
  stat,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const app = new Hono();

const MAX_CONCURRENT = 3;
const COMPILE_TIMEOUT_MS = 180000;
const MAX_BODY_SIZE =
  Number(process.env.MAX_BODY_SIZE_BYTES) || 100 * 1024 * 1024;

const ASSET_CACHE_DIR = join(tmpdir(), "open-prism-asset-cache");
const MAX_CACHE_BYTES = 512 * 1024 * 1024;
const MAX_LOG_HISTORY = 30;

let activeCompilations = 0;
const recentBuildLogs = new Map<string, string>();

function storeBuildLog(buildId: string, logContent: string) {
  if (!logContent) return;
  recentBuildLogs.set(buildId, logContent);
  if (recentBuildLogs.size > MAX_LOG_HISTORY) {
    const oldestKey = recentBuildLogs.keys().next().value;
    if (oldestKey) recentBuildLogs.delete(oldestKey);
  }
}

function isValidSha256(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}

async function cacheAssetBuffer(hash: string, buffer: Buffer): Promise<void> {
  if (!isValidSha256(hash)) return;
  await mkdir(ASSET_CACHE_DIR, { recursive: true });
  const target = join(ASSET_CACHE_DIR, hash.toLowerCase());
  const exists = await access(target)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    await writeFile(target, buffer);
    void trimAssetCacheIfNeeded();
  }
}

async function trimAssetCacheIfNeeded(): Promise<void> {
  try {
    const entries = await readdir(ASSET_CACHE_DIR);
    const stats = await Promise.all(
      entries.map(async (name) => {
        const full = join(ASSET_CACHE_DIR, name);
        const s = await stat(full);
        return { full, size: s.size, mtimeMs: s.mtimeMs };
      }),
    );
    let total = stats.reduce((acc, item) => acc + item.size, 0);
    if (total <= MAX_CACHE_BYTES) return;

    stats.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const item of stats) {
      if (total <= MAX_CACHE_BYTES * 0.8) break;
      await rm(item.full, { force: true }).catch(() => {});
      total -= item.size;
    }
  } catch {
    // Cache cleanup is best-effort
  }
}

function sanitizePath(workDir: string, filePath: string): string | null {
  if (filePath.includes("..")) return null;
  const normalized = resolve(workDir, filePath);
  if (!normalized.startsWith(`${workDir}/`) && normalized !== workDir) {
    return null;
  }
  return normalized;
}

function extractLatexWarnings(logContent: string): string[] {
  if (!logContent) return [];
  const warnings: string[] = [];
  const lines = logContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    if (
      /^LaTeX(?:\s+Font)?\s+Warning:/i.test(trimmed) ||
      /^Package\s+\S+\s+Warning:/i.test(trimmed) ||
      /^Class\s+\S+\s+Warning:/i.test(trimmed) ||
      /^Overfull\s+\\hbox/i.test(trimmed) ||
      /^Underfull\s+\\hbox/i.test(trimmed) ||
      /^Missing character:/i.test(trimmed)
    ) {
      // Include one continuation line if LaTeX wrapped the message
      const next = lines[i + 1]?.trim();
      const combined =
        next &&
        (next.startsWith("(") || next.startsWith("on input line")) &&
        !trimmed.includes("on input line")
          ? `${trimmed} ${next}`
          : trimmed;
      warnings.push(combined);
      if (warnings.length >= 40) break;
    }
  }

  return warnings;
}

app.use("/*", cors());
app.use(
  "/*",
  bodyLimit({
    maxSize: MAX_BODY_SIZE,
    onError: (c) =>
      c.json(
        {
          error: `El proyecto supera el tamaño máximo permitido (${Math.round(MAX_BODY_SIZE / (1024 * 1024))} MB).`,
        } satisfies CompileError,
        413,
      ),
  }),
);

interface Resource {
  path?: string;
  content?: string;
  file?: string;
  binaryHash?: string;
  fileField?: string;
  main?: boolean;
}

interface CompileRequest {
  compiler?: string;
  resources: Resource[];
}

interface CompileError {
  error: string;
  log_files?: Record<string, string>;
  missingHashes?: string[];
  buildId?: string;
}

app.get("/", (c) => {
  return c.json({ status: "ok", service: "latex-api" });
});

app.get("/builds/:id/log", (c) => {
  const id = c.req.param("id");
  const log = recentBuildLogs.get(id);
  if (log === undefined) {
    return c.json(
      { error: "Log de compilación no encontrado o expirado" },
      404,
    );
  }
  return c.json({ buildId: id, log });
});

app.post("/builds/sync", async (c) => {
  if (activeCompilations >= MAX_CONCURRENT) {
    return c.json(
      { error: "Server busy, try again later" } satisfies CompileError,
      503,
    );
  }

  const contentType = c.req.header("content-type") ?? "";
  let compiler = "pdflatex";
  let resources: Resource[] = [];
  const uploadedFilesByField = new Map<string, Buffer>();

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const manifestRaw = formData.get("manifest");
    if (typeof manifestRaw !== "string") {
      return c.json(
        {
          error: "Falta el campo manifest en multipart/form-data",
        } satisfies CompileError,
        400,
      );
    }

    const manifest = JSON.parse(manifestRaw) as CompileRequest;
    compiler = manifest.compiler || "pdflatex";
    resources = manifest.resources ?? [];

    for (const [key, value] of formData.entries()) {
      if (key !== "manifest" && typeof value !== "string") {
        const ab = await value.arrayBuffer();
        uploadedFilesByField.set(key, Buffer.from(ab));
      }
    }
  } else {
    const body = await c.req.json<CompileRequest>();
    compiler = body.compiler || "pdflatex";
    resources = body.resources ?? [];
  }

  if (!resources || resources.length === 0) {
    return c.json(
      { error: "No resources provided" } satisfies CompileError,
      400,
    );
  }

  // Verify any omitted cached binary hashes exist on disk before spawning TeX
  const missingHashes: string[] = [];
  for (const resource of resources) {
    if (
      resource.binaryHash &&
      !resource.file &&
      !(resource.fileField && uploadedFilesByField.has(resource.fileField))
    ) {
      if (!isValidSha256(resource.binaryHash)) {
        return c.json(
          { error: "Invalid asset hash" } satisfies CompileError,
          400,
        );
      }
      const cachedPath = join(
        ASSET_CACHE_DIR,
        resource.binaryHash.toLowerCase(),
      );
      const exists = await access(cachedPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        missingHashes.push(resource.binaryHash);
      }
    }
  }

  if (missingHashes.length > 0) {
    return c.json(
      {
        error:
          "Algunos archivos en caché ya no están en el servidor y deben reenviarse.",
        missingHashes,
      } satisfies CompileError,
      409,
    );
  }

  const mainResource = resources.find((r) => r.main) || resources[0];
  const mainPath = mainResource.path || "main.tex";
  const mainDirRel = dirname(mainPath);
  const mainBaseName = basename(mainPath).replace(/\.tex$/, "");
  const buildId = randomUUID();

  const workDir = join(tmpdir(), `latex-${buildId}`);
  await mkdir(workDir, { recursive: true });
  const outDir = mainDirRel === "." ? workDir : join(workDir, mainDirRel);
  await mkdir(outDir, { recursive: true });

  activeCompilations++;
  try {
    const hasBib = resources.some((r) => r.path?.endsWith(".bib"));

    for (const resource of resources) {
      const filePath =
        resource.path || (resource.main ? "main.tex" : `file-${randomUUID()}`);
      const fullPath = sanitizePath(workDir, filePath);

      if (!fullPath) {
        return c.json({ error: "Invalid path" } satisfies CompileError, 400);
      }

      const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      if (parentDir && parentDir !== workDir) {
        await mkdir(parentDir, { recursive: true });
      }

      const multipartBuffer = resource.fileField
        ? uploadedFilesByField.get(resource.fileField)
        : undefined;

      if (multipartBuffer) {
        await writeFile(fullPath, multipartBuffer);
        const hash =
          resource.binaryHash && isValidSha256(resource.binaryHash)
            ? resource.binaryHash
            : createHash("sha256").update(multipartBuffer).digest("hex");
        await cacheAssetBuffer(hash, multipartBuffer);
      } else if (resource.file) {
        const buffer = Buffer.from(resource.file, "base64");
        await writeFile(fullPath, buffer);
        const hash =
          resource.binaryHash && isValidSha256(resource.binaryHash)
            ? resource.binaryHash
            : createHash("sha256").update(buffer).digest("hex");
        await cacheAssetBuffer(hash, buffer);
      } else if (resource.binaryHash) {
        const cachedPath = join(
          ASSET_CACHE_DIR,
          resource.binaryHash.toLowerCase(),
        );
        await copyFile(cachedPath, fullPath);
      } else if (resource.content !== undefined) {
        await writeFile(fullPath, resource.content, "utf-8");
      }
    }

    const compilerCmd =
      compiler === "xelatex"
        ? "xelatex"
        : compiler === "lualatex"
          ? "lualatex"
          : "pdflatex";

    const runWithTimeout = (
      cmd: string[],
      cwd = workDir,
      extraEnv?: Record<string, string>,
    ): Promise<{ exitCode: number; timedOut: boolean }> => {
      return new Promise((resolve) => {
        const [command, ...args] = cmd;
        const proc = spawn(command, args, {
          cwd,
          env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, COMPILE_TIMEOUT_MS);
        proc.on("close", (code) => {
          clearTimeout(timeout);
          resolve({ exitCode: code ?? 1, timedOut });
        });
        proc.on("error", () => {
          clearTimeout(timeout);
          resolve({ exitCode: 1, timedOut: false });
        });
      });
    };

    const latexCmd =
      mainDirRel === "."
        ? [compilerCmd, "-interaction=nonstopmode", mainPath]
        : [
            compilerCmd,
            "-interaction=nonstopmode",
            "-output-directory",
            outDir,
            mainPath,
          ];

    // Pass 1
    const pass1 = await runWithTimeout(latexCmd);
    if (pass1.timedOut) {
      return c.json(
        { error: "Compilation timed out", buildId } satisfies CompileError,
        500,
      );
    }

    const bcfPath = join(outDir, `${mainBaseName}.bcf`);
    const auxPath = join(outDir, `${mainBaseName}.aux`);
    const idxPath = join(outDir, `${mainBaseName}.idx`);
    const logPath = join(outDir, `${mainBaseName}.log`);

    const [bcfExists, auxExists, idxExists] = await Promise.all([
      access(bcfPath)
        .then(() => true)
        .catch(() => false),
      access(auxPath)
        .then(() => true)
        .catch(() => false),
      access(idxPath)
        .then(() => true)
        .catch(() => false),
    ]);

    let ranAuxTool = false;

    if (bcfExists) {
      const biberRes = await runWithTimeout(["biber", mainBaseName], outDir, {
        BIBINPUTS: `${workDir}:${outDir}:`,
      });
      if (biberRes.timedOut) {
        return c.json(
          { error: "Biber timed out", buildId } satisfies CompileError,
          500,
        );
      }
      ranAuxTool = true;
    } else if (hasBib && auxExists) {
      const bibRes = await runWithTimeout(["bibtex", mainBaseName], outDir, {
        BIBINPUTS: `${workDir}:${outDir}:`,
      });
      if (bibRes.timedOut) {
        return c.json(
          { error: "BibTeX timed out", buildId } satisfies CompileError,
          500,
        );
      }
      ranAuxTool = true;
    }

    if (idxExists) {
      const idxRes = await runWithTimeout(
        ["makeindex", `${mainBaseName}.idx`],
        outDir,
      );
      if (idxRes.timedOut) {
        return c.json(
          { error: "MakeIndex timed out", buildId } satisfies CompileError,
          500,
        );
      }
      ranAuxTool = true;
    }

    // Pass 2 (always resolves TOC, figures/tables lists, cross-references, and bibliography)
    const pass2 = await runWithTimeout(latexCmd);
    if (pass2.timedOut) {
      return c.json(
        { error: "Compilation timed out", buildId } satisfies CompileError,
        500,
      );
    }

    let logContent = "";
    try {
      logContent = await readFile(logPath, "utf-8");
    } catch {}

    // Pass 3 when bibliography/index ran or LaTeX explicitly requests rerun (page numbers / labels)
    if (
      ranAuxTool ||
      /Rerun to get (?:cross-references|outline|citations) right|Please \(re\)run/i.test(
        logContent,
      )
    ) {
      const pass3 = await runWithTimeout(latexCmd);
      if (pass3.timedOut) {
        return c.json(
          { error: "Compilation timed out", buildId } satisfies CompileError,
          500,
        );
      }
      try {
        logContent = await readFile(logPath, "utf-8");
      } catch {}
    }

    const pdfPath = join(outDir, `${mainBaseName}.pdf`);
    if (logContent) {
      storeBuildLog(buildId, logContent);
    }

    const warnings = extractLatexWarnings(logContent);
    const headerWarnings = warnings.slice(0, 20);
    while (
      headerWarnings.length > 0 &&
      Buffer.from(JSON.stringify(headerWarnings), "utf-8").toString("base64")
        .length > 6000
    ) {
      headerWarnings.pop();
    }
    const warningsHeader = Buffer.from(
      JSON.stringify(headerWarnings),
      "utf-8",
    ).toString("base64");

    try {
      const pdfBuffer = await readFile(pdfPath);
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=${mainBaseName}.pdf`,
          "X-Latex-Build-Id": buildId,
          "X-Latex-Warnings-Count": warnings.length.toString(),
          "X-Latex-Warnings": warningsHeader,
          "Access-Control-Expose-Headers":
            "X-Latex-Build-Id, X-Latex-Warnings-Count, X-Latex-Warnings",
        },
      });
    } catch {
      return c.json(
        {
          error: "Compilation failed",
          buildId,
          log_files: {
            "__main_document__.log": logContent,
          },
        } satisfies CompileError,
        500,
      );
    }
  } finally {
    activeCompilations--;
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
});

const port = parseInt(process.env.PORT || "3001", 10);

serve({
  fetch: app.fetch,
  port,
});

console.log(`LaTeX API server running on port ${port}`);
