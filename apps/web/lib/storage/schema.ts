import type { DBSchema } from "idb";
import type { LatexCompiler } from "@/lib/latex-compiler";
import type { ProjectFile } from "@/lib/project-files";

export type ProjectSortOrder = "updatedAt" | "name";

export interface PersistedProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  compiler: LatexCompiler;
  mainFileId: string;
  activeFileId: string;
  files: ProjectFile[];
}

export interface OpenPrismDB extends DBSchema {
  documentState: {
    key: "state";
    value: {
      files: ProjectFile[];
      activeFileId: string;
      version: number;
    };
  };
  projectsState: {
    key: "state";
    value: {
      projects: PersistedProject[];
      activeProjectId: string;
      projectSort: ProjectSortOrder;
      version: number;
    };
  };
  blobs: {
    key: string;
    value: {
      id: string;
      data: string | Uint8Array;
      type: "image" | "binary" | "pdf";
    };
  };
}

export const DB_NAME = "open-prism";
export const DB_VERSION = 2;
export const STORAGE_VERSION = 2;
