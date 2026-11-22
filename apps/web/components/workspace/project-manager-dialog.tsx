"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CopyIcon,
  DownloadIcon,
  FolderArchiveIcon,
  FolderInputIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  exportProjectAsZip,
  importFileList,
  importZipArchive,
} from "@/lib/project-files";
import {
  PROJECT_TEMPLATES,
  type ProjectTemplateId,
} from "@/lib/project-templates";
import { cn } from "@/lib/utils";
import { useDocumentStore, type Project } from "@/stores/document-store";

interface ProjectManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "list" | "create";
}

function formatUpdatedDate(timestamp: number): string {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function ProjectManagerDialog({
  open,
  onOpenChange,
  initialMode = "list",
}: ProjectManagerDialogProps) {
  const projects = useDocumentStore((s) => s.projects);
  const activeProjectId = useDocumentStore((s) => s.activeProjectId);
  const projectSort = useDocumentStore((s) => s.projectSort);
  const createProject = useDocumentStore((s) => s.createProject);
  const selectProject = useDocumentStore((s) => s.selectProject);
  const renameProject = useDocumentStore((s) => s.renameProject);
  const duplicateProject = useDocumentStore((s) => s.duplicateProject);
  const deleteProject = useDocumentStore((s) => s.deleteProject);
  const togglePinProject = useDocumentStore((s) => s.togglePinProject);
  const setProjectSort = useDocumentStore((s) => s.setProjectSort);

  const [mode, setMode] = useState<"list" | "create">(initialMode);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedTemplate, setSelectedTemplate] =
    useState<ProjectTemplateId>("article");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setEditingId(null);
    }
  }, [open, initialMode]);

  const sortedProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? projects.filter((p) => p.name.toLowerCase().includes(query))
      : projects;

    return [...filtered].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      if (projectSort === "name") {
        return a.name.localeCompare(b.name, "es");
      }
      return b.updatedAt - a.updatedAt;
    });
  }, [projects, search, projectSort]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setMode(initialMode);
      setEditingId(null);
    }
    onOpenChange(nextOpen);
  };

  const handleCreateFromTemplate = () => {
    const template = PROJECT_TEMPLATES.find((t) => t.id === selectedTemplate);
    const projectName = newName.trim() || template?.name || "Nuevo proyecto";
    createProject({
      name: projectName,
      templateId: selectedTemplate,
    });
    setNewName("");
    onOpenChange(false);
    toast.success(`Proyecto "${projectName}" creado`);
  };

  const handleCreateFromZip = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = await importZipArchive(file);
      if (imported.files.length === 0) {
        toast.error("El archivo .zip no contiene archivos compatibles");
        return;
      }
      const fallbackName = file.name.replace(/\.zip$/i, "");
      const projectName = newName.trim() || fallbackName || "Proyecto .zip";
      createProject({
        name: projectName,
        files: imported.files,
        mainFileName: imported.suggestedMainName,
      });
      setNewName("");
      onOpenChange(false);
      toast.success(
        `Proyecto "${projectName}" importado (${imported.files.length} archivos)`,
      );
    } catch {
      toast.error("No se pudo leer el archivo .zip");
    }
  };

  const handleCreateFromFolder = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    try {
      const imported = await importFileList(fileList, {
        stripWrapperDir: true,
      });
      if (imported.files.length === 0) {
        toast.error("La carpeta no contiene archivos compatibles");
        return;
      }
      const firstRel = fileList[0].webkitRelativePath;
      const folderName = firstRel ? firstRel.split("/")[0] : "Carpeta";
      const projectName = newName.trim() || folderName;
      createProject({
        name: projectName,
        files: imported.files,
        mainFileName: imported.suggestedMainName,
      });
      setNewName("");
      onOpenChange(false);
      toast.success(
        `Proyecto "${projectName}" creado desde carpeta (${imported.files.length} archivos)`,
      );
    } catch {
      toast.error("No se pudo importar la carpeta");
    }
  };

  const handleStartRename = (project: Project) => {
    setEditingId(project.id);
    setEditingName(project.name);
  };

  const handleCommitRename = () => {
    if (editingId && editingName.trim()) {
      renameProject(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  const handleExportZip = async (project: Project) => {
    try {
      await exportProjectAsZip(project.name, project.files);
      toast.success(`Proyecto "${project.name}" exportado en .zip`);
    } catch {
      toast.error("Error al exportar el proyecto");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Crear nuevo proyecto" : "Mis proyectos"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 border-border border-b pb-3">
          <Button
            variant={mode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("list")}
          >
            Proyectos ({projects.length})
          </Button>
          <Button
            variant={mode === "create" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("create")}
          >
            <PlusIcon className="mr-1.5 size-4" />
            Nuevo proyecto
          </Button>
        </div>

        {mode === "list" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar proyectos..."
                  className="pl-8"
                />
              </div>
              <Select
                value={projectSort}
                onValueChange={(v) => setProjectSort(v as "updatedAt" | "name")}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updatedAt">Más recientes</SelectItem>
                  <SelectItem value="name">Nombre (A–Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {sortedProjects.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No se encontraron proyectos con ese filtro.
                </div>
              ) : (
                sortedProjects.map((project) => {
                  const isActive = project.id === activeProjectId;
                  const isEditing = editingId === project.id;

                  return (
                    <div
                      key={project.id}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg border p-3 transition-colors",
                        isActive
                          ? "border-primary bg-muted/60"
                          : "border-border hover:bg-muted/30",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCommitRename();
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              autoFocus
                              className="h-7 text-sm"
                            />
                            <Button size="sm" onClick={handleCommitRename}>
                              Guardar
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="flex w-full flex-col text-left"
                            onClick={() => {
                              selectProject(project.id);
                              onOpenChange(false);
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-sm">
                                {project.name}
                              </span>
                              {project.pinned && (
                                <PinIcon className="size-3.5 shrink-0 text-primary" />
                              )}
                              {isActive && (
                                <span className="rounded bg-primary/15 px-1.5 py-0.5 font-medium text-[11px] text-primary">
                                  Activo
                                </span>
                              )}
                            </div>
                            <span className="text-muted-foreground text-xs">
                              {project.files.length}{" "}
                              {project.files.length === 1
                                ? "archivo"
                                : "archivos"}{" "}
                              · {project.compiler} · Actualizado:{" "}
                              {formatUpdatedDate(project.updatedAt)}
                            </span>
                          </button>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title={project.pinned ? "Desfijar" : "Fijar arriba"}
                          onClick={() => togglePinProject(project.id)}
                        >
                          <PinIcon
                            className={cn(
                              "size-4",
                              project.pinned && "fill-current text-primary",
                            )}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Renombrar proyecto"
                          onClick={() => handleStartRename(project)}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Duplicar proyecto"
                          onClick={() => duplicateProject(project.id)}
                        >
                          <CopyIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Descargar proyecto (.zip)"
                          onClick={() => handleExportZip(project)}
                        >
                          <DownloadIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          title="Eliminar proyecto"
                          disabled={projects.length <= 1}
                          onClick={() => deleteProject(project.id)}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <label htmlFor="new-project-name" className="font-medium text-sm">
                Nombre del proyecto
              </label>
              <Input
                id="new-project-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej. Tesis de maestría, Artículo IEEE..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFromTemplate();
                }}
              />
            </div>

            <div className="space-y-2">
              <span className="font-medium text-sm">Elige una plantilla</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PROJECT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border p-3 text-left transition-colors",
                      selectedTemplate === tpl.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    <span className="font-medium text-sm">{tpl.name}</span>
                    <span className="mt-0.5 text-muted-foreground text-xs">
                      {tpl.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-border border-t pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => zipInputRef.current?.click()}
                >
                  <FolderArchiveIcon className="mr-1.5 size-4" />
                  Importar desde .zip
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FolderInputIcon className="mr-1.5 size-4" />
                  Importar carpeta
                </Button>
              </div>
              <Button type="button" onClick={handleCreateFromTemplate}>
                Crear proyecto
              </Button>
            </div>

            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                handleCreateFromZip(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              className="hidden"
              multiple
              {...({ webkitdirectory: "", directory: "" } as Record<
                string,
                string
              >)}
              onChange={(e) => {
                handleCreateFromFolder(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
