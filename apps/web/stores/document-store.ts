import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { indexedDBStorage } from "@/lib/storage/indexeddb-storage";

const DEFAULT_TEX_CONTENT = `\\documentclass[11pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{tikz-cd}
\\usepackage{multicol}

\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{1\\baselineskip}

\\begin{document}

\\section*{¿Qué es Open-Prism?}

\\textbf{Open-Prism} es un editor de \\LaTeX{} impulsado por IA para redactar documentos científicos. Incluye un asistente integrado para ayudarte a escribir y editar texto, desarrollar ideas y dar formato a tus proyectos.

\\section*{Funcionalidades}

\\begin{multicols}{2}
Open-Prism integra la IA directamente en el editor con acceso a tu proyecto, así que puedes pedirle cosas como:

\`\`Agrega la transformada de Laplace de $t\\cos(at)$ en la introducción.''
\\[
  \\mathcal{L}\\left\\{ t \\cos(a t) \\right\\} = \\frac{ s^2 - a^2 }{ (s^2 + a^2)^2 }
\\]

\`\`Agrega una tabla de 4\\,$\\times$\\,4 en la sección de resultados.''
\\begin{center}
\\resizebox{0.5\\linewidth}{!}{%
\\begin{tabular}{|c|c|c|c|}
  \\hline
  1 & 2 & 3 & 4 \\\\
  \\hline
  5 & 6 & 7 & 8 \\\\
  \\hline
  9 & 10 & 11 & 12 \\\\
  \\hline
  13 & 14 & 15 & 16 \\\\
  \\hline
\\end{tabular}%
}
\\end{center}

\`\`Por favor revisa esta sección, señala errores o vacíos lógicos y sugiere mejoras de claridad.''

\`\`¿Me falta algún corolario o implicación del Teorema 3.1? ¿Todas las cotas son ajustadas o alguna se puede relajar?''

\\columnbreak

\`\`Redacta un resumen ejecutivo basado en el resto del artículo.''

\`\`Agrega referencias a mi artículo y sugiere trabajos relacionados que pueda haber pasado por alto.''

\`\`Convierte este diagrama dibujado a mano en código \\LaTeX{}.''
\\par\\noindent
\\begin{minipage}[t]{0.49\\linewidth}
  \\vspace{0pt}
  \\centering
  \\includegraphics[width=\\linewidth]{hand-write.jpg}
\\end{minipage}\\hfill
\\begin{minipage}[t]{0.49\\linewidth}
  \\vspace{0pt}
  \\centering
  \\resizebox{\\linewidth}{!}{$
    \\begin{tikzcd}[row sep=2em, column sep=1.5em, ampersand replacement=\\&]
      E
        \\arrow[dr, "e"']
        \\arrow[drr, "p_2"]
        \\arrow[ddr, "p_1"']
      \\& \\& \\\\
      \\& A \\times B \\arrow[r, "\\pi_2"'] \\arrow[d, "\\pi_1"] \\& B \\arrow[d, "g"] \\\\
      \\& A \\arrow[r, "f"'] \\& C
    \\end{tikzcd}
  $}
\\end{minipage}
\\par

\`\`Completa todas las dependencias faltantes en mi proyecto.''

\`\`Genera un resumen de 200 palabras para público general.''

\`\`Crea una presentación en Beamer con cada diapositiva en un archivo separado.''
\\end{multicols}

\\section*{Primeros pasos}

Presiona \\textbf{Enter} para compilar tu documento. Usa \\textbf{Shift+Enter} para insertar un salto de línea. El panel del asistente de IA en la parte inferior del editor está listo para ayudarte con cualquier duda o tarea en \\LaTeX{}.

\\end{document}
`;

export interface ProjectFile {
  id: string;
  name: string;
  type: "tex" | "image";
  content?: string;
  dataUrl?: string;
}

interface DocumentState {
  files: ProjectFile[];
  activeFileId: string;
  cursorPosition: number;
  selectionRange: { start: number; end: number } | null;
  jumpToPosition: number | null;
  isThreadOpen: boolean;
  pdfData: Uint8Array | null;
  compileError: string | null;
  isCompiling: boolean;
  isSaving: boolean;
  initialized: boolean;

  setActiveFile: (id: string) => void;
  addFile: (file: Omit<ProjectFile, "id">) => string;
  deleteFile: (id: string) => void;
  renameFile: (id: string, name: string) => void;
  updateFileContent: (id: string, content: string) => void;
  setCursorPosition: (position: number) => void;
  setSelectionRange: (range: { start: number; end: number } | null) => void;
  requestJumpToPosition: (position: number) => void;
  clearJumpRequest: () => void;
  setThreadOpen: (open: boolean) => void;
  setPdfData: (data: Uint8Array | null) => void;
  setCompileError: (error: string | null) => void;
  setIsCompiling: (isCompiling: boolean) => void;
  setIsSaving: (isSaving: boolean) => void;
  insertAtCursor: (text: string) => void;
  replaceSelection: (start: number, end: number, text: string) => void;
  findAndReplace: (find: string, replace: string) => boolean;
  setInitialized: () => void;

  get fileName(): string;
  get content(): string;
  setFileName: (name: string) => void;
  setContent: (content: string) => void;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function getActiveFile(state: { files: ProjectFile[]; activeFileId: string }) {
  return state.files.find((f) => f.id === state.activeFileId);
}

export const useDocumentStore = create<DocumentState>()(
  persist(
    (set, get) => ({
      files: [
        {
          id: "default-tex",
          name: "document.tex",
          type: "tex",
          content: DEFAULT_TEX_CONTENT,
        },
      ],
      activeFileId: "default-tex",
      cursorPosition: 0,
      selectionRange: null,
      jumpToPosition: null,
      isThreadOpen: false,
      pdfData: null,
      compileError: null,
      isCompiling: false,
      isSaving: false,
      initialized: false,

      setActiveFile: (id) =>
        set({ activeFileId: id, cursorPosition: 0, selectionRange: null }),

      setSelectionRange: (range) => set({ selectionRange: range }),

      requestJumpToPosition: (position) => set({ jumpToPosition: position }),

      clearJumpRequest: () => set({ jumpToPosition: null }),

      addFile: (file) => {
        const id = generateId();
        set((state) => ({
          files: [...state.files, { ...file, id }],
          activeFileId: id,
        }));
        return id;
      },

      deleteFile: (id) => {
        const state = get();
        if (state.files.length <= 1) return;
        const newFiles = state.files.filter((f) => f.id !== id);
        const newActiveId =
          state.activeFileId === id ? newFiles[0].id : state.activeFileId;
        set({ files: newFiles, activeFileId: newActiveId });
      },

      renameFile: (id, name) => {
        set((state) => ({
          files: state.files.map((f) => (f.id === id ? { ...f, name } : f)),
        }));
      },

      updateFileContent: (id, content) => {
        set((state) => ({
          files: state.files.map((f) => (f.id === id ? { ...f, content } : f)),
        }));
      },

      setThreadOpen: (open) => set({ isThreadOpen: open }),

      setPdfData: (data) => set({ pdfData: data, compileError: null }),

      setCompileError: (error) => set({ compileError: error, pdfData: null }),

      setIsCompiling: (isCompiling) => set({ isCompiling }),

      setIsSaving: (isSaving) => set({ isSaving }),

      setCursorPosition: (position) => set({ cursorPosition: position }),

      insertAtCursor: (text) => {
        const state = get();
        const activeFile = getActiveFile(state);
        if (!activeFile || activeFile.type !== "tex") return;

        const content = activeFile.content ?? "";
        const { cursorPosition } = state;
        const newContent =
          content.slice(0, cursorPosition) +
          text +
          content.slice(cursorPosition);

        set({
          files: state.files.map((f) =>
            f.id === activeFile.id ? { ...f, content: newContent } : f,
          ),
          cursorPosition: cursorPosition + text.length,
        });
      },

      replaceSelection: (start, end, text) => {
        const state = get();
        const activeFile = getActiveFile(state);
        if (!activeFile || activeFile.type !== "tex") return;

        const content = activeFile.content ?? "";
        const newContent = content.slice(0, start) + text + content.slice(end);

        set({
          files: state.files.map((f) =>
            f.id === activeFile.id ? { ...f, content: newContent } : f,
          ),
          cursorPosition: start + text.length,
        });
      },

      findAndReplace: (find, replace) => {
        const state = get();
        const activeFile = getActiveFile(state);
        if (!activeFile || activeFile.type !== "tex") return false;

        const content = activeFile.content ?? "";
        if (!content.includes(find)) return false;

        const newContent = content.replace(find, replace);
        set({
          files: state.files.map((f) =>
            f.id === activeFile.id ? { ...f, content: newContent } : f,
          ),
        });
        return true;
      },

      setInitialized: () => set({ initialized: true }),

      get fileName() {
        const activeFile = getActiveFile(get());
        return activeFile?.name ?? "document.tex";
      },

      get content() {
        const activeFile = getActiveFile(get());
        return activeFile?.content ?? "";
      },

      setFileName: (name) => {
        const state = get();
        set({
          files: state.files.map((f) =>
            f.id === state.activeFileId ? { ...f, name } : f,
          ),
        });
      },

      setContent: (content) => {
        const state = get();
        set({
          files: state.files.map((f) =>
            f.id === state.activeFileId ? { ...f, content } : f,
          ),
        });
      },
    }),
    {
      name: "open-prism-document",
      storage: createJSONStorage(() => indexedDBStorage),
      partialize: (state) => ({
        files: state.files,
        activeFileId: state.activeFileId,
        pdfData: state.pdfData,
      }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as object) };
        const files = merged.files as ProjectFile[];
        const docTex = files.find((f) => f.name === "document.tex");
        if (docTex) {
          merged.activeFileId = docTex.id;
        } else if (files.length > 0) {
          merged.activeFileId = files[0].id;
        }
        return merged;
      },
    },
  ),
);
