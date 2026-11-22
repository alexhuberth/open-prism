"use client";

import type { User } from "@supabase/supabase-js";
import { create } from "zustand";
import { isTextFile, type ProjectFile } from "@/lib/project-files";
import {
  useDocumentStore,
  type GeminiModelId,
  type Project,
} from "@/stores/document-store";
import type { ProjectSortOrder } from "@/lib/storage/schema";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./client";

const ASSET_BUCKET = "project-assets";
const LAST_CLOUD_UID_KEY = "open-prism-last-cloud-uid";
const SYNC_DEBOUNCE_MS = 1200;

export type CloudSyncStatus =
  | "unconfigured"
  | "loading"
  | "signed_out"
  | "syncing"
  | "synced"
  | "error";

interface CloudProjectRow {
  user_id: string;
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  pinned: boolean;
  compiler: string;
  main_file_id: string;
  active_file_id: string;
}

interface CloudProjectFileRow {
  user_id: string;
  id: string;
  project_id: string;
  name: string;
  type: ProjectFile["type"];
  content: string | null;
  storage_path: string | null;
  updated_at: number;
}

interface CloudUserPreferencesRow {
  user_id: string;
  active_project_id: string | null;
  project_sort: ProjectSortOrder;
  ai_model: string;
  updated_at: number;
}

interface CloudUserInfo {
  id: string;
  email: string | null;
}

interface CloudSyncState {
  configured: boolean;
  status: CloudSyncStatus;
  user: CloudUserInfo | null;
  lastSyncedAt: number | null;
  error: string | null;
  syncNow: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function translateSupabaseError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "Ocurrió un error al conectar con Supabase.";

  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (lower.includes("email not confirmed")) {
    return "Debes confirmar tu correo electrónico antes de iniciar sesión.";
  }
  if (lower.includes("user already registered")) {
    return "Este correo electrónico ya está registrado.";
  }
  if (lower.includes("password should be at least")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (lower.includes("unable to validate email")) {
    return "Ingresa un correo electrónico válido.";
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Demasiados intentos en poco tiempo. Espera unos segundos e intenta nuevamente.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Sin conexión con Supabase. Tus cambios siguen guardados localmente.";
  }
  return message;
}

function sanitizePathSegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildAssetStoragePath(
  userId: string,
  projectId: string,
  fileId: string,
  fileName: string,
): string {
  const baseName = sanitizePathSegment(fileName.split("/").pop() || fileId);
  return `${userId}/${sanitizePathSegment(projectId)}/${sanitizePathSegment(fileId)}/${baseName}`;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(new Error("No se pudo leer el archivo desde almacenamiento."));
    reader.readAsDataURL(blob);
  });
}

function waitForDocumentHydration(): Promise<void> {
  if (useDocumentStore.persist.hasHydrated()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const unsub = useDocumentStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

// Runtime coordination state (kept outside React renders)
let controllerInitialized = false;
let isApplyingSnapshot = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight = false;
let syncPendingAfterFlight = false;
let currentUserId: string | null = null;

// Incremental change tracking per active user session
const knownProjectUpdatedAt = new Map<string, number>();
const knownProjectMetaSig = new Map<string, string>();
const knownFilesByProject = new Map<string, Set<string>>();
const knownFileSig = new Map<string, string>();
const knownFileStoragePath = new Map<string, string | null>();
const downloadedAssetCache = new Map<string, string>();
let knownPreferencesSig = "";

function clearTrackingState() {
  knownProjectUpdatedAt.clear();
  knownProjectMetaSig.clear();
  knownFilesByProject.clear();
  knownFileSig.clear();
  knownFileStoragePath.clear();
  knownPreferencesSig = "";
}

function getProjectMetaSignature(project: Project): string {
  return JSON.stringify([
    project.name,
    Boolean(project.pinned),
    project.compiler,
    project.mainFileId,
    project.activeFileId,
  ]);
}

function getFileSignature(file: ProjectFile): string {
  if (isTextFile(file)) {
    return `txt:${file.name}:${file.type}:${file.content ?? ""}`;
  }
  const len = file.dataUrl?.length ?? 0;
  const head = file.dataUrl?.slice(0, 48) ?? "";
  const tail = file.dataUrl?.slice(-24) ?? "";
  return `bin:${file.name}:${file.type}:${len}:${head}:${tail}`;
}

function recordProjectSnapshot(
  project: Project,
  storagePaths?: Map<string, string | null>,
) {
  knownProjectUpdatedAt.set(project.id, project.updatedAt);
  knownProjectMetaSig.set(project.id, getProjectMetaSignature(project));
  const fileIds = new Set<string>();
  for (const file of project.files) {
    fileIds.add(file.id);
    knownFileSig.set(`${project.id}:${file.id}`, getFileSignature(file));
    if (storagePaths?.has(file.id)) {
      knownFileStoragePath.set(
        `${project.id}:${file.id}`,
        storagePaths.get(file.id) ?? null,
      );
    }
  }
  knownFilesByProject.set(project.id, fileIds);
}

async function downloadAssetIfNeeded(
  storagePath: string,
): Promise<string | undefined> {
  const cached = downloadedAssetCache.get(storagePath);
  if (cached) return cached;

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return undefined;

  const { data, error } = await supabase.storage
    .from(ASSET_BUCKET)
    .download(storagePath);

  if (error || !data) {
    return undefined;
  }

  const dataUrl = await blobToDataUrl(data);
  downloadedAssetCache.set(storagePath, dataUrl);
  return dataUrl;
}

async function pullAndMergeCloudState(user: User): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  await waitForDocumentHydration();

  useCloudSyncStore.setState({
    status: "syncing",
    error: null,
  });

  const [projectsRes, filesRes, prefsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase.from("project_files").select("*").eq("user_id", user.id),
    supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (projectsRes.error) throw projectsRes.error;
  if (filesRes.error) throw filesRes.error;
  if (prefsRes.error) throw prefsRes.error;

  const cloudProjectsRows = (projectsRes.data ?? []) as CloudProjectRow[];
  const cloudFileRows = (filesRes.data ?? []) as CloudProjectFileRow[];
  const cloudPrefs = prefsRes.data as CloudUserPreferencesRow | null;

  clearTrackingState();

  const lastUid =
    typeof window !== "undefined"
      ? window.localStorage.getItem(LAST_CLOUD_UID_KEY)
      : null;
  const isAccountSwitch = Boolean(lastUid && lastUid !== user.id);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(LAST_CLOUD_UID_KEY, user.id);
  }

  const localState = useDocumentStore.getState();
  const localById = new Map(localState.projects.map((p) => [p.id, p]));

  // Reconstruct cloud projects and fetch binary assets when needed
  const filesByProjectId = new Map<string, CloudProjectFileRow[]>();
  for (const row of cloudFileRows) {
    const list = filesByProjectId.get(row.project_id) ?? [];
    list.push(row);
    filesByProjectId.set(row.project_id, list);
  }

  const cloudProjects: Project[] = await Promise.all(
    cloudProjectsRows.map(async (row) => {
      const localMatch = isAccountSwitch ? undefined : localById.get(row.id);
      const localFileById = new Map(
        (localMatch?.files ?? []).map((f) => [f.id, f]),
      );
      const rowsForProject = filesByProjectId.get(row.id) ?? [];
      const storagePaths = new Map<string, string | null>();

      const files: ProjectFile[] = await Promise.all(
        rowsForProject.map(async (fRow) => {
          storagePaths.set(fRow.id, fRow.storage_path);
          if (fRow.type !== "image" && fRow.type !== "binary") {
            return {
              id: fRow.id,
              name: fRow.name,
              type: fRow.type,
              content: fRow.content ?? "",
            };
          }

          const localBinary = localFileById.get(fRow.id);
          let dataUrl = localBinary?.dataUrl;
          if (!dataUrl && fRow.storage_path) {
            dataUrl = await downloadAssetIfNeeded(fRow.storage_path);
          }

          return {
            id: fRow.id,
            name: fRow.name,
            type: fRow.type,
            dataUrl,
          };
        }),
      );

      const cloudProj: Project = {
        id: row.id,
        name: row.name,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        pinned: row.pinned,
        compiler: row.compiler === "lualatex" ? "lualatex" : "pdflatex",
        mainFileId: row.main_file_id,
        activeFileId: row.active_file_id,
        files,
      };

      recordProjectSnapshot(cloudProj, storagePaths);
      return cloudProj;
    }),
  );

  // Merge cloud and local projects cleanly
  let mergedProjects: Project[];
  let shouldPushLocalDiffs = false;

  if (cloudProjects.length === 0) {
    // Brand-new cloud account: preserve local projects (unless switching accounts with existing cloud data)
    mergedProjects = localState.projects;
    shouldPushLocalDiffs = true;
  } else if (isAccountSwitch) {
    // Switched to another signed-in user: load that user's cloud workspace cleanly
    mergedProjects = cloudProjects;
  } else {
    const mergedMap = new Map<string, Project>();

    for (const cloudProj of cloudProjects) {
      const localProj = localById.get(cloudProj.id);
      if (!localProj) {
        mergedMap.set(cloudProj.id, cloudProj);
        continue;
      }

      // If local is untouched default placeholder, prefer cloud version
      const isUntouchedLocalDefault =
        localProj.id === "default-project" &&
        localProj.name === "Proyecto de ejemplo" &&
        localProj.files.length === 1 &&
        cloudProj.updatedAt !== localProj.updatedAt;

      // Never overwrite a populated local project with an empty cloud project row
      const cloudMissingFiles =
        cloudProj.files.length === 0 && localProj.files.length > 0;

      if (
        cloudMissingFiles ||
        (!isUntouchedLocalDefault && localProj.updatedAt > cloudProj.updatedAt)
      ) {
        mergedMap.set(cloudProj.id, localProj);
        shouldPushLocalDiffs = true;
      } else {
        mergedMap.set(cloudProj.id, cloudProj);
      }
    }

    // Preserve local-only projects created while offline / before signing in
    for (const localProj of localState.projects) {
      if (!mergedMap.has(localProj.id)) {
        const isOnlyPlaceholderDefault =
          localProj.id === "default-project" &&
          localProj.name === "Proyecto de ejemplo" &&
          localProj.files.length === 1 &&
          cloudProjects.length > 0;

        if (!isOnlyPlaceholderDefault) {
          mergedMap.set(localProj.id, localProj);
          shouldPushLocalDiffs = true;
        }
      }
    }

    mergedProjects = Array.from(mergedMap.values());
  }

  if (mergedProjects.length > 0) {
    const localActive = isAccountSwitch
      ? undefined
      : localById.get(localState.activeProjectId);
    const preferLocalActive = Boolean(
      localActive &&
        (!cloudPrefs?.updated_at ||
          localActive.updatedAt > Number(cloudPrefs.updated_at)),
    );
    const resolvedActiveProjectId = preferLocalActive
      ? localState.activeProjectId
      : (cloudPrefs?.active_project_id ?? localState.activeProjectId);

    isApplyingSnapshot = true;
    try {
      useDocumentStore.getState().applyCloudSnapshot({
        projects: mergedProjects,
        activeProjectId: resolvedActiveProjectId,
        projectSort: cloudPrefs?.project_sort ?? localState.projectSort,
        aiModel:
          (cloudPrefs?.ai_model as GeminiModelId | undefined) ??
          localState.aiModel,
      });
    } finally {
      isApplyingSnapshot = false;
    }
  }

  if (cloudPrefs) {
    knownPreferencesSig = JSON.stringify([
      cloudPrefs.active_project_id,
      cloudPrefs.project_sort,
      cloudPrefs.ai_model,
    ]);
  }

  if (shouldPushLocalDiffs) {
    await pushLocalChangesToCloud(user.id);
  } else {
    useCloudSyncStore.setState({
      status: "synced",
      lastSyncedAt: Date.now(),
      error: null,
    });
  }
}

async function pushLocalChangesToCloud(userId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || currentUserId !== userId) return;

  if (syncInFlight) {
    syncPendingAfterFlight = true;
    return;
  }

  syncInFlight = true;
  useCloudSyncStore.setState({ status: "syncing", error: null });

  try {
    const state = useDocumentStore.getState();
    const currentProjectIds = new Set(state.projects.map((p) => p.id));

    // 1. Delete projects removed locally
    const deletedProjectIds = Array.from(knownProjectUpdatedAt.keys()).filter(
      (id) => !currentProjectIds.has(id),
    );

    if (deletedProjectIds.length > 0) {
      const storagePathsToDelete: string[] = [];
      for (const projId of deletedProjectIds) {
        const prevFileIds = knownFilesByProject.get(projId);
        if (prevFileIds) {
          for (const fileId of prevFileIds) {
            const path = knownFileStoragePath.get(`${projId}:${fileId}`);
            if (path) storagePathsToDelete.push(path);
            knownFileSig.delete(`${projId}:${fileId}`);
            knownFileStoragePath.delete(`${projId}:${fileId}`);
          }
        }
        knownProjectUpdatedAt.delete(projId);
        knownProjectMetaSig.delete(projId);
        knownFilesByProject.delete(projId);
      }

      if (storagePathsToDelete.length > 0) {
        await supabase.storage.from(ASSET_BUCKET).remove(storagePathsToDelete);
      }

      const { error: delProjErr } = await supabase
        .from("projects")
        .delete()
        .eq("user_id", userId)
        .in("id", deletedProjectIds);
      if (delProjErr) throw delProjErr;
    }

    // 2. Upsert modified projects & files
    for (const project of state.projects) {
      const prevUpdated = knownProjectUpdatedAt.get(project.id);
      const nextMetaSig = getProjectMetaSignature(project);
      const prevMetaSig = knownProjectMetaSig.get(project.id);
      const projectMetaChanged =
        prevUpdated === undefined ||
        prevMetaSig !== nextMetaSig ||
        prevUpdated !== project.updatedAt;

      if (projectMetaChanged) {
        const { error: projErr } = await supabase.from("projects").upsert(
          {
            user_id: userId,
            id: project.id,
            name: project.name,
            created_at: project.createdAt,
            updated_at: project.updatedAt,
            pinned: Boolean(project.pinned),
            compiler: project.compiler,
            main_file_id: project.mainFileId,
            active_file_id: project.activeFileId,
          },
          { onConflict: "user_id,id" },
        );
        if (projErr) throw projErr;
      }

      const prevFileIds = knownFilesByProject.get(project.id) ?? new Set();
      const nextFileIds = new Set(project.files.map((f) => f.id));

      // Delete removed files inside this project
      const deletedFileIds = Array.from(prevFileIds).filter(
        (id) => !nextFileIds.has(id),
      );
      if (deletedFileIds.length > 0) {
        const pathsToDelete: string[] = [];
        for (const fileId of deletedFileIds) {
          const path = knownFileStoragePath.get(`${project.id}:${fileId}`);
          if (path) pathsToDelete.push(path);
          knownFileSig.delete(`${project.id}:${fileId}`);
          knownFileStoragePath.delete(`${project.id}:${fileId}`);
        }
        if (pathsToDelete.length > 0) {
          await supabase.storage.from(ASSET_BUCKET).remove(pathsToDelete);
        }
        const { error: delFileErr } = await supabase
          .from("project_files")
          .delete()
          .eq("user_id", userId)
          .eq("project_id", project.id)
          .in("id", deletedFileIds);
        if (delFileErr) throw delFileErr;
      }

      // Upsert new or changed files inside this project
      const fileRowsToUpsert: CloudProjectFileRow[] = [];
      const pendingPathRecords = new Map<string, string | null>();

      for (const file of project.files) {
        const key = `${project.id}:${file.id}`;
        const nextSig = getFileSignature(file);
        if (knownFileSig.get(key) === nextSig) {
          continue;
        }

        let storagePath: string | null = knownFileStoragePath.get(key) ?? null;
        if (!isTextFile(file) && file.dataUrl) {
          storagePath = buildAssetStoragePath(
            userId,
            project.id,
            file.id,
            file.name,
          );
          const blob = await dataUrlToBlob(file.dataUrl);
          const { error: uploadErr } = await supabase.storage
            .from(ASSET_BUCKET)
            .upload(storagePath, blob, {
              upsert: true,
              contentType: blob.type || "application/octet-stream",
            });
          if (uploadErr) throw uploadErr;
          downloadedAssetCache.set(storagePath, file.dataUrl);
        }

        pendingPathRecords.set(file.id, storagePath);
        fileRowsToUpsert.push({
          user_id: userId,
          id: file.id,
          project_id: project.id,
          name: file.name,
          type: file.type,
          content: isTextFile(file) ? (file.content ?? "") : null,
          storage_path: isTextFile(file) ? null : storagePath,
          updated_at: project.updatedAt,
        });
      }

      if (fileRowsToUpsert.length > 0) {
        const CHUNK_SIZE = 25;
        for (let i = 0; i < fileRowsToUpsert.length; i += CHUNK_SIZE) {
          const chunk = fileRowsToUpsert.slice(i, i + CHUNK_SIZE);
          const { error: filesErr } = await supabase
            .from("project_files")
            .upsert(chunk, { onConflict: "user_id,id" });
          if (filesErr) throw filesErr;
        }
      }

      recordProjectSnapshot(project, pendingPathRecords);
    }

    // 3. Upsert user preferences when changed
    const nextPrefsSig = JSON.stringify([
      state.activeProjectId,
      state.projectSort,
      state.aiModel,
    ]);
    if (nextPrefsSig !== knownPreferencesSig) {
      const { error: prefsErr } = await supabase
        .from("user_preferences")
        .upsert(
          {
            user_id: userId,
            active_project_id: state.activeProjectId,
            project_sort: state.projectSort,
            ai_model: state.aiModel,
            updated_at: Date.now(),
          },
          { onConflict: "user_id" },
        );
      if (prefsErr) throw prefsErr;
      knownPreferencesSig = nextPrefsSig;
    }

    useCloudSyncStore.setState({
      status: "synced",
      lastSyncedAt: Date.now(),
      error: null,
    });
  } catch (err) {
    useCloudSyncStore.setState({
      status: "error",
      error: translateSupabaseError(err),
    });
  } finally {
    syncInFlight = false;
    if (syncPendingAfterFlight) {
      syncPendingAfterFlight = false;
      if (currentUserId === userId) {
        scheduleCloudSync(userId);
      }
    }
  }
}

function scheduleCloudSync(userId: string) {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void pushLocalChangesToCloud(userId);
  }, SYNC_DEBOUNCE_MS);
}

export const useCloudSyncStore = create<CloudSyncState>((set, get) => ({
  configured: isSupabaseConfigured(),
  status: isSupabaseConfigured() ? "loading" : "unconfigured",
  user: null,
  lastSyncedAt: null,
  error: null,

  syncNow: async () => {
    const supabase = getSupabaseBrowserClient();
    const user = get().user;
    if (!supabase || !user) return;
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    await pushLocalChangesToCloud(user.id);
  },

  signOut: async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    currentUserId = null;
    clearTrackingState();
    await supabase.auth.signOut();
    set({
      user: null,
      status: "signed_out",
      lastSyncedAt: null,
      error: null,
    });
  },
}));

export function initCloudSync(): () => void {
  if (typeof window === "undefined" || controllerInitialized) {
    return () => {};
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    useCloudSyncStore.setState({
      configured: false,
      status: "unconfigured",
      user: null,
    });
    return () => {};
  }

  controllerInitialized = true;

  const handleUserSignedIn = async (user: User) => {
    currentUserId = user.id;
    useCloudSyncStore.setState({
      configured: true,
      user: { id: user.id, email: user.email ?? null },
      error: null,
    });

    try {
      await pullAndMergeCloudState(user);
    } catch (err) {
      useCloudSyncStore.setState({
        status: "error",
        error: translateSupabaseError(err),
      });
    }
  };

  void supabase.auth.getSession().then(({ data, error }) => {
    if (error || !data.session?.user) {
      currentUserId = null;
      useCloudSyncStore.setState({
        configured: true,
        status: "signed_out",
        user: null,
        error: error ? translateSupabaseError(error) : null,
      });
      return;
    }
    void handleUserSignedIn(data.session.user);
  });

  const { data: authListener } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        currentUserId = null;
        clearTrackingState();
        if (syncTimer) {
          clearTimeout(syncTimer);
          syncTimer = null;
        }
        useCloudSyncStore.setState({
          user: null,
          status: "signed_out",
          lastSyncedAt: null,
          error: null,
        });
        return;
      }

      if (
        (event === "SIGNED_IN" || event === "USER_UPDATED") &&
        session.user.id !== currentUserId
      ) {
        void handleUserSignedIn(session.user);
      }
    },
  );

  const unsubStore = useDocumentStore.subscribe((state, prevState) => {
    if (!currentUserId || isApplyingSnapshot) return;

    const changed =
      state.projects !== prevState.projects ||
      state.activeProjectId !== prevState.activeProjectId ||
      state.projectSort !== prevState.projectSort ||
      state.aiModel !== prevState.aiModel;

    if (changed) {
      scheduleCloudSync(currentUserId);
    }
  });

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden" && currentUserId && syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
      void pushLocalChangesToCloud(currentUserId);
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    authListener.subscription.unsubscribe();
    unsubStore();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    controllerInitialized = false;
  };
}
