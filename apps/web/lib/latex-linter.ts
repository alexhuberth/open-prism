import { type Diagnostic, linter } from "@codemirror/lint";
import { extractBibEntries, extractLabels } from "@/lib/latex-autocomplete";
import { isTexFile, type ProjectFile } from "@/lib/project-files";
import { useDocumentStore } from "@/stores/document-store";

/**
 * Replaces LaTeX line comments (`%` not preceded by an odd number of backslashes)
 * with spaces so character indices stay aligned with the CodeMirror document.
 */
function maskLatexComments(source: string): string {
  const chars = source.split("");
  let i = 0;

  while (i < chars.length) {
    if (chars[i] === "%") {
      let backslashes = 0;
      let j = i - 1;
      while (j >= 0 && chars[j] === "\\") {
        backslashes++;
        j--;
      }
      if (backslashes % 2 === 0) {
        while (i < chars.length && chars[i] !== "\n") {
          chars[i] = " ";
          i++;
        }
        continue;
      }
    }
    i++;
  }

  return chars.join("");
}

function collectEnvironmentDiagnostics(masked: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const stack: Array<{ name: string; from: number; to: number }> = [];
  const envRegex = /\\(begin|end)\s*\{([^}\s]+)\}/g;

  let match = envRegex.exec(masked);
  while (match) {
    const kind = match[1];
    const name = match[2];
    const from = match.index;
    const to = from + match[0].length;

    if (kind === "begin") {
      stack.push({ name, from, to });
    } else {
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx === -1) {
        diagnostics.push({
          from,
          to,
          severity: "error",
          message: `Falta \\begin{${name}} correspondiente.`,
          source: "LaTeX",
        });
      } else {
        while (stack.length - 1 > matchIdx) {
          const unclosed = stack.pop();
          if (unclosed) {
            diagnostics.push({
              from: unclosed.from,
              to: unclosed.to,
              severity: "error",
              message: `Falta \\end{${unclosed.name}} correspondiente.`,
              source: "LaTeX",
            });
          }
        }
        stack.pop();
      }
    }

    match = envRegex.exec(masked);
  }

  for (const unclosed of stack) {
    diagnostics.push({
      from: unclosed.from,
      to: unclosed.to,
      severity: "error",
      message: `Falta \\end{${unclosed.name}} correspondiente.`,
      source: "LaTeX",
    });
  }

  return diagnostics;
}

function collectReferenceDiagnostics(
  masked: string,
  projectFiles: ProjectFile[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const definedLabels = new Set(
    extractLabels(projectFiles).map((entry) => entry.label),
  );
  const refRegex = /\\(?:ref|eqref|pageref|autoref|cref)\s*\{([^}]+)\}/g;
  let refMatch = refRegex.exec(masked);
  while (refMatch) {
    const label = refMatch[1].trim();
    if (label && !definedLabels.has(label)) {
      diagnostics.push({
        from: refMatch.index,
        to: refMatch.index + refMatch[0].length,
        severity: "warning",
        message: `Etiqueta no definida en el proyecto: ${label}`,
        source: "LaTeX",
      });
    }
    refMatch = refRegex.exec(masked);
  }

  const bibEntries = extractBibEntries(projectFiles);
  if (bibEntries.length > 0) {
    const definedKeys = new Set(bibEntries.map((entry) => entry.key));
    const citeRegex =
      /\\(?:cite|citep|citet|parencite|textcite|autocite)\*?(?:\[[^\]]*\])*\{([^}]+)\}/g;
    let citeMatch = citeRegex.exec(masked);
    while (citeMatch) {
      const rawKeys = citeMatch[1];
      const keys = rawKeys
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const missingKeys = keys.filter((k) => !definedKeys.has(k));

      if (missingKeys.length > 0) {
        diagnostics.push({
          from: citeMatch.index,
          to: citeMatch.index + citeMatch[0].length,
          severity: "warning",
          message: `Cita no encontrada en los archivos .bib: ${missingKeys.join(", ")}`,
          source: "LaTeX",
        });
      }
      citeMatch = citeRegex.exec(masked);
    }
  }

  return diagnostics;
}

export function createProjectAwareLatexLinter() {
  return linter(
    (view): Diagnostic[] => {
      const state = useDocumentStore.getState();
      const activeFile = state.files.find((f) => f.id === state.activeFileId);
      if (!activeFile || !isTexFile(activeFile)) {
        return [];
      }

      const rawText = view.state.doc.toString();
      const masked = maskLatexComments(rawText);
      const diagnostics: Diagnostic[] = [];

      // Only require \begin{document} in the project's main .tex file when \documentclass is declared
      if (activeFile.id === state.mainFileId) {
        const docClassMatch = masked.match(
          /\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/,
        );
        if (docClassMatch && !/\\begin\s*\{document\}/.test(masked)) {
          const from = docClassMatch.index ?? 0;
          diagnostics.push({
            from,
            to: from + docClassMatch[0].length,
            severity: "warning",
            message:
              "Falta el entorno \\begin{document}...\\end{document} en el archivo principal.",
            source: "LaTeX",
          });
        }
      }

      const projectFiles = state.files.map((file) =>
        file.id === activeFile.id ? { ...file, content: rawText } : file,
      );

      diagnostics.push(...collectEnvironmentDiagnostics(masked));
      diagnostics.push(...collectReferenceDiagnostics(masked, projectFiles));

      return diagnostics;
    },
    { delay: 450 },
  );
}
