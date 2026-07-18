import { FileText, Folder, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Note } from "@shared/schema";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { PDFDownloadButton } from "@/components/pdf-download-button";

interface FileExplorerProps {
  notes: Note[];
  emptyFolders?: string[];
  activeNoteId: string | null;
  onNoteSelect: (noteId: string) => void;
  onCreateNote: (path?: string, filename?: string) => void;
  onMoveNote: (noteId: string, newPath: string) => void;
  creatingFile: boolean;
  newFileName: string;
  newFilePath: string;
  setNewFileName: (name: string) => void;
  handleNewFileCancel: () => void;
  onCreateFolder: (parentPath: string, folderName: string) => void;
  onMoveFolder: (sourcePath: string, destPath: string) => void;
  onDeleteFolder: (path: string) => void;
  onRenameNote: (noteId: string, newName: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDuplicateNote: (note: Note) => void;
  isMovingFolder: boolean;
  isCreatingFolder: boolean;
  activeNote?: Note;
  readOnly?: boolean;
}

function getFileIcon() {
  return <FileText className="h-4 w-4 mr-2 text-blue-400" />;
}

// Add a helper to build a folder tree from notes
function buildFolderTree(notes: Note[], emptyFolders: string[] = []) {
  const root: { name: string; path: string; folders: Record<string, any>; files: Note[] } = { name: '/', path: '/', folders: {}, files: [] };
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

// Drag and drop item types
const ItemTypes = {
  FOLDER: 'folder',
  FILE: 'file'
};

// Draggable folder component
function DraggableFolder({ node, ...props }: { node: any; [key: string]: any }) {
  const [expanded, setExpanded] = useState(true);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Set up drag source
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.FOLDER,
    item: { type: ItemTypes.FOLDER, path: node.path },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    }),
    canDrag: () => !props.readOnly && node.path !== '/' && !props.isMovingFolder && !props.isCreatingFolder
  }));

  // Set up drop target
  const [{ isOver }, drop] = useDrop(() => ({
    accept: [ItemTypes.FOLDER, ItemTypes.FILE],
    drop: (item: any) => {
      if (props.isMovingFolder || props.isCreatingFolder) return;
      
      if (item.type === ItemTypes.FOLDER) {
        if (item.path !== node.path && !node.path.startsWith(item.path)) {
          props.onMoveFolder(item.path, node.path);
        }
      } else if (item.type === ItemTypes.FILE) {
        if (item.currentPath !== node.path) {
          props.onMoveNote(item.noteId, node.path);
        }
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver()
    }),
    canDrop: () => !props.readOnly && !props.isMovingFolder && !props.isCreatingFolder
  }));

  // Combine drag and drop refs
  const ref = (el: any) => {
    drag(el);
    drop(el);
  };

  // Cancel folder creation on click outside
  useEffect(() => {
    if (!creatingFolder) return;
    function handleClick(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setNewFolderName("");
        setCreatingFolder(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [creatingFolder]);

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      props.onCreateFolder(node.path, newFolderName);
      setCreatingFolder(false);
      setNewFolderName('');
    }
  };

  return (
    <div className="ml-2">
      <div
        ref={ref}
        className={`group flex items-center gap-1 ${isDragging ? 'opacity-50' : ''} ${isOver ? 'bg-accent/30' : ''} ${props.isMovingFolder || props.isCreatingFolder ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{ cursor: node.path === '/' || props.isMovingFolder || props.isCreatingFolder ? 'default' : 'move' }}
      >
        <button
          type="button"
          className="flex min-h-9 min-w-0 flex-1 items-center rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded(x => !x)}
          aria-expanded={expanded}
        >
          <Folder className="mr-1 h-3 w-3 flex-shrink-0 text-yellow-500" />
          <span className="truncate text-sm font-medium text-[hsl(var(--obsidian-text-muted))]">{node.name}</span>
        </button>
        {!props.readOnly && (
          <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-9 w-9 p-0"
              onClick={() => setCreatingFolder(true)}
              disabled={props.isMovingFolder || props.isCreatingFolder}
              aria-label={`Create folder in ${node.name}`}
            >
              <Plus className="h-3 w-3 text-gray-400" />
            </Button>
            {node.path !== '/' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0"
                    disabled={props.isMovingFolder || props.isCreatingFolder}
                    aria-label={`More actions for ${node.name}`}
                  >
                    <MoreHorizontal className="h-3 w-3 text-gray-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {Array.from(new Set(["/", ...(props.emptyFolders || []), ...props.notes.map((note: Note) => note.path.replace(/\/$/, "") || "/")]))
                        .filter((path) => path === "/" || (path !== node.path && !path.startsWith(`${node.path}/`)))
                        .map((path) => <DropdownMenuItem key={path} onClick={() => props.onMoveFolder(node.path, path)}>{path === "/" ? "Main path" : path}</DropdownMenuItem>)}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem 
                    onClick={e => { 
                      e.stopPropagation(); 
                      props.onDeleteFolder(node.path);
                    }}
                    className="text-red-400"
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
      {creatingFolder && (
        <input
          ref={inputRef}
          className="w-full mb-1 p-1 rounded bg-gray-800 text-white border border-gray-600 text-sm"
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleCreateFolder();
            }
            if (e.key === 'Escape') {
              setNewFolderName("");
              setCreatingFolder(false);
            }
          }}
          onBlur={() => {
            setNewFolderName("");
            setCreatingFolder(false);
          }}
          placeholder="Enter folder name..."
          autoFocus
          disabled={props.isMovingFolder || props.isCreatingFolder}
        />
      )}
      {expanded && (
        <div className="ml-2">
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Use the latest content for the active note if available
  const latestContent = props.activeNoteId === note.id && props.activeNote && props.activeNote.content !== undefined
    ? props.activeNote.content
    : note.content;

  // Set up drag source
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.FILE,
    item: { 
      type: ItemTypes.FILE, 
      noteId: note.id,
      currentPath: note.path
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    }),
    canDrag: () => !props.readOnly && !props.isMovingFolder && !props.isCreatingFolder
  }));

  return (
    <div
      ref={drag}
      className={`file-item group flex items-center ${props.activeNoteId === note.id ? 'active' : ''} ${isDragging ? 'opacity-50' : ''} ${props.isMovingFolder || props.isCreatingFolder ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={() => props.onNoteSelect(note.id)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onNoteSelect(note.id); } }}
      tabIndex={0}
      role="button"
      aria-label={`Open ${note.filename}`}
      style={{ cursor: props.isMovingFolder || props.isCreatingFolder ? 'not-allowed' : 'move' }}
    >
      {getFileIcon()}
      {renamingId === note.id ? (
        <input
          className="w-32 p-1 rounded bg-gray-800 text-white border border-gray-600 mr-2"
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
      {note.status && note.status !== "clean" && <span className={`mx-1 h-2 w-2 flex-shrink-0 rounded-full ${note.status === "added" ? "bg-emerald-400" : note.status === "deleted" ? "bg-red-400" : "bg-amber-400"}`} title={`${note.status} change`} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`ml-1 h-9 w-9 rounded p-1 hover:bg-gray-700 transition-opacity ${props.activeNoteId === note.id ? 'opacity-100' : 'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'}`}
            disabled={props.isMovingFolder || props.isCreatingFolder}
            aria-label={`More actions for ${note.filename}`}
          >
            <MoreHorizontal className="h-4 w-4 text-gray-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild>
            <PDFDownloadButton
              markdown={latestContent}
              title={note.filename.replace('.md', '')}
              className="w-full justify-start cursor-pointer"
            />
          </DropdownMenuItem>
          {!props.readOnly && (
            <>
              <DropdownMenuItem 
                onClick={e => { 
                  e.stopPropagation(); 
                  setRenamingId(note.id); 
                  setRenameValue(note.filename); 
                }}
                disabled={props.isMovingFolder || props.isCreatingFolder}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={e => { 
                  e.stopPropagation(); 
                  props.onDuplicateNote(note); 
                }}
                disabled={props.isMovingFolder || props.isCreatingFolder}
              >
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {Array.from(new Set(["/", ...(props.emptyFolders || []), ...props.notes.map((candidate: Note) => candidate.path.replace(/\/$/, "") || "/")]))
                    .filter((path) => (path === "/" ? "/" : `${path}/`) !== note.path)
                    .map((path) => <DropdownMenuItem key={path} onClick={() => props.onMoveNote(note.id, path)}>{path === "/" ? "Main path" : path}</DropdownMenuItem>)}
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
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function FileExplorer({ notes, emptyFolders, activeNoteId, onNoteSelect, onCreateNote, onMoveNote, creatingFile, newFileName, newFilePath, setNewFileName, handleNewFileCancel, onCreateFolder, onMoveFolder, onDeleteFolder, onRenameNote, onDeleteNote, onDuplicateNote, isMovingFolder, isCreatingFolder, activeNote, readOnly }: FileExplorerProps) {
  const { toast } = useToast();
  const folderTree = buildFolderTree(notes, emptyFolders);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-2 relative">
        {creatingFile && (
          <input
            autoFocus
            className="w-full mb-2 p-1 rounded bg-gray-800 text-white border border-gray-600 text-sm"
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                let filename = newFileName.trim();
                if (filename && !filename.includes('.')) filename += '.md';
                if (filename) {
                  if (hasDuplicateFilename(notes, newFilePath, filename)) {
                    toast({
                      title: "Error",
                      description: "A file with this name already exists in this folder",
                      variant: "destructive",
                    });
                    return;
                  }
                  onCreateNote(newFilePath, filename);
                }
                setNewFileName("");
                handleNewFileCancel();
              }
              if (e.key === "Escape") {
                setNewFileName("");
                handleNewFileCancel();
              }
            }}
            onBlur={() => {
              setNewFileName("");
              handleNewFileCancel();
            }}
            placeholder="Enter file name..."
          />
        )}
        {folderTree.files.length > 0 && (
          <div className="space-y-1">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Main path</p>
            {folderTree.files.map((note: Note) => <DraggableFile key={note.id} note={note} {...{ notes, emptyFolders, activeNoteId, onNoteSelect, onMoveNote, onRenameNote, onDeleteNote, onDuplicateNote, isMovingFolder, isCreatingFolder, activeNote, readOnly }} />)}
          </div>
        )}
        {Object.values(folderTree.folders).map((folder: any) => <DraggableFolder
          key={folder.path}
          node={folder}
          {...{ 
            notes,
            emptyFolders,
            activeNoteId, 
            onNoteSelect, 
            onCreateNote: (path: string, filename?: string) => {
              if (filename) {
                if (hasDuplicateFilename(notes, path, filename)) {
                  toast({
                    title: "Error",
                    description: "A file with this name already exists in this folder",
                    variant: "destructive",
                  });
                  return;
                }
                onCreateNote(path, filename);
              } else {
                onCreateNote(path);
              }
            },
            onMoveNote: (noteId: string, newPath: string) => {
              const note = notes.find(n => n.id === noteId);
              if (note && hasDuplicateFilename(notes, newPath, note.filename, noteId)) {
                toast({
                  title: "Error",
                  description: "A file with this name already exists in the destination folder",
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
            handleNewFileCancel, 
            onCreateFolder, 
            onMoveFolder, 
            onRenameNote, 
            onDeleteNote, 
            onDuplicateNote, 
            isMovingFolder, 
            isCreatingFolder,
            activeNote,
            readOnly
          }}
        />)}
      </div>
    </DndProvider>
  );
}
