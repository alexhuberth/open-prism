"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  FolderArchiveIcon,
  FolderIcon,
  FolderInputIcon,
  FolderKanbanIcon,
  FolderOpenIcon,
  GithubIcon,
  HashIcon,
  ImageIcon,
  ListIcon,
  MonitorIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  SunIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  buildFileTree,
  exportProjectAsZip,
  importDroppedDataTransfer,
  importFileList,
  importZipArchive,
  isImageFile,
  isTextFile,
  isTexFile,
  type FileTreeNode,
} from "@/lib/project-files";
import { cn } from "@/lib/utils";
import packageJson from "@/package.json";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { ProjectManagerDialog } from "./project-manager-dialog";

interface TocItem {
  level: number;
  title: string;
  line: number;
}

function parseTableOfContents(content: string): TocItem[] {
  const lines = content.split("\n");
  const toc: TocItem[] = [];

  const sectionRegex =
    /\\(section|subsection|subsubsection|chapter|part)\*?\s*\{([^}]*)\}/;

  const levelMap: Record<string, number> = {
    part: 0,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
  };

  lines.forEach((line, index) => {
    const match = line.match(sectionRegex);
    if (match) {
      const [, type, title] = match;
      toc.push({
        level: levelMap[type] ?? 2,
        title: title.trim(),
        line: index + 1,
      });
    }
  });

  return toc;
}

export function Sidebar() {
  const projects = useDocumentStore((s) => s.projects);
  const activeProjectId = useDocumentStore((s) => s.activeProjectId);
  const projectSort = useDocumentStore((s) => s.projectSort);
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const selectProject = useDocumentStore((s) => s.selectProject);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const setMainFile = useDocumentStore((s) => s.setMainFile);
  const addFile = useDocumentStore((s) => s.addFile);
  const importFiles = useDocumentStore((s) => s.importFiles);
  const deleteFile = useDocumentStore((s) => s.deleteFile);
  const deleteFolder = useDocumentStore((s) => s.deleteFolder);
  const renameFile = useDocumentStore((s) => s.renameFile);
  const content = useDocumentStore((s) => s.content);
  const requestJumpToPosition = useDocumentStore(
    (s) => s.requestJumpToPosition,
  );
  const { theme, setTheme } = useTheme();

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId],
  );

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      if (projectSort === "name") {
        return a.name.localeCompare(b.name, "es");
      }
      return b.updatedAt - a.updatedAt;
    });
  }, [projects, projectSort]);

  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const toc = useMemo(() => parseTableOfContents(content), [content]);

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState<"list" | "create">(
    "list",
  );

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleTocClick = useCallback(
    (line: number) => {
      const lines = content.split("\n");
      let position = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i++) {
        position += lines[i].length + 1;
      }
      requestJumpToPosition(position);
    },
    [content, requestJumpToPosition],
  );

  const toggleFolder = (path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const openNewFileDialog = (folderPrefix?: string) => {
    setNewFileName(folderPrefix ? `${folderPrefix}/` : "");
    setAddDialogOpen(true);
  };

  const handleAddFile = () => {
    const cleaned = newFileName.trim().replace(/\/+$/, "");
    const raw = cleaned || "sin-titulo.tex";
    const lastSegment = raw.split("/").pop() || "sin-titulo.tex";
    const resolvedPath = cleaned.endsWith("/")
      ? `${cleaned}sin-titulo.tex`
      : lastSegment.includes(".")
        ? raw
        : `${raw}.tex`;
    const isTex = resolvedPath.toLowerCase().endsWith(".tex");

    addFile({
      name: resolvedPath,
      type: isTex ? "tex" : "text",
      content: isTex
        ? "\\documentclass{article}\n\\usepackage[T1]{fontenc}\n\n\\begin{document}\n\n% Tu contenido aquí\n\n\\end{document}\n"
        : "",
    });
    setNewFileName("");
    setAddDialogOpen(false);
  };

  const handleFileUpload = useCallback(
    async (uploadedFiles: FileList | null) => {
      if (!uploadedFiles || uploadedFiles.length === 0) return;
      try {
        const result = await importFileList(uploadedFiles);
        if (result.files.length === 0) {
          toast.error("No se encontraron archivos compatibles");
          return;
        }
        importFiles(result.files, result.suggestedMainName);
        toast.success(
          `Se agregaron ${result.files.length} ${result.files.length === 1 ? "archivo" : "archivos"}`,
        );
      } catch {
        toast.error("No se pudieron cargar los archivos");
      }
    },
    [importFiles],
  );

  const handleFolderUpload = useCallback(
    async (uploadedFiles: FileList | null) => {
      if (!uploadedFiles || uploadedFiles.length === 0) return;
      try {
        const result = await importFileList(uploadedFiles, {
          stripWrapperDir: true,
        });
        if (result.files.length === 0) {
          toast.error("La carpeta no contiene archivos compatibles");
          return;
        }
        importFiles(result.files, result.suggestedMainName);
        toast.success(`Carpeta importada (${result.files.length} archivos)`);
      } catch {
        toast.error("No se pudo importar la carpeta");
      }
    },
    [importFiles],
  );

  const handleZipUpload = useCallback(
    async (zipFile: File | undefined) => {
      if (!zipFile) return;
      try {
        const result = await importZipArchive(zipFile);
        if (result.files.length === 0) {
          toast.error("El archivo .zip no contiene archivos compatibles");
          return;
        }
        importFiles(result.files, result.suggestedMainName);
        toast.success(
          `Archivo .zip importado (${result.files.length} archivos)`,
        );
      } catch {
        toast.error("No se pudo descomprimir el archivo .zip");
      }
    },
    [importFiles],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    try {
      const result = await importDroppedDataTransfer(e.dataTransfer);
      if (result.files.length === 0) {
        toast.error("No se encontraron archivos compatibles");
        return;
      }
      importFiles(result.files, result.suggestedMainName);
      toast.success(
        `Se importaron ${result.files.length} ${result.files.length === 1 ? "archivo" : "archivos"}`,
      );
    } catch {
      toast.error("Error al procesar los elementos arrastrados");
    }
  };

  const handleExportCurrentZip = async () => {
    if (!activeProject) return;
    try {
      await exportProjectAsZip(activeProject.name, files);
      toast.success("Proyecto exportado en .zip");
    } catch {
      toast.error("Error al exportar el proyecto");
    }
  };

  const openRenameDialog = (file: ProjectFile) => {
    setRenameFileId(file.id);
    setRenameValue(file.name);
    setRenameDialogOpen(true);
  };

  const handleRename = () => {
    if (renameFileId && renameValue.trim()) {
      renameFile(renameFileId, renameValue.trim());
    }
    setRenameDialogOpen(false);
    setRenameFileId(null);
    setRenameValue("");
  };

  const getFileIcon = (file: ProjectFile) => {
    if (isImageFile(file)) {
      return <ImageIcon className="size-4 shrink-0" />;
    }
    if (isTextFile(file)) {
      return <FileTextIcon className="size-4 shrink-0" />;
    }
    return <FileIcon className="size-4 shrink-0" />;
  };

  const renderTreeNodes = (nodes: FileTreeNode[], depth = 0) => {
    return nodes.map((node) => {
      if (node.kind === "folder") {
        const isCollapsed = collapsedFolders.has(node.path);
        return (
          <div key={node.path}>
            <div
              className="group flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-sidebar-accent/50"
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
            >
              <button
                type="button"
                className="flex flex-1 items-center gap-1.5 overflow-hidden"
                onClick={() => toggleFolder(node.path)}
              >
                {isCollapsed ? (
                  <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                {isCollapsed ? (
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-medium">{node.name}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 opacity-0 group-hover:opacity-100"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => openNewFileDialog(node.path)}
                  >
                    <PlusIcon className="mr-2 size-4" />
                    Nuevo archivo aquí
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      const prefix = `${node.path.replace(/\/+$/, "")}/`;
                      const remaining = files.filter(
                        (f) => !f.name.startsWith(prefix),
                      );
                      if (remaining.length === 0) {
                        toast.error(
                          "El proyecto debe conservar al menos un archivo",
                        );
                        return;
                      }
                      deleteFolder(node.path);
                    }}
                  >
                    <Trash2Icon className="mr-2 size-4" />
                    Eliminar carpeta
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {!isCollapsed && (
              <div className="space-y-0.5">
                {renderTreeNodes(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      const file = node.file;
      const isMain = file.id === mainFileId;
      const canBeMain = isTexFile(file);

      return (
        <div
          key={file.id}
          className={cn(
            "group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors",
            file.id === activeFileId
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-accent/50",
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <button
            type="button"
            className="flex flex-1 items-center gap-2 overflow-hidden"
            onClick={() => setActiveFile(file.id)}
          >
            {getFileIcon(file)}
            <span className="truncate">{node.name}</span>
            {isMain && (
              <StarIcon
                className="size-3 shrink-0 fill-amber-500 text-amber-500"
                aria-label="Archivo principal"
              />
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontalIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canBeMain && !isMain && (
                <DropdownMenuItem onClick={() => setMainFile(file.id)}>
                  <StarIcon className="mr-2 size-4" />
                  Marcar como principal
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => openRenameDialog(file)}>
                <PencilIcon className="mr-2 size-4" />
                Renombrar
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => deleteFile(file.id)}
                disabled={files.length <= 1}
              >
                <Trash2Icon className="mr-2 size-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    });
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground",
        isDragging && "ring-2 ring-primary ring-inset",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Cabecera y selector de proyecto */}
      <div className="flex items-center justify-between gap-1 border-sidebar-border border-b px-2.5 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 min-w-0 flex-1 justify-between px-2 font-semibold text-sm"
            >
              <span className="truncate">
                {activeProject?.name ?? "OpenPrism"}
              </span>
              <ChevronDownIcon className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            {sortedProjects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => selectProject(project.id)}
                className="flex items-center justify-between"
              >
                <span className="truncate">{project.name}</span>
                {project.id === activeProjectId && (
                  <span className="ml-2 text-primary text-xs">Activo</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setProjectDialogMode("create");
                setProjectDialogOpen(true);
              }}
            >
              <PlusIcon className="mr-2 size-4" />
              Nuevo proyecto
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setProjectDialogMode("list");
                setProjectDialogOpen(true);
              }}
            >
              <FolderKanbanIcon className="mr-2 size-4" />
              Administrar proyectos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          title="Nuevo proyecto"
          onClick={() => {
            setProjectDialogMode("create");
            setProjectDialogOpen(true);
          }}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      {/* Barra de Archivos */}
      <div className="flex h-9 items-center justify-between border-sidebar-border border-b px-3">
        <div className="flex items-center gap-2">
          <FolderIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-xs">Archivos</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title="Descargar proyecto (.zip)"
            onClick={handleExportCurrentZip}
          >
            <DownloadIcon className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Agregar"
              >
                <PlusIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openNewFileDialog()}>
                <FileTextIcon className="mr-2 size-4" />
                Nuevo archivo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <UploadIcon className="mr-2 size-4" />
                Subir archivos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
                <FolderInputIcon className="mr-2 size-4" />
                Subir carpeta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => zipInputRef.current?.click()}>
                <FolderArchiveIcon className="mr-2 size-4" />
                Importar archivo .zip
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportCurrentZip}>
                <DownloadIcon className="mr-2 size-4" />
                Exportar proyecto (.zip)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".tex,.bib,.sty,.cls,.bst,.txt,.md,.csv,.json,.pdf,.eps,image/*"
        multiple
        onChange={(e) => {
          handleFileUpload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        multiple
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          handleFolderUpload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={zipInputRef}
        type="file"
        className="hidden"
        accept=".zip"
        onChange={(e) => {
          handleZipUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Árbol de archivos y carpetas */}
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {isDragging && (
          <div className="mb-2 flex items-center justify-center rounded-md border-2 border-primary border-dashed p-3 text-center">
            <span className="text-muted-foreground text-xs">
              Suelta archivos, carpetas o .zip aquí
            </span>
          </div>
        )}
        {renderTreeNodes(fileTree)}
      </div>

      {/* Esquema */}
      <div className="flex h-9 items-center gap-2 border-sidebar-border border-t px-3">
        <ListIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-xs">Esquema</span>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {toc.length > 0 ? (
          toc.map((item, index) => (
            <button
              key={index}
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-sidebar-accent/50"
              style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
              onClick={() => handleTocClick(item.line)}
            >
              <HashIcon className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{item.title}</span>
            </button>
          ))
        ) : (
          <div className="px-2 py-1 text-muted-foreground text-xs">
            No se encontraron secciones
          </div>
        )}
      </div>

      {/* Pie de barra lateral */}
      <div className="flex items-center justify-between border-sidebar-border border-t px-3 py-2 text-muted-foreground text-xs">
        <span>OpenPrism v{packageJson.version}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-6" asChild>
            <a
              href="https://github.com/alexhuberth/open-prism"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub"
            >
              <GithubIcon className="size-3.5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => {
              if (theme === "system") setTheme("light");
              else if (theme === "light") setTheme("dark");
              else setTheme("system");
            }}
            title={
              theme === "system"
                ? "Tema del sistema"
                : theme === "light"
                  ? "Modo claro"
                  : "Modo oscuro"
            }
          >
            {theme === "system" ? (
              <MonitorIcon className="size-3.5" />
            ) : theme === "light" ? (
              <SunIcon className="size-3.5" />
            ) : (
              <MoonIcon className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Diálogo nuevo archivo */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo archivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Input
              placeholder="Ej. capitulo1.tex, secciones/intro.tex o referencias.bib"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddFile();
              }}
            />
            <p className="text-muted-foreground text-xs">
              Puedes usar barras (/) para crear subcarpetas automáticamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddFile}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo renombrar */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renombrar o mover archivo</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleRename}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectManagerDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        initialMode={projectDialogMode}
      />
    </div>
  );
}
