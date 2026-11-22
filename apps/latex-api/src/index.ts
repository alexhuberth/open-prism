import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { mkdir, rm, writeFile, readFile, access } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const app = new Hono();

const MAX_CONCURRENT = 3;
const COMPILE_TIMEOUT_MS = 55000;
const MAX_BODY_SIZE =
  Number(process.env.MAX_BODY_SIZE_BYTES) || 100 * 1024 * 1024;

let activeCompilations = 0;

function sanitizePath(workDir: string, filePath: string): string | null {
  if (filePath.includes("..")) return null;
  const normalized = resolve(workDir, filePath);
  if (!normalized.startsWith(`${workDir}/`) && normalized !== workDir) {
    return null;
  }
  return normalized;
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
  main?: boolean;
}

interface CompileRequest {
  compiler?: string;
  resources: Resource[];
}

interface CompileError {
  error: string;
  log_files?: Record<string, string>;
}

app.get("/", (c) => {
  return c.json({ status: "ok", service: "latex-api" });
});

app.post("/builds/sync", async (c) => {
  if (activeCompilations >= MAX_CONCURRENT) {
    return c.json(
      { error: "Server busy, try again later" } satisfies CompileError,
      503,
    );
  }

  const body = await c.req.json<CompileRequest>();
  const { compiler = "pdflatex", resources } = body;

  if (!resources || resources.length === 0) {
    return c.json(
      { error: "No resources provided" } satisfies CompileError,
      400,
    );
  }

  const mainResource = resources.find((r) => r.main) || resources[0];
  const mainPath = mainResource.path || "main.tex";
  const mainDirRel = dirname(mainPath);
  const mainBaseName = basename(mainPath).replace(/\.tex$/, "");

  const workDir = join(tmpdir(), `latex-${randomUUID()}`);
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

      if (resource.file) {
        const buffer = Buffer.from(resource.file, "base64");
        await writeFile(fullPath, buffer);
      } else if (resource.content) {
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

    if (hasBib) {
      let result = await runWithTimeout(latexCmd);
      if (result.timedOut) {
        return c.json(
          { error: "Compilation timed out" } satisfies CompileError,
          500,
        );
      }

      const auxPath = join(outDir, `${mainBaseName}.aux`);
      const auxExists = await access(auxPath)
        .then(() => true)
        .catch(() => false);
      if (auxExists) {
        result = await runWithTimeout(["bibtex", mainBaseName], outDir, {
          BIBINPUTS: `${workDir}:${outDir}:`,
        });
        if (result.timedOut) {
          return c.json(
            { error: "BibTeX timed out" } satisfies CompileError,
            500,
          );
        }
      }

      for (let i = 0; i < 2; i++) {
        result = await runWithTimeout(latexCmd);
        if (result.timedOut) {
          return c.json(
            { error: "Compilation timed out" } satisfies CompileError,
            500,
          );
        }
      }
    } else {
      for (let i = 0; i < 2; i++) {
        const result = await runWithTimeout(latexCmd);
        if (result.timedOut) {
          return c.json(
            { error: "Compilation timed out" } satisfies CompileError,
            500,
          );
        }
      }
    }

    const pdfPath = join(outDir, `${mainBaseName}.pdf`);
    const logPath = join(outDir, `${mainBaseName}.log`);

    let logContent = "";
    try {
      logContent = await readFile(logPath, "utf-8");
    } catch {}

    try {
      const pdfBuffer = await readFile(pdfPath);
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=${mainBaseName}.pdf`,
        },
      });
    } catch {
      return c.json(
        {
          error: "Compilation failed",
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
