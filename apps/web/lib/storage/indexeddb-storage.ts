import { openDB, type IDBPDatabase } from "idb";
import type { StateStorage } from "zustand/middleware";
import {
  detectMainTexFileName,
  isTextFile,
  type ProjectFile,
} from "@/lib/project-files";
import {
  type OpenPrismDB,
  type PersistedProject,
  type ProjectSortOrder,
  DB_NAME,
  DB_VERSION,
  STORAGE_VERSION,
} from "./schema";
import { migrateFromLocalStorage } from "./migrate";

let dbPromise: Promise<IDBPDatabase<OpenPrismDB>> | null = null;

function getDB(): Promise<IDBPDatabase<OpenPrismDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OpenPrismDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("documentState")) {
          db.createObjectStore("documentState");
        }
        if (!db.objectStoreNames.contains("projectsState")) {
          db.createObjectStore("projectsState");
        }
        if (!db.objectStoreNames.contains("blobs")) {
          db.createObjectStore("blobs", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

interface PersistedAppState {
  projects: PersistedProject[];
  activeProjectId: string;
  projectSort: ProjectSortOrder;
  files?: ProjectFile[];
  activeFileId?: string;
  pdfData?: Uint8Array | null;
}

function normalizeUint8Array(data: unknown): Uint8Array | null {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (typeof data === "object") {
    return new Uint8Array(Object.values(data as Record<string, number>));
  }
  return null;
}

function pdfBlobKey(projectId: string): string {
  return `pdf:${projectId}`;
}

export async function loadProjectPdf(
  projectId: string,
): Promise<Uint8Array | null> {
  if (typeof window === "undefined") return null;
  const db = await getDB();
  const blob = await db.get("blobs", pdfBlobKey(projectId));
  return blob && blob.data instanceof Uint8Array ? blob.data : null;
}

export async function saveProjectPdf(
  projectId: string,
  data: Uint8Array | null,
): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await getDB();
  const key = pdfBlobKey(projectId);
  if (data) {
    await db.put("blobs", { id: key, data, type: "pdf" });
  } else {
    await db.delete("blobs", key);
  }
}

export const indexedDBStorage: StateStorage = {
  async getItem(name: string): Promise<string | null> {
    const db = await getDB();
    let stored = await db.get("projectsState", "state");

    if (!stored) {
      const legacyDoc = await db.get("documentState", "state");
      const legacyLocal = legacyDoc
        ? null
        : await migrateFromLocalStorage(name);
      const legacySource = legacyDoc ?? legacyLocal;

      if (legacySource && legacySource.files.length > 0) {
        const now = Date.now();
        const defaultProjectId = "default-project";
        const mainName = detectMainTexFileName(legacySource.files);
        const mainFile =
          legacySource.files.find((f) => f.name === mainName) ??
          legacySource.files[0];

        const migratedProject: PersistedProject = {
          id: defaultProjectId,
          name: "Proyecto principal",
          createdAt: now,
          updatedAt: now,
          pinned: false,
          compiler: "pdflatex",
          mainFileId: mainFile.id,
          activeFileId: legacySource.activeFileId || mainFile.id,
          files: legacySource.files,
        };

        const legacyPdf = await db.get("blobs", "pdf");
        if (legacyPdf && legacyPdf.data instanceof Uint8Array) {
          await db.put("blobs", {
            id: pdfBlobKey(defaultProjectId),
            data: legacyPdf.data,
            type: "pdf",
          });
          await db.delete("blobs", "pdf");
        }

        stored = {
          projects: [migratedProject],
          activeProjectId: defaultProjectId,
          projectSort: "updatedAt",
          version: STORAGE_VERSION,
        };
        await db.put("projectsState", stored, "state");
      }
    }

    if (!stored || stored.projects.length === 0) return null;

    const hydratedProjects: PersistedProject[] = await Promise.all(
      stored.projects.map(async (project) => {
        const hydratedFiles = await Promise.all(
          project.files.map(async (file) => {
            if (!isTextFile(file)) {
              const blob = await db.get("blobs", file.id);
              if (blob && typeof blob.data === "string") {
                return { ...file, dataUrl: blob.data };
              }
            }
            return file;
          }),
        );
        return {
          ...project,
          files: hydratedFiles,
        };
      }),
    );

    const activeProject =
      hydratedProjects.find((p) => p.id === stored.activeProjectId) ??
      hydratedProjects[0];

    const pdfBlob = await db.get("blobs", pdfBlobKey(activeProject.id));
    const pdfData =
      pdfBlob && pdfBlob.data instanceof Uint8Array ? pdfBlob.data : null;

    const state: PersistedAppState = {
      projects: hydratedProjects,
      activeProjectId: activeProject.id,
      projectSort: stored.projectSort ?? "updatedAt",
      files: activeProject.files,
      activeFileId: activeProject.activeFileId,
      pdfData,
    };

    return JSON.stringify({ state });
  },

  async setItem(_name: string, value: string): Promise<void> {
    const db = await getDB();
    const parsed = JSON.parse(value);
    const state = parsed.state as PersistedAppState;
    if (!state.projects || state.projects.length === 0) return;

    const projectsToStore: PersistedProject[] = [];
    const blobsToStore: {
      id: string;
      data: string | Uint8Array;
      type: "image" | "binary" | "pdf";
    }[] = [];

    const validFileIds = new Set<string>();
    const validPdfKeys = new Set<string>();

    for (const project of state.projects) {
      validPdfKeys.add(pdfBlobKey(project.id));
      const cleanFiles: ProjectFile[] = [];

      for (const file of project.files) {
        validFileIds.add(file.id);
        if (!isTextFile(file) && file.dataUrl) {
          blobsToStore.push({
            id: file.id,
            data: file.dataUrl,
            type: file.type === "image" ? "image" : "binary",
          });
          cleanFiles.push({ ...file, dataUrl: undefined });
        } else {
          cleanFiles.push(file);
        }
      }

      projectsToStore.push({
        ...project,
        files: cleanFiles,
      });
    }

    const activePdfBytes = normalizeUint8Array(state.pdfData);
    if (activePdfBytes && state.activeProjectId) {
      blobsToStore.push({
        id: pdfBlobKey(state.activeProjectId),
        data: activePdfBytes,
        type: "pdf",
      });
    }

    const existingBlobKeys = await db.getAllKeys("blobs");
    const orphanKeys = existingBlobKeys.filter((key) => {
      if (key.startsWith("pdf:")) {
        return !validPdfKeys.has(key);
      }
      return !validFileIds.has(key);
    });

    const tx = db.transaction(["projectsState", "blobs"], "readwrite");

    await tx.objectStore("projectsState").put(
      {
        projects: projectsToStore,
        activeProjectId: state.activeProjectId,
        projectSort: state.projectSort ?? "updatedAt",
        version: STORAGE_VERSION,
      },
      "state",
    );

    const blobStore = tx.objectStore("blobs");
    for (const blob of blobsToStore) {
      await blobStore.put(blob);
    }

    for (const id of orphanKeys) {
      await blobStore.delete(id);
    }

    await tx.done;
  },

  async removeItem(_name: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(
      ["documentState", "projectsState", "blobs"],
      "readwrite",
    );
    await tx.objectStore("documentState").clear();
    await tx.objectStore("projectsState").clear();
    await tx.objectStore("blobs").clear();
    await tx.done;
  },
};

let storageReady = false;
let storageReadyPromise: Promise<void> | null = null;

export function waitForStorageReady(): Promise<void> {
  if (storageReady) return Promise.resolve();

  if (!storageReadyPromise) {
    storageReadyPromise = (async () => {
      await getDB();
      storageReady = true;
    })();
  }

  return storageReadyPromise;
}

export function isStorageReady(): boolean {
  return storageReady;
}
