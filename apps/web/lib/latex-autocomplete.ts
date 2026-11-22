import type {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { isImageFile, isTexFile, type ProjectFile } from "@/lib/project-files";
import { useDocumentStore } from "@/stores/document-store";

interface BibEntry {
  key: string;
  title?: string;
  fileName: string;
}

interface LabelEntry {
  label: string;
  fileName: string;
}

function extractBibEntries(files: ProjectFile[]): BibEntry[] {
  const entries: BibEntry[] = [];
  const entryRegex = /@\w+\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n@|\s*$)/g;
  const titleRegex = /title\s*=\s*[{"]([^}"]+)[}"]/i;

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".bib") || !file.content) continue;
    let match: RegExpExecArray | null = entryRegex.exec(file.content);
    while (match) {
      const key = match[1].trim();
      const body = match[2] ?? "";
      const titleMatch = body.match(titleRegex);
      entries.push({
        key,
        title: titleMatch?.[1]?.trim(),
        fileName: file.name,
      });
      match = entryRegex.exec(file.content);
    }
    entryRegex.lastIndex = 0;
  }

  return entries;
}

function extractLabels(files: ProjectFile[]): LabelEntry[] {
  const labels: LabelEntry[] = [];
  const labelRegex = /\\label\{([^}]+)\}/g;

  for (const file of files) {
    if (!isTexFile(file) || !file.content) continue;
    let match: RegExpExecArray | null = labelRegex.exec(file.content);
    while (match) {
      labels.push({
        label: match[1].trim(),
        fileName: file.name,
      });
      match = labelRegex.exec(file.content);
    }
    labelRegex.lastIndex = 0;
  }

  return labels;
}

export function latexCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const files = useDocumentStore.getState().files;
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // 1. \cite{...}
  const citeMatch = textBefore.match(
    /\\(?:cite|citep|citet|parencite|textcite|autocite)\*?(?:\[[^\]]*\])*\{([^},]*,\s*)*([^},]*)$/,
  );
  if (citeMatch) {
    const partial = citeMatch[2] ?? "";
    const bibEntries = extractBibEntries(files);
    if (bibEntries.length === 0) return null;

    return {
      from: context.pos - partial.length,
      options: bibEntries.map((entry) => ({
        label: entry.key,
        type: "variable",
        detail: entry.fileName,
        info: entry.title,
      })),
    };
  }

  // 2. \ref{...} / \eqref{...} / \pageref{...}
  const refMatch = textBefore.match(
    /\\(?:ref|eqref|pageref|autoref|cref)\{([^}]*)$/,
  );
  if (refMatch) {
    const partial = refMatch[1] ?? "";
    const labels = extractLabels(files);
    if (labels.length === 0) return null;

    return {
      from: context.pos - partial.length,
      options: labels.map((item) => ({
        label: item.label,
        type: "constant",
        detail: item.fileName,
      })),
    };
  }

  // 3. \includegraphics[...]{...}
  const graphicsMatch = textBefore.match(
    /\\includegraphics(?:\[[^\]]*\])*\{([^}]*)$/,
  );
  if (graphicsMatch) {
    const partial = graphicsMatch[1] ?? "";
    const assets = files.filter(
      (f) => isImageFile(f) || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (assets.length === 0) return null;

    return {
      from: context.pos - partial.length,
      options: assets.map((f) => ({
        label: f.name,
        type: "text",
        detail: "Imagen/Figura",
      })),
    };
  }

  // 4. \input{...} / \include{...}
  const inputMatch = textBefore.match(/\\(?:input|include)\{([^}]*)$/);
  if (inputMatch) {
    const partial = inputMatch[1] ?? "";
    const texFiles = files.filter((f) => isTexFile(f));
    if (texFiles.length === 0) return null;

    return {
      from: context.pos - partial.length,
      options: texFiles.map((f) => ({
        label: f.name,
        type: "text",
        detail: "Archivo .tex",
      })),
    };
  }

  return null;
}
