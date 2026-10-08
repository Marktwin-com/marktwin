import { Columns2, FileArchive, FileImage, FilePlus, FileText, Folder, FolderPlus, LayoutDashboard, MoreHorizontal, PenTool, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fullNotePath, type WorkspaceNote as Note } from "@/lib/cabinet-files";
import { useEffect, useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import type { WorkspaceFileType } from "@/lib/workspace-github";
import { fileTypeExtension } from "@/lib/workspace-formats";
import { normalizeTextFilename } from "@/lib/text-files";
import type { MessageValues } from "@/lib/i18n";
import { beginWorkspaceFileDrag, currentWorkspaceFileDrag, currentWorkspaceFolderDrop, endWorkspaceFileDrag, setWorkspaceFolderDrop, WORKSPACE_FILE_DRAG_TYPES, type WorkspaceFileDragPayload } from "@/lib/workspace-drag";
import { useI18n } from "@/contexts/i18n-context";
import { isFiguresFolderPath } from "@/lib/workspace-images";

interface FileExplorerProps {
  notes: Note[];
  emptyFolders?: string[];
  activeNoteId: string | null;
  onNoteSelect: (noteId: string) => void;
  onCreateFile: (path: string, fileType: WorkspaceFileType, filename?: string) => void;
  enabledFileTypes: WorkspaceFileType[];
  defaultCreatePath: string;
  onCreatePathSelect: (path: string) => void;
  onManageFileTypes: () => void;
  onMoveNote: (noteId: string, newPath: string) => void;
  creatingFile: boolean;
  newFileName: string;
  newFilePath: string;
  creatingFileType: WorkspaceFileType;
  setNewFileName: (name: string) => void;
  setNewFilePath: (path: string) => void;
  creationPaths: string[];
  handleNewFileCancel: () => void;
  onCreateFolder: (parentPath: string, folderName: string) => void;
  onMoveFolder: (sourcePath: string, destPath: string) => void;
  onDeleteFolder: (path: string) => void;
  onRenameNote: (noteId: string, newName: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDuplicateNote: (note: Note) => void;
  onOpenBeside?: (note: Note) => void;
  isFavorite?: (note: Note) => boolean;
  onToggleFavorite?: (note: Note) => void;
  isMovingFolder: boolean;
  isCreatingFolder: boolean;
  activeNote?: Note;
  readOnly?: boolean;
  showFiguresFolder?: boolean;
}

const workspaceFileTypes: WorkspaceFileType[] = ["markdown", "canvas", "drawing"];

function filenameForCreation(value: string, fileType: WorkspaceFileType) {
  const filename = value.trim();
  if (fileType === "markdown") return normalizeTextFilename(filename);
  return filename && !/\.[^./]+$/.test(filename) ? `${filename}${fileTypeExtension(fileType)}` : filename;
}

function getFileStatusLabelKey(status: "added" | "deleted" | "modified" | string) {
  return status === "added" ? "workspace.fileAdded" : status === "deleted" ? "workspace.fileDeleted" : "workspace.fileModified";
}

function CreateMenuItems({ enabledFileTypes, onCreate, onManageFileTypes }: {
  enabledFileTypes: WorkspaceFileType[];
  onCreate: (fileType: WorkspaceFileType) => void;
  onManageFileTypes: () => void;
}) {
  const { t } = useI18n();
  return <>
    <DropdownMenuLabel>{t("workspace.create")}</DropdownMenuLabel>
    <DropdownMenuSeparator />
    {workspaceFileTypes.map((fileType) => {
      const enabled = enabledFileTypes.includes(fileType);
      const label = fileType === "markdown" ? t("repo.markdown") : fileType === "canvas" ? t("repo.canvas") : t("repo.drawing");
      return <DropdownMenuItem
        key={fileType}
        onSelect={() => enabled ? onCreate(fileType) : onManageFileTypes()}
        className={!enabled ? "text-muted-foreground" : undefined}
      >
        {fileType === "canvas" ? <LayoutDashboard className="mr-2 h-4 w-4 text-violet-400" /> : fileType === "drawing" ? <PenTool className="mr-2 h-4 w-4 text-amber-400" /> : <FilePlus className="mr-2 h-4 w-4 text-blue-400" />}
        <span className="flex-1">{enabled ? t("workspace.newFile", { fileType: label }) : t("workspace.enableInSettings", { fileType: label })}</span>
      </DropdownMenuItem>;
    })}
  </>;
}

function getFileIcon(note: Note) {
  if (note.fileType === "image") return <FileImage className="mr-2 h-4 w-4 text-emerald-400" />;
  if (note.fileType === "asset") return <FileArchive className="mr-2 h-4 w-4 text-emerald-400" />;
  if (note.fileType === "canvas") return <LayoutDashboard className="mr-2 h-4 w-4 text-violet-400" />;
  if (note.fileType === "drawing") return <PenTool className="mr-2 h-4 w-4 text-amber-400" />;
  return <FileText className="mr-2 h-4 w-4 text-blue-400" />;
}

function getFileTypeIcon(fileType: WorkspaceFileType) {
  if (fileType === "image") return <FileImage className="mr-2 h-4 w-4 flex-none text-emerald-400" />;
  if (fileType === "asset") return <FileArchive className="mr-2 h-4 w-4 flex-none text-emerald-400" />;
  if (fileType === "canvas") return <LayoutDashboard className="mr-2 h-4 w-4 flex-none text-violet-400" />;
  if (fileType === "drawing") return <PenTool className="mr-2 h-4 w-4 flex-none text-amber-400" />;
  return <FileText className="mr-2 h-4 w-4 flex-none text-blue-400" />;
}

function fileTypeLabel(t: (key: string, values?: MessageValues) => string, fileType: WorkspaceFileType) {
  return fileType === "markdown" ? t("repo.markdown") : fileType === "canvas" ? t("repo.canvas") : fileType === "drawing" ? t("repo.drawing") : fileType === "asset" ? t("repo.asset") : t("repo.image");
}

function InlineFileCreationRow({
  id,
  fileType,
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  id: string;
  fileType: WorkspaceFileType;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const label = fileTypeLabel(t, fileType);
  return (
    <form
      className="file-item group flex items-center"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next && event.currentTarget.contains(next)) return;
        onCancel();
      }}
      aria-label={t("workspace.newFile", { fileType: label })}
    >
      {getFileTypeIcon(fileType)}
      <input
        id={id}
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder={t("workspace.fileName")}
        aria-label={t("workspace.fileName")}
        className="min-w-0 flex-1 border-0 border-b border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] px-1 py-1 text-sm text-[hsl(var(--obsidian-text))] outline-hidden placeholder:text-[hsl(var(--obsidian-text-muted))] focus:border-[hsl(var(--obsidian-accent))]"
      />
    </form>
  );
}

// Add a helper to build a folder tree from notes
function buildFolderTree(notes: Note[], emptyFolders: string[] = []) {
  const root: { name: string; path: string; folders: Record<string, any>; files: Note[] } = { name: '/', path: '/', folders: {}, files: [] };
  const seenPaths = new Set<string>();
  const ensureFolder = (folderPath: string) => {
    const parts = folderPath.split('/').filter(Boolean);
    let current = root;
    for (const part of parts) {
      if (!current.folders[part]) {
        const path = current.path === '/' ? part : `${current.path}/${part}`;
        current.folders[part] = { name: part, path, folders: {}, files: [] };
      }
      current = current.folders[part];
    }
  };
  emptyFolders.forEach(ensureFolder);
  for (const note of notes) {
    const logicalPath = fullNotePath(note).toLocaleLowerCase("en-US");
    if (seenPaths.has(logicalPath)) continue;
    seenPaths.add(logicalPath);
    const parts = note.path.split('/').filter(Boolean);
    let current = root;
    for (const part of parts) {
      if (!current.folders[part]) {
        const folderPath = current.path === '/' ? part : `${current.path}/${part}`;
        current.folders[part] = { name: part, path: folderPath, folders: {}, files: [] };
      }
      current = current.folders[part];
    }
    current.files.push(note);
  }
  return root;
}

// Helper function to check for duplicate filenames in a path
function hasDuplicateFilename(notes: Note[], path: string, filename: string, excludeNoteId?: string): boolean {
  return notes.some(note =>
    note.path === path &&
    note.filename === filename &&
    note.id !== excludeNoteId
  );
}

const WORKSPACE_FOLDER_DRAG_TYPE = "application/x-marktwin-workspace-folder";

// Draggable folder component
function DraggableFolder({ node, ...props }: { node: any; [key: string]: any }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingFileHere, setCreatingFileHere] = useState(false);
  const [creatingFileTypeHere, setCreatingFileTypeHere] = useState<WorkspaceFileType>("markdown");
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileNameHere, setNewFileNameHere] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const preserveCreationFocusRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const dragDisabled = props.readOnly || node.path === "/" || props.isMovingFolder || props.isCreatingFolder;

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      props.onCreateFolder(node.path, newFolderName);
      setCreatingFolder(false);
      setNewFolderName('');
    }
  };

  const createPath = node.path === "/" ? "/" : `${node.path.replace(/\/+$/, "")}/`;
  const isCreateTarget = props.defaultCreatePath === createPath;
  const isGlobalCreateTarget = props.creatingFile && props.newFilePath === createPath;

  useEffect(() => {
    if (isGlobalCreateTarget) setExpanded(true);
  }, [isGlobalCreateTarget]);

  const cancelLocalFileCreation = () => {
    setNewFileNameHere("");
    setCreatingFileHere(false);
  };

  const submitLocalFileCreation = () => {
    const filename = filenameForCreation(newFileNameHere, creatingFileTypeHere);
    if (!filename) return;
    props.onCreateFile(node.path, creatingFileTypeHere, filename);
    cancelLocalFileCreation();
  };

  return (
    <div>
      <div
        draggable={!dragDisabled}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData(WORKSPACE_FOLDER_DRAG_TYPE, JSON.stringify({ path: node.path }));
          event.dataTransfer.effectAllowed = "move";
          setIsDragging(true);
        }}
        onDragEnd={(event) => { event.stopPropagation(); setIsDragging(false); setIsOver(false); }}
        onDragEnter={(event) => {
          event.stopPropagation();
          if (props.readOnly || props.isMovingFolder || props.isCreatingFolder) return;
          setIsOver(true);
          if (currentWorkspaceFileDrag()) setWorkspaceFolderDrop(node.path);
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsOver(false);
            setWorkspaceFolderDrop(null);
          }
        }}
        onDragOver={(event) => {
          event.stopPropagation();
          const supported = currentWorkspaceFileDrag()
            || WORKSPACE_FILE_DRAG_TYPES.some((type) => Array.from(event.dataTransfer.types).includes(type))
            || Array.from(event.dataTransfer.types).includes(WORKSPACE_FOLDER_DRAG_TYPE);
          if (!props.readOnly && supported) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOver(false);
          const folderData = event.dataTransfer.getData(WORKSPACE_FOLDER_DRAG_TYPE);
          if (folderData) {
            try {
              const sourcePath = (JSON.parse(folderData) as { path?: string }).path;
              if (sourcePath && sourcePath !== node.path && !node.path.startsWith(`${sourcePath}/`)) props.onMoveFolder(sourcePath, node.path);
            } catch {
              // Ignore malformed drags.
            }
            return;
          }
          const dragType = WORKSPACE_FILE_DRAG_TYPES.find((type) => Array.from(event.dataTransfer.types).includes(type));
          let payload = currentWorkspaceFileDrag();
          try {
            if (!payload && dragType) payload = JSON.parse(event.dataTransfer.getData(dragType)) as WorkspaceFileDragPayload;
          } catch {
            return;
          }
          if (!payload || props.readOnly) return;
          const movingFile = props.notes.find((candidate: Note) => candidate.id === payload.noteId);
          if (movingFile && movingFile.path !== createPath) props.onMoveNote(payload.noteId, node.path);
          setWorkspaceFolderDrop(null);
        }}
        className={`workspace-tree-row group flex h-9 items-center rounded transition-colors ${isCreateTarget ? "border-l border-[hsl(var(--obsidian-accent))] bg-[hsl(var(--obsidian-accent)/0.2)]" : ""} ${isDragging ? 'opacity-50' : ''} ${isOver ? 'bg-accent/30' : ''} ${props.isMovingFolder || props.isCreatingFolder ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{ cursor: node.path === '/' || props.isMovingFolder || props.isCreatingFolder ? 'default' : 'move' }}
      >
        <button
          type="button"
          className="workspace-touch-control flex h-9 w-8 flex-shrink-0 items-center justify-center rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded((current) => !current)}
          aria-label={`${expanded ? t("workspace.collapse") : t("workspace.expand")} ${node.name}`}
          aria-expanded={expanded}
          title={`${expanded ? t("workspace.collapse") : t("workspace.expand")} ${node.name}`}
        >
          <Folder className="h-4 w-4 fill-[hsl(var(--folder-icon))] text-[hsl(var(--folder-icon))]" />
        </button>
        <button
          type="button"
          className="flex h-9 min-w-0 flex-1 items-center rounded text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => props.onCreatePathSelect(createPath)}
          aria-current={isCreateTarget ? "location" : undefined}
          title={isCreateTarget ? t("workspace.destinationForNewItems", { path: node.name }) : t("workspace.useForNewItems", { path: node.name })}
        >
          <span className={`truncate text-sm font-medium ${isCreateTarget ? "text-[hsl(var(--obsidian-text))]" : "text-[hsl(var(--obsidian-text-muted))]"}`}>{node.name}</span>
        </button>
        {!props.readOnly && (
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="workspace-touch-control h-8 w-8 p-0"
                  disabled={props.isMovingFolder || props.isCreatingFolder}
                  aria-label={t("workspace.createIn", { path: createPath })}
                  title={t("workspace.createIn", { path: createPath })}
                >
                  <Plus className="h-4 w-4 text-[hsl(var(--obsidian-text-muted))]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  if (!preserveCreationFocusRef.current) return;
                  event.preventDefault();
                  preserveCreationFocusRef.current = false;
                }}
              >
                <CreateMenuItems
                  enabledFileTypes={props.enabledFileTypes}
                  onManageFileTypes={props.onManageFileTypes}
                  onCreate={(fileType) => {
                    preserveCreationFocusRef.current = true;
                    setExpanded(true);
                    setCreatingFolder(false);
                    setCreatingFileTypeHere(fileType);
                    setCreatingFileHere(true);
                  }}
                />
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => {
                  preserveCreationFocusRef.current = true;
                  setExpanded(true);
                  setCreatingFileHere(false);
                  setCreatingFolder(true);
                }}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  {t("workspace.newFolder")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {node.path !== '/' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="workspace-touch-control h-8 w-8 p-0"
                    disabled={props.isMovingFolder || props.isCreatingFolder}
                    aria-label={`${t("workspace.moreActions")} ${node.name}`}
                    title={`${t("workspace.moreActions")} ${node.name}`}
                  >
                    <MoreHorizontal className="h-4 w-4 text-[hsl(var(--obsidian-text-muted))]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuSub>
                  <DropdownMenuSubTrigger>{t("workspace.moveTo")}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {Array.from(new Set(["/", ...(props.emptyFolders || []), ...props.notes.map((note: Note) => note.path.replace(/\/$/, "") || "/")]))
                        .filter((path) => path === "/" || (path !== node.path && !path.startsWith(`${node.path}/`)))
                    .map((path) => <DropdownMenuItem key={path} onClick={() => props.onMoveFolder(node.path, path)}>{path === "/" ? t("workspace.root") : path}</DropdownMenuItem>)}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    onClick={e => {
                      e.stopPropagation();
                      props.onDeleteFolder(node.path);
                    }}
                    className="text-red-400"
                  >
                    {t("workspace.deleteFolder")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
      {creatingFolder && (
        <form
          className="mb-2 ml-8 space-y-2 rounded-xl border border-[hsl(var(--obsidian-accent)/0.45)] bg-[hsl(var(--obsidian-panel))] p-3 shadow-xs"
          onSubmit={(event) => { event.preventDefault(); handleCreateFolder(); }}
        >
          <label htmlFor={`new-folder-${node.path}`} className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--obsidian-text))]">
            <FolderPlus className="h-4 w-4 text-[hsl(var(--folder-icon))]" />
            {t("workspace.newFolderIn", { name: node.name })}
          </label>
          <input
            id={`new-folder-${node.path}`}
            ref={inputRef}
            className="w-full rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] px-3 py-2 text-sm text-[hsl(var(--obsidian-text))] outline-hidden focus:border-[hsl(var(--obsidian-accent))] focus:ring-2 focus:ring-[hsl(var(--obsidian-accent)/0.2)]"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setNewFolderName("");
                setCreatingFolder(false);
              }
            }}
            placeholder={t("workspace.folderName")}
            autoFocus
            disabled={props.isMovingFolder || props.isCreatingFolder}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => { setNewFolderName(""); setCreatingFolder(false); }}>{t("common.cancel")}</Button>
            <Button type="submit" size="sm" disabled={!newFolderName.trim()}>{t("workspace.createFolder")}</Button>
          </div>
        </form>
      )}
      {expanded && (
        <div className="ml-2">
          {(creatingFileHere || isGlobalCreateTarget) && (
            <InlineFileCreationRow
              id={`new-file-${node.path}`}
              fileType={creatingFileHere ? creatingFileTypeHere : props.creatingFileType}
              value={creatingFileHere ? newFileNameHere : props.newFileName}
              onChange={creatingFileHere ? setNewFileNameHere : props.setNewFileName}
              onSubmit={creatingFileHere ? submitLocalFileCreation : props.onCreateFileSubmit}
              onCancel={creatingFileHere ? cancelLocalFileCreation : props.handleNewFileCancel}
            />
          )}
          {Object.values(node.folders).map((child: any) => (
            <DraggableFolder key={child.path} node={child} {...props} />
          ))}
          {node.files.map((note: Note) => (
            <DraggableFile key={note.id} note={note} {...props} />
          ))}
        </div>
      )}
    </div>
  );
}

// Draggable file component
function DraggableFile({ note, ...props }: { note: Note; [key: string]: any }) {
  const { t } = useI18n();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const dragDisabled = props.readOnly || props.isMovingFolder || props.isCreatingFolder;

  return (
    <div
      draggable={!dragDisabled}
      onDragStart={(event) => {
        event.stopPropagation();
        const dragPayload = { noteId: note.id, path: fullNotePath(note) };
        const payload = JSON.stringify(dragPayload);
        beginWorkspaceFileDrag(dragPayload);
        for (const type of WORKSPACE_FILE_DRAG_TYPES) event.dataTransfer.setData(type, payload);
        event.dataTransfer.effectAllowed = "copyMove";
        setIsDragging(true);
      }}
      onDragEnd={(event) => {
        event.stopPropagation();
        const destination = currentWorkspaceFolderDrop();
        if (destination && note.path !== (destination === "/" ? "/" : `${destination.replace(/\/$/, "")}/`)) props.onMoveNote(note.id, destination);
        setIsDragging(false);
        endWorkspaceFileDrag();
      }}
      className={`file-item group flex items-center ${props.activeNoteId === note.id ? 'active' : ''} ${isDragging ? 'opacity-50' : ''} ${props.isMovingFolder || props.isCreatingFolder ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={() => props.onNoteSelect(note.id)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onNoteSelect(note.id); } }}
      tabIndex={0}
      role="button"
      aria-label={`${t("common.open")} ${note.filename}`}
      style={{ cursor: props.isMovingFolder || props.isCreatingFolder ? 'not-allowed' : 'move' }}
    >
      {getFileIcon(note)}
      {renamingId === note.id ? (
        <input
          className="mr-2 w-32 rounded border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-1 text-[hsl(var(--obsidian-text))]"
          value={renameValue}
          autoFocus
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              props.onRenameNote(note.id, renameValue);
              setRenamingId(null);
            }
            if (e.key === 'Escape') setRenamingId(null);
          }}
          onBlur={() => setRenamingId(null)}
          disabled={props.isMovingFolder || props.isCreatingFolder}
        />
      ) : (
        <span className={`text-sm flex-1 truncate ${props.activeNoteId === note.id ? 'text-[hsl(var(--obsidian-text))]' : 'text-[hsl(var(--obsidian-text-muted))]'}`}>
          {note.filename}
        </span>
      )}
      {note.status && note.status !== "clean" && <span className={`mx-1 h-2 w-2 flex-shrink-0 rounded-full ${note.status === "added" ? "bg-emerald-400" : note.status === "deleted" ? "bg-red-400" : "bg-amber-400"}`} title={t(getFileStatusLabelKey(note.status))} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`workspace-touch-control ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded p-0 hover:bg-[hsl(var(--obsidian-panel-hover))] transition-opacity ${props.activeNoteId === note.id ? 'opacity-100' : 'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            disabled={props.isMovingFolder || props.isCreatingFolder}
            aria-label={`${t("workspace.moreActions")} ${note.filename}`}
          >
            <MoreHorizontal className="h-4 w-4 text-[hsl(var(--obsidian-text-muted))]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
          {props.onOpenBeside && (
            <DropdownMenuItem onSelect={() => props.onOpenBeside?.(note)}>
              <Columns2 className="mr-2 h-4 w-4 text-muted-foreground" />
              {t("workspace.openBeside")}
            </DropdownMenuItem>
          )}
          {!props.readOnly && (
            <>
              {props.onToggleFavorite && (
                <DropdownMenuItem
                  onSelect={() => props.onToggleFavorite?.(note)}
                  disabled={props.isMovingFolder || props.isCreatingFolder}
                >
                  <Star className={`mr-2 h-4 w-4 ${props.isFavorite?.(note) ? "fill-current text-[hsl(var(--obsidian-warning))]" : "text-muted-foreground"}`} />
                  {props.isFavorite?.(note) ? t("workspace.removeCurrent") : t("workspace.addCurrent")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation();
                  setRenamingId(note.id);
                  setRenameValue(note.filename);
                }}
                disabled={props.isMovingFolder || props.isCreatingFolder}
              >
                {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation();
                  props.onDuplicateNote(note);
                }}
                disabled={props.isMovingFolder || props.isCreatingFolder}
              >
                {t("common.duplicate")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{t("workspace.moveTo")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {Array.from(new Set(["/", ...(props.emptyFolders || []), ...props.notes.map((candidate: Note) => candidate.path.replace(/\/$/, "") || "/")]))
                    .filter((path) => (path === "/" ? "/" : `${path}/`) !== note.path)
                    .map((path) => <DropdownMenuItem key={path} onClick={() => props.onMoveNote(note.id, path)}>{path === "/" ? t("workspace.root") : path}</DropdownMenuItem>)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation();
                  props.onDeleteNote(note.id);
                }}
                disabled={props.isMovingFolder || props.isCreatingFolder}
                className="text-red-400"
              >
                {t("common.delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function WorkspaceFileExplorer({ notes, emptyFolders, activeNoteId, onNoteSelect, onCreateFile, enabledFileTypes, defaultCreatePath, onCreatePathSelect, onManageFileTypes, onMoveNote, creatingFile, creatingFileType, newFileName, newFilePath, setNewFileName, setNewFilePath, creationPaths, handleNewFileCancel, onCreateFolder, onMoveFolder, onDeleteFolder, onRenameNote, onDeleteNote, onDuplicateNote, onOpenBeside, isFavorite, onToggleFavorite, isMovingFolder, isCreatingFolder, activeNote, readOnly, showFiguresFolder = false }: FileExplorerProps) {
  const { toast } = useToast();
  const { t } = useI18n();
  const visibleNotes = showFiguresFolder ? notes : notes.filter((note) => !isFiguresFolderPath(note.path) && !isFiguresFolderPath(fullNotePath(note)));
  const availableEmptyFolders = emptyFolders || [];
  const visibleEmptyFolders = showFiguresFolder ? availableEmptyFolders : availableEmptyFolders.filter((path) => !isFiguresFolderPath(path));
  const folderTree = buildFolderTree(visibleNotes, visibleEmptyFolders);

  const submitFileFromMenu = () => {
    const filename = filenameForCreation(newFileName, creatingFileType);
    if (!filename) return;
    if (hasDuplicateFilename(visibleNotes, newFilePath, filename)) {
      toast({
        title: t("workspace.duplicateFileTitle"),
        description: t("workspace.duplicateFileDescription", { filename }),
        variant: "destructive",
      });
      return;
    }
    onCreateFile(newFilePath, creatingFileType, filename);
    setNewFileName("");
    handleNewFileCancel();
  };

  return (
      <div className="relative space-y-0.5">
        {creatingFile && newFilePath === "/" && (
          <InlineFileCreationRow
            id="new-workspace-file-name"
            fileType={creatingFileType}
            value={newFileName}
            onChange={setNewFileName}
            onSubmit={submitFileFromMenu}
            onCancel={() => { setNewFileName(""); handleNewFileCancel(); }}
          />
        )}
        {folderTree.files.length > 0 && (
          <div className="space-y-0.5">
            {folderTree.files.map((note: Note) => <DraggableFile key={note.id} note={note} {...{ notes: visibleNotes, emptyFolders: visibleEmptyFolders, activeNoteId, onNoteSelect, onMoveNote, onRenameNote, onDeleteNote, onDuplicateNote, onOpenBeside, isFavorite, onToggleFavorite, isMovingFolder, isCreatingFolder, activeNote, readOnly }} />)}
          </div>
        )}
        {Object.values(folderTree.folders).map((folder: any) => <DraggableFolder
          key={folder.path}
          node={folder}
          {...{
            notes: visibleNotes,
            emptyFolders: visibleEmptyFolders,
            activeNoteId,
            onNoteSelect,
            onCreateFile: (path: string, fileType: WorkspaceFileType, filename?: string) => {
              if (filename) {
                if (hasDuplicateFilename(visibleNotes, path, filename)) {
                  toast({
                    title: t("errors.generic"),
                    description: t("workspace.duplicateFileDescription", { filename }),
                    variant: "destructive",
                  });
                  return;
                }
                onCreateFile(path, fileType, filename);
              } else {
                onCreateFile(path, fileType);
              }
            },
            enabledFileTypes,
            defaultCreatePath,
            onCreatePathSelect,
            onManageFileTypes,
            onMoveNote: (noteId: string, newPath: string) => {
              const note = visibleNotes.find(n => n.id === noteId);
              if (note && hasDuplicateFilename(visibleNotes, newPath, note.filename, noteId)) {
                toast({
                  title: t("errors.generic"),
                  description: t("workspace.duplicateDestinationDescription", { filename: note.filename }),
                  variant: "destructive",
                });
                return;
              }
              onMoveNote(noteId, newPath);
            },
            creatingFile,
            newFileName,
            newFilePath,
            setNewFileName,
            setNewFilePath,
            creationPaths,
            handleNewFileCancel,
            onCreateFolder,
            onMoveFolder,
            onRenameNote,
            onDeleteNote,
            onDuplicateNote,
            onOpenBeside,
            isFavorite,
            onToggleFavorite,
            isMovingFolder,
            isCreatingFolder,
            onCreateFileSubmit: submitFileFromMenu,
            activeNote,
            readOnly
          }}
        />)}
      </div>
  );
}
