import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { LatexCompiler } from "@/lib/latex-compiler";
import {
  detectMainTexFileName,
  isTextFile,
  isTexFile,
  normalizeRelativePath,
  type ProjectFile,
} from "@/lib/project-files";
import {
  getProjectTemplate,
  SHOWCASE_TEX_CONTENT,
  type ProjectTemplateId,
} from "@/lib/project-templates";
import { deleteProjectChatMessages } from "@/lib/project-chat-storage";
import {
  indexedDBStorage,
  loadProjectPdf,
  saveProjectPdf,
} from "@/lib/storage/indexeddb-storage";
import type { PersistedProject, ProjectSortOrder } from "@/lib/storage/schema";

export type { ProjectFile } from "@/lib/project-files";
export type Project = PersistedProject;
export type GeminiModelId =
  | "gemini-4-hydrogen"
  | "gemini-3.5-flash-lite"
  | "gemini-3.1-flash-lite"
  | "gemini-3.8-flash"
  | "gemini-4-argon"
  | "gemini-4-carbon";

export interface PendingProposal {
  toolCallId: string;
  toolName:
    | "insert_latex"
    | "replace_selection"
    | "find_and_replace"
    | "create_project_file"
    | "rewrite_project_file";
  fileId: string;
  fileName: string;
  beforeContent: string;
  afterContent: string;
  onApprove: (andCompile?: boolean) => void;
  onReject: () => void;
}

interface CreateProjectOptions {
  name: string;
  templateId?: ProjectTemplateId;
  files?: Omit<ProjectFile, "id">[];
  mainFileName?: string;
  compiler?: LatexCompiler;
}

interface DocumentState {
  projects: Project[];
  activeProjectId: string;
  projectSort: ProjectSortOrder;
  aiModel: GeminiModelId;
  files: ProjectFile[];
  activeFileId: string;
  mainFileId: string;
  compiler: LatexCompiler;
  fileName: string;
  content: string;
  cursorPosition: number;
  selectionRange: { start: number; end: number } | null;
  jumpToPosition: number | null;
  isThreadOpen: boolean;
  pdfData: Uint8Array | null;
  compileError: string | null;
  compileBuildId: string | null;
  compileWarnings: string[];
  compileWarningCount: number;
  compileFullLog: string | null;
  pdfSyncTarget: {
    page: number;
    xPt: number;
    yPt: number;
    widthPt: number;
    heightPt: number;
    nonce: number;
  } | null;
  isCompiling: boolean;
  isSaving: boolean;
  hydrated: boolean;
  initialized: boolean;
  chatError: string | null;
  chatSessionVersion: number;
  pendingProposals: Record<string, PendingProposal>;

  setHydrated: (hydrated: boolean) => void;

  setChatError: (error: string | null) => void;
  resetActiveProjectChat: () => void;
  registerPendingProposal: (proposal: PendingProposal) => void;
  unregisterPendingProposal: (toolCallId: string) => void;
  clearPendingProposals: () => void;

  createProject: (options: CreateProjectOptions) => string;
  selectProject: (projectId: string) => void;
  renameProject: (projectId: string, name: string) => void;
  duplicateProject: (projectId: string) => string | null;
  deleteProject: (projectId: string) => void;
  togglePinProject: (projectId: string) => void;
  setProjectSort: (sort: ProjectSortOrder) => void;
  setAiModel: (model: GeminiModelId) => void;
  setProjectCompiler: (compiler: LatexCompiler) => void;
  setMainFile: (fileId: string) => void;

  setActiveFile: (id: string) => void;
  addFile: (
    file: Omit<ProjectFile, "id">,
    options?: { activate?: boolean },
  ) => string;
  importFiles: (
    files: Omit<ProjectFile, "id">[],
    suggestedMainName?: string,
  ) => void;
  deleteFile: (id: string) => void;
  deleteFolder: (folderPath: string) => void;
  renameFile: (id: string, name: string) => void;
  updateFileContent: (id: string, content: string) => void;
  setCursorPosition: (position: number) => void;
  setSelectionRange: (range: { start: number; end: number } | null) => void;
  requestJumpToPosition: (position: number) => void;
  clearJumpRequest: () => void;
  requestPdfSyncTarget: (target: {
    page: number;
    xPt: number;
    yPt: number;
    widthPt: number;
    heightPt: number;
  }) => void;
  clearPdfSyncTarget: () => void;
  setThreadOpen: (open: boolean) => void;
  setPdfData: (data: Uint8Array | null) => void;
  setCompileError: (error: string | null) => void;
  setCompileDiagnostics: (meta: {
    buildId: string | null;
    warnings: string[];
    warningCount: number;
    fullLog: string | null;
  }) => void;
  setIsCompiling: (isCompiling: boolean) => void;
  setIsSaving: (isSaving: boolean) => void;
  insertAtCursor: (text: string) => void;
  replaceSelection: (start: number, end: number, text: string) => void;
  findAndReplace: (find: string, replace: string) => boolean;
  setInitialized: () => void;

  setFileName: (name: string) => void;
  setContent: (content: string) => void;
  applyCloudSnapshot: (snapshot: {
    projects: Project[];
    activeProjectId?: string;
    projectSort?: ProjectSortOrder;
    aiModel?: GeminiModelId;
  }) => void;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

const RESET_COMPILE_DIAGNOSTICS = {
  compileError: null,
  compileBuildId: null,
  compileWarnings: [] as string[],
  compileWarningCount: 0,
  compileFullLog: null,
};

function createInitialDefaultProject(): Project {
  const now = Date.now();
  const mainId = "default-tex";
  return {
    id: "default-project",
    name: "Proyecto de ejemplo",
    createdAt: now,
    updatedAt: now,
    pinned: false,
    compiler: "pdflatex",
    mainFileId: mainId,
    activeFileId: mainId,
    files: [
      {
        id: mainId,
        name: "document.tex",
        type: "tex",
        content: SHOWCASE_TEX_CONTENT,
      },
    ],
  };
}

function getActiveFile(state: { files: ProjectFile[]; activeFileId: string }) {
  return state.files.find((f) => f.id === state.activeFileId);
}

function updateActiveProject(
  state: DocumentState,
  updater: (project: Project) => Project,
): Partial<DocumentState> {
  let updatedActive: Project | null = null;
  const projects = state.projects.map((p) => {
    if (p.id !== state.activeProjectId) return p;
    updatedActive = updater(p);
    return updatedActive;
  });

  if (!updatedActive) return {};
  const active: Project = updatedActive;
  const activeFile =
    active.files.find((f) => f.id === active.activeFileId) ?? active.files[0];

  return {
    projects,
    files: active.files,
    activeFileId: active.activeFileId,
    mainFileId: active.mainFileId,
    compiler: active.compiler,
    fileName: activeFile?.name ?? "document.tex",
    content: activeFile?.content ?? "",
  };
}

const initialProject = createInitialDefaultProject();
const initialActiveFile =
  initialProject.files.find((f) => f.id === initialProject.activeFileId) ??
  initialProject.files[0];

export const useDocumentStore = create<DocumentState>()(
  persist(
    (set, get) => ({
      projects: [initialProject],
      activeProjectId: initialProject.id,
      projectSort: "updatedAt",
      aiModel: "gemini-4-hydrogen",
      files: initialProject.files,
      activeFileId: initialProject.activeFileId,
      mainFileId: initialProject.mainFileId,
      compiler: initialProject.compiler,
      fileName: initialActiveFile?.name ?? "document.tex",
      content: initialActiveFile?.content ?? "",
      cursorPosition: 0,
      selectionRange: null,
      jumpToPosition: null,
      isThreadOpen: false,
      pdfData: null,
      compileError: null,
      compileBuildId: null,
      compileWarnings: [],
      compileWarningCount: 0,
      compileFullLog: null,
      pdfSyncTarget: null,
      isCompiling: false,
      isSaving: false,
      hydrated: false,
      initialized: false,
      chatError: null,
      chatSessionVersion: 0,
      pendingProposals: {},

      setHydrated: (hydrated) => set({ hydrated }),

      setChatError: (chatError) => {
        if (get().chatError !== chatError) {
          set({ chatError });
        }
      },

      resetActiveProjectChat: () => {
        const activeId = get().activeProjectId;
        if (activeId) {
          deleteProjectChatMessages(activeId);
        }
        set((state) => ({
          chatError: null,
          pendingProposals: {},
          chatSessionVersion: state.chatSessionVersion + 1,
        }));
      },

      registerPendingProposal: (proposal) =>
        set((state) => {
          const existing = state.pendingProposals[proposal.toolCallId];
          if (
            existing &&
            existing.fileId === proposal.fileId &&
            existing.beforeContent === proposal.beforeContent &&
            existing.afterContent === proposal.afterContent
          ) {
            return {};
          }
          return {
            pendingProposals: {
              ...state.pendingProposals,
              [proposal.toolCallId]: proposal,
            },
          };
        }),

      unregisterPendingProposal: (toolCallId) =>
        set((state) => {
          if (!state.pendingProposals[toolCallId]) return {};
          const next = { ...state.pendingProposals };
          delete next[toolCallId];
          return { pendingProposals: next };
        }),

      clearPendingProposals: () => set({ pendingProposals: {} }),

      createProject: ({
        name,
        templateId = "blank",
        files: customFiles,
        mainFileName,
        compiler,
      }) => {
        const template = getProjectTemplate(templateId);
        const sourceFiles = customFiles ?? template.files;
        const resolvedCompiler = compiler ?? template.compiler;
        const projectId = `proj-${generateId()}`;
        const now = Date.now();

        const createdFiles: ProjectFile[] = sourceFiles.map((f) => ({
          ...f,
          id: generateId(),
        }));

        if (createdFiles.length === 0) {
          createdFiles.push({
            id: generateId(),
            name: "main.tex",
            type: "tex",
            content:
              "\\documentclass[11pt]{article}\n\\usepackage[T1]{fontenc}\n\n\\begin{document}\n\n\\end{document}\n",
          });
        }

        const targetMainName =
          mainFileName ??
          (customFiles
            ? detectMainTexFileName(createdFiles)
            : template.mainFileName);

        const mainFile =
          createdFiles.find((f) => f.name === targetMainName) ??
          createdFiles.find((f) => isTexFile(f)) ??
          createdFiles[0];

        const newProject: Project = {
          id: projectId,
          name: name.trim() || "Nuevo proyecto",
          createdAt: now,
          updatedAt: now,
          pinned: false,
          compiler: resolvedCompiler,
          mainFileId: mainFile.id,
          activeFileId: mainFile.id,
          files: createdFiles,
        };

        set((state) => ({
          projects: [newProject, ...state.projects],
          activeProjectId: newProject.id,
          files: newProject.files,
          activeFileId: newProject.activeFileId,
          mainFileId: newProject.mainFileId,
          compiler: newProject.compiler,
          fileName: mainFile.name,
          content: mainFile.content ?? "",
          cursorPosition: 0,
          selectionRange: null,
          pdfData: null,
          ...RESET_COMPILE_DIAGNOSTICS,
          chatError: null,
          pendingProposals: {},
          initialized: templateId === "showcase" ? false : state.initialized,
        }));

        return projectId;
      },

      selectProject: (projectId) => {
        const state = get();
        if (projectId === state.activeProjectId) return;
        const target = state.projects.find((p) => p.id === projectId);
        if (!target) return;

        const targetActiveFile =
          target.files.find((f) => f.id === target.activeFileId) ??
          target.files[0];

        set({
          activeProjectId: target.id,
          files: target.files,
          activeFileId: target.activeFileId,
          mainFileId: target.mainFileId,
          compiler: target.compiler,
          fileName: targetActiveFile?.name ?? "document.tex",
          content: targetActiveFile?.content ?? "",
          cursorPosition: 0,
          selectionRange: null,
          pdfData: null,
          ...RESET_COMPILE_DIAGNOSTICS,
          chatError: null,
          pendingProposals: {},
        });

        loadProjectPdf(target.id)
          .then((cachedPdf) => {
            if (get().activeProjectId === target.id && cachedPdf) {
              set({ pdfData: cachedPdf });
            }
          })
          .catch(() => {});
      },

      renameProject: (projectId, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, name: trimmed, updatedAt: Date.now() }
              : p,
          ),
        }));
      },

      duplicateProject: (projectId) => {
        const state = get();
        const source = state.projects.find((p) => p.id === projectId);
        if (!source) return null;

        const now = Date.now();
        const idMap = new Map<string, string>();
        const clonedFiles: ProjectFile[] = source.files.map((f) => {
          const newId = generateId();
          idMap.set(f.id, newId);
          return { ...f, id: newId };
        });

        const newMainId =
          idMap.get(source.mainFileId) ?? clonedFiles[0]?.id ?? "";
        const newActiveId = idMap.get(source.activeFileId) ?? newMainId;

        const copy: Project = {
          ...source,
          id: `proj-${generateId()}`,
          name: `${source.name} (copia)`,
          createdAt: now,
          updatedAt: now,
          pinned: false,
          mainFileId: newMainId,
          activeFileId: newActiveId,
          files: clonedFiles,
        };

        const copyActiveFile =
          copy.files.find((f) => f.id === copy.activeFileId) ?? copy.files[0];

        set((s) => ({
          projects: [copy, ...s.projects],
          activeProjectId: copy.id,
          files: copy.files,
          activeFileId: copy.activeFileId,
          mainFileId: copy.mainFileId,
          compiler: copy.compiler,
          fileName: copyActiveFile?.name ?? "document.tex",
          content: copyActiveFile?.content ?? "",
          cursorPosition: 0,
          selectionRange: null,
          pdfData: null,
          ...RESET_COMPILE_DIAGNOSTICS,
        }));

        return copy.id;
      },

      deleteProject: (projectId) => {
        const state = get();
        if (state.projects.length <= 1) return;

        const remaining = state.projects.filter((p) => p.id !== projectId);
        const deletingActive = state.activeProjectId === projectId;
        const nextActive = deletingActive
          ? remaining[0]
          : (remaining.find((p) => p.id === state.activeProjectId) ??
            remaining[0]);

        saveProjectPdf(projectId, null).catch(() => {});
        deleteProjectChatMessages(projectId);

        const nextActiveFile =
          nextActive.files.find((f) => f.id === nextActive.activeFileId) ??
          nextActive.files[0];

        set({
          projects: remaining,
          activeProjectId: nextActive.id,
          files: nextActive.files,
          activeFileId: nextActive.activeFileId,
          mainFileId: nextActive.mainFileId,
          compiler: nextActive.compiler,
          fileName: nextActiveFile?.name ?? "document.tex",
          content: nextActiveFile?.content ?? "",
          ...(deletingActive
            ? {
                cursorPosition: 0,
                selectionRange: null,
                pdfData: null,
                ...RESET_COMPILE_DIAGNOSTICS,
                chatError: null,
                pendingProposals: {},
              }
            : {}),
        });

        if (deletingActive) {
          loadProjectPdf(nextActive.id)
            .then((cachedPdf) => {
              if (get().activeProjectId === nextActive.id && cachedPdf) {
                set({ pdfData: cachedPdf });
              }
            })
            .catch(() => {});
        }
      },

      togglePinProject: (projectId) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, pinned: !p.pinned } : p,
          ),
        }));
      },

      setProjectSort: (projectSort) => set({ projectSort }),

      setAiModel: (aiModel) => set({ aiModel }),

      setProjectCompiler: (compiler) => {
        set((state) =>
          updateActiveProject(state, (p) => ({
            ...p,
            compiler,
            updatedAt: Date.now(),
          })),
        );
      },

      setMainFile: (fileId) => {
        set((state) => {
          const target = state.files.find((f) => f.id === fileId);
          if (!target || !isTexFile(target)) return {};
          return updateActiveProject(state, (p) => ({
            ...p,
            mainFileId: fileId,
            updatedAt: Date.now(),
          }));
        });
      },

      setActiveFile: (id) =>
        set((state) => ({
          ...updateActiveProject(state, (p) => ({ ...p, activeFileId: id })),
          cursorPosition: 0,
          selectionRange: null,
        })),

      setSelectionRange: (range) => set({ selectionRange: range }),

      requestJumpToPosition: (position) => set({ jumpToPosition: position }),

      clearJumpRequest: () => set({ jumpToPosition: null }),

      addFile: (file, options) => {
        const normalizedName = normalizeRelativePath(file.name) ?? file.name;
        const id = generateId();
        const activate = options?.activate ?? true;

        set((state) => {
          const existing = state.files.find((f) => f.name === normalizedName);
          if (existing) {
            return updateActiveProject(state, (p) => ({
              ...p,
              updatedAt: Date.now(),
              activeFileId: activate ? existing.id : p.activeFileId,
              files: p.files.map((f) =>
                f.id === existing.id
                  ? { ...file, id: existing.id, name: normalizedName }
                  : f,
              ),
            }));
          }

          const newFile: ProjectFile = {
            ...file,
            id,
            name: normalizedName,
          };
          return updateActiveProject(state, (p) => ({
            ...p,
            updatedAt: Date.now(),
            activeFileId: activate ? id : p.activeFileId,
            files: [...p.files, newFile],
          }));
        });

        return id;
      },

      importFiles: (incoming, suggestedMainName) => {
        if (incoming.length === 0) return;

        set((state) =>
          updateActiveProject(state, (p) => {
            const nextFiles = [...p.files];
            let firstTexId: string | null = null;
            let matchedSuggestedMainId: string | null = null;

            for (const item of incoming) {
              const normalized = normalizeRelativePath(item.name);
              if (!normalized) continue;

              const existingIdx = nextFiles.findIndex(
                (f) => f.name === normalized,
              );
              if (existingIdx !== -1) {
                const updated: ProjectFile = {
                  ...item,
                  id: nextFiles[existingIdx].id,
                  name: normalized,
                };
                nextFiles[existingIdx] = updated;
                if (normalized === suggestedMainName) {
                  matchedSuggestedMainId = updated.id;
                }
                if (!firstTexId && isTexFile(updated)) {
                  firstTexId = updated.id;
                }
              } else {
                const created: ProjectFile = {
                  ...item,
                  id: generateId(),
                  name: normalized,
                };
                nextFiles.push(created);
                if (normalized === suggestedMainName) {
                  matchedSuggestedMainId = created.id;
                }
                if (!firstTexId && isTexFile(created)) {
                  firstTexId = created.id;
                }
              }
            }

            const hasExistingMain = nextFiles.some(
              (f) => f.id === p.mainFileId,
            );
            const nextMainFileId =
              matchedSuggestedMainId ??
              (hasExistingMain ? p.mainFileId : (firstTexId ?? p.mainFileId));

            return {
              ...p,
              updatedAt: Date.now(),
              files: nextFiles,
              mainFileId: nextMainFileId,
              activeFileId:
                matchedSuggestedMainId ?? firstTexId ?? p.activeFileId,
            };
          }),
        );
      },

      deleteFile: (id) => {
        const state = get();
        if (state.files.length <= 1) return;
        set((s) =>
          updateActiveProject(s, (p) => {
            const newFiles = p.files.filter((f) => f.id !== id);
            if (newFiles.length === 0) return p;

            const newActiveId =
              p.activeFileId === id ? newFiles[0].id : p.activeFileId;
            const newMainId =
              p.mainFileId === id
                ? (newFiles.find((f) => isTexFile(f))?.id ?? newFiles[0].id)
                : p.mainFileId;

            return {
              ...p,
              updatedAt: Date.now(),
              files: newFiles,
              activeFileId: newActiveId,
              mainFileId: newMainId,
            };
          }),
        );
      },

      deleteFolder: (folderPath) => {
        const prefix = `${folderPath.replace(/\/+$/, "")}/`;
        set((state) =>
          updateActiveProject(state, (p) => {
            const remaining = p.files.filter((f) => !f.name.startsWith(prefix));
            if (remaining.length === 0) return p;

            const activeExists = remaining.some((f) => f.id === p.activeFileId);
            const mainExists = remaining.some((f) => f.id === p.mainFileId);

            return {
              ...p,
              updatedAt: Date.now(),
              files: remaining,
              activeFileId: activeExists ? p.activeFileId : remaining[0].id,
              mainFileId: mainExists
                ? p.mainFileId
                : (remaining.find((f) => isTexFile(f))?.id ?? remaining[0].id),
            };
          }),
        );
      },

      renameFile: (id, name) => {
        const normalized = normalizeRelativePath(name);
        if (!normalized) return;
        set((state) =>
          updateActiveProject(state, (p) => ({
            ...p,
            updatedAt: Date.now(),
            files: p.files.map((f) =>
              f.id === id ? { ...f, name: normalized } : f,
            ),
          })),
        );
      },

      updateFileContent: (id, content) => {
        set((state) =>
          updateActiveProject(state, (p) => ({
            ...p,
            updatedAt: Date.now(),
            files: p.files.map((f) => (f.id === id ? { ...f, content } : f)),
          })),
        );
      },

      setThreadOpen: (open) => set({ isThreadOpen: open }),

      setPdfData: (data) => {
        const projectId = get().activeProjectId;
        set({ pdfData: data, compileError: null });
        if (projectId) {
          saveProjectPdf(projectId, data).catch(() => {});
        }
      },

      setCompileError: (error) => {
        const projectId = get().activeProjectId;
        set({ compileError: error, pdfData: null });
        if (projectId) {
          saveProjectPdf(projectId, null).catch(() => {});
        }
      },

      setCompileDiagnostics: (meta) =>
        set({
          compileBuildId: meta.buildId,
          compileWarnings: meta.warnings,
          compileWarningCount: meta.warningCount,
          compileFullLog: meta.fullLog,
        }),

      requestPdfSyncTarget: (target) =>
        set((state) => ({
          pdfSyncTarget: {
            ...target,
            nonce: (state.pdfSyncTarget?.nonce ?? 0) + 1,
          },
        })),

      clearPdfSyncTarget: () => set({ pdfSyncTarget: null }),

      setIsCompiling: (isCompiling) => set({ isCompiling }),

      setIsSaving: (isSaving) => set({ isSaving }),

      setCursorPosition: (position) => set({ cursorPosition: position }),

      insertAtCursor: (text) => {
        const state = get();
        const activeFile = getActiveFile(state);
        if (!activeFile || !isTextFile(activeFile)) return;

        const content = activeFile.content ?? "";
        const { cursorPosition } = state;
        const newContent =
          content.slice(0, cursorPosition) +
          text +
          content.slice(cursorPosition);

        set((s) => ({
          ...updateActiveProject(s, (p) => ({
            ...p,
            updatedAt: Date.now(),
            files: p.files.map((f) =>
              f.id === activeFile.id ? { ...f, content: newContent } : f,
            ),
          })),
          cursorPosition: cursorPosition + text.length,
        }));
      },

      replaceSelection: (start, end, text) => {
        const state = get();
        const activeFile = getActiveFile(state);
        if (!activeFile || !isTextFile(activeFile)) return;

        const content = activeFile.content ?? "";
        const newContent = content.slice(0, start) + text + content.slice(end);

        set((s) => ({
          ...updateActiveProject(s, (p) => ({
            ...p,
            updatedAt: Date.now(),
            files: p.files.map((f) =>
              f.id === activeFile.id ? { ...f, content: newContent } : f,
            ),
          })),
          cursorPosition: start + text.length,
        }));
      },

      findAndReplace: (find, replace) => {
        const state = get();
        const activeFile = getActiveFile(state);
        if (!activeFile || !isTextFile(activeFile)) return false;

        const content = activeFile.content ?? "";
        if (!content.includes(find)) return false;

        const newContent = content.replace(find, replace);
        set((s) =>
          updateActiveProject(s, (p) => ({
            ...p,
            updatedAt: Date.now(),
            files: p.files.map((f) =>
              f.id === activeFile.id ? { ...f, content: newContent } : f,
            ),
          })),
        );
        return true;
      },

      setInitialized: () => set({ initialized: true }),

      setFileName: (name) => {
        const normalized = normalizeRelativePath(name) ?? name;
        set((state) =>
          updateActiveProject(state, (p) => ({
            ...p,
            updatedAt: Date.now(),
            files: p.files.map((f) =>
              f.id === state.activeFileId ? { ...f, name: normalized } : f,
            ),
          })),
        );
      },

      setContent: (content) => {
        set((state) =>
          updateActiveProject(state, (p) => ({
            ...p,
            updatedAt: Date.now(),
            files: p.files.map((f) =>
              f.id === state.activeFileId ? { ...f, content } : f,
            ),
          })),
        );
      },

      applyCloudSnapshot: (snapshot) => {
        if (!snapshot.projects || snapshot.projects.length === 0) return;

        set((state) => {
          const activeProject =
            snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ??
            snapshot.projects.find((p) => p.id === state.activeProjectId) ??
            snapshot.projects[0];

          const docTex = activeProject.files.find(
            (f) => f.name === "document.tex" || f.name === "main.tex",
          );
          const activeFileId = activeProject.files.some(
            (f) => f.id === activeProject.activeFileId,
          )
            ? activeProject.activeFileId
            : (docTex?.id ?? activeProject.files[0]?.id ?? "");

          const mainFileId = activeProject.files.some(
            (f) => f.id === activeProject.mainFileId,
          )
            ? activeProject.mainFileId
            : (docTex?.id ?? activeProject.files[0]?.id ?? "");

          const activeFile =
            activeProject.files.find((f) => f.id === activeFileId) ??
            activeProject.files[0];

          return {
            projects: snapshot.projects,
            activeProjectId: activeProject.id,
            projectSort: snapshot.projectSort ?? state.projectSort,
            aiModel: snapshot.aiModel ?? state.aiModel,
            files: activeProject.files,
            activeFileId,
            mainFileId,
            compiler: activeProject.compiler ?? "pdflatex",
            fileName: activeFile?.name ?? "document.tex",
            content: activeFile?.content ?? "",
            pdfData: null,
            compileError: null,
          };
        });

        const nextActiveId = get().activeProjectId;
        loadProjectPdf(nextActiveId)
          .then((cachedPdf) => {
            if (get().activeProjectId === nextActiveId) {
              set({ pdfData: cachedPdf });
            }
          })
          .catch(() => {});
      },
    }),
    {
      name: "open-prism-document",
      storage: createJSONStorage(() => indexedDBStorage),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        projectSort: state.projectSort,
        aiModel: state.aiModel,
      }),
      merge: (persisted, current) => {
        const data = persisted as Partial<DocumentState> | undefined;
        if (!data?.projects || data.projects.length === 0) {
          return current;
        }

        const activeProject =
          data.projects.find((p) => p.id === data.activeProjectId) ??
          data.projects[0];

        const docTex = activeProject.files.find(
          (f) => f.name === "document.tex" || f.name === "main.tex",
        );
        const activeFileId = activeProject.files.some(
          (f) => f.id === activeProject.activeFileId,
        )
          ? activeProject.activeFileId
          : (docTex?.id ?? activeProject.files[0]?.id ?? "");

        const mainFileId = activeProject.files.some(
          (f) => f.id === activeProject.mainFileId,
        )
          ? activeProject.mainFileId
          : (docTex?.id ?? activeProject.files[0]?.id ?? "");

        const mergedActiveFile =
          activeProject.files.find((f) => f.id === activeFileId) ??
          activeProject.files[0];

        const restoredPdf =
          data.pdfData instanceof Uint8Array
            ? data.pdfData
            : data.pdfData && typeof data.pdfData === "object"
              ? new Uint8Array(
                  Object.values(data.pdfData as Record<string, number>),
                )
              : null;

        return {
          ...current,
          projects: data.projects,
          activeProjectId: activeProject.id,
          projectSort: data.projectSort ?? "updatedAt",
          aiModel: data.aiModel ?? "gemini-4-hydrogen",
          files: activeProject.files,
          activeFileId,
          mainFileId,
          compiler: activeProject.compiler ?? "pdflatex",
          fileName: mergedActiveFile?.name ?? "document.tex",
          content: mergedActiveFile?.content ?? "",
          pdfData: restoredPdf && restoredPdf.length > 0 ? restoredPdf : null,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
