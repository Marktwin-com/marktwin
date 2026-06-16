import { FileText, Folder, MoreHorizontal, Plus, FolderPlus, Image, FileType } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Note } from "@shared/schema";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { PDFDownloadButton } from "@/components/pdf-download-button";
import { useFont } from "@/contexts/font-context";

interface FileExplorerProps {
  notes: Note[];
  activeNoteId: number | null;
  onNoteSelect: (noteId: number) => void;
  onCreateNote: (path?: string, filename?: string) => void;
  onMoveNote: (noteId: number, newPath: string) => void;
  creatingFile: boolean;
  newFileName: string;
  setNewFileName: (name: string) => void;
  handleNewFileSubmit: () => void;
  handleNewFileCancel: () => void;
  onCreateFolder: (parentPath: string, folderName: string) => void;
  onMoveFolder: (sourcePath: string, destPath: string) => void;
  onDeleteFolder: (path: string) => void;
  vaultSlug?: string;
  onRefresh?: () => void;
  onRenameNote: (noteId: number, newName: string) => void;
  onDeleteNote: (noteId: number) => void;
  onDuplicateNote: (note: Note) => void;
  isMovingFolder: boolean;
  isCreatingFolder: boolean;
  activeNote?: Note;
  readOnly?: boolean;
}

function getFileIcon(note: Note) {
  const fileType = note.fileType || 'markdown';
  const isActive = false; // We'll pass this separately
  
  switch (fileType) {
    case 'pdf':
      return <FileType className="h-4 w-4 mr-2 text-red-400" />;
    case 'image':
      return <Image className="h-4 w-4 mr-2 text-green-400" />;
    case 'markdown':
    default:
      return <FileText className="h-4 w-4 mr-2 text-blue-400" />;
  }
}

// Add a helper to build a folder tree from notes
function buildFolderTree(notes: Note[]) {
  const root: { name: string; path: string; folders: Record<string, any>; files: Note[] } = { name: '/', path: '/', folders: {}, files: [] };
  for (const note of notes) {
    const parts = note.path.split('/').filter(Boolean);
    let current = root;
    for (const part of parts) {
      if (!current.folders[part]) {
        const folderPath = (current.path === '/' ? '' : current.path) + '/' + part;
        current.folders[part] = { name: part, path: folderPath, folders: {}, files: [] };
      }
      current = current.folders[part];
    }
    current.files.push(note);
  }
  return root;
}

// Helper function to check for duplicate filenames in a path
function hasDuplicateFilename(notes: Note[], path: string, filename: string, excludeNoteId?: number): boolean {
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
        className={`flex items-center gap-1 ${isDragging ? 'opacity-50' : ''} ${isOver ? 'bg-accent/30' : ''} ${props.isMovingFolder || props.isCreatingFolder ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{ cursor: node.path === '/' || props.isMovingFolder || props.isCreatingFolder ? 'default' : 'move' }}
      >
        <Folder 
          className="h-3 w-3 text-yellow-500 flex-shrink-0" 
          onClick={() => setExpanded(x => !x)} 
        />
        <span 
          className="text-sm cursor-pointer font-medium truncate flex-1 text-[hsl(var(--obsidian-text-muted))]"
          onClick={() => setExpanded(x => !x)}
        >
          {node.name}
        </span>
        {!props.readOnly && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            <Button 
              size="sm" 
              variant="ghost" 
              className="p-0 h-4 w-4" 
              onClick={() => setCreatingFolder(true)}
              disabled={props.isMovingFolder || props.isCreatingFolder}
            >
              <Plus className="h-3 w-3 text-gray-400" />
            </Button>
            {node.path !== '/' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="p-0 h-4 w-4"
                    disabled={props.isMovingFolder || props.isCreatingFolder}
                  >
                    <MoreHorizontal className="h-3 w-3 text-gray-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem 
                    onClick={e => { 
                      e.stopPropagation(); 
                      if (confirm(`Are you sure you want to delete the folder "${node.path}" and all its contents?`)) {
                        props.onDeleteFolder(node.path);
                      }
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
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { font } = useFont();
  const fontMap: Record<string, string> = {
    Inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    Merriweather: "'Merriweather', Georgia, serif",
    Poppins: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
    'Roboto Slab': "'Roboto Slab', Georgia, serif",
  };
  const fontFamily = fontMap[font] || fontMap['Inter'];

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
      style={{ cursor: props.isMovingFolder || props.isCreatingFolder ? 'not-allowed' : 'move' }}
    >
      {getFileIcon(note)}
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`ml-1 p-1 rounded hover:bg-gray-700 transition-opacity ${props.activeNoteId === note.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            tabIndex={-1}
            disabled={props.isMovingFolder || props.isCreatingFolder}
          >
            <MoreHorizontal className="h-4 w-4 text-gray-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {note.fileType === 'markdown' && (
            <DropdownMenuItem asChild>
              <PDFDownloadButton
                markdown={latestContent}
                title={note.filename.replace('.md', '')}
                className="w-full justify-start cursor-pointer"
                fontFamily={fontFamily}
              />
            </DropdownMenuItem>
          )}
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

export default function FileExplorer({ notes, activeNoteId, onNoteSelect, onCreateNote, onMoveNote, creatingFile, newFileName, setNewFileName, handleNewFileSubmit, handleNewFileCancel, onCreateFolder, onMoveFolder, onDeleteFolder, vaultSlug, onRefresh, onRenameNote, onDeleteNote, onDuplicateNote, isMovingFolder, isCreatingFolder, activeNote, readOnly }: FileExplorerProps) {
  const { toast } = useToast();
  const folderTree = buildFolderTree(notes);

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
                  if (hasDuplicateFilename(notes, "/", filename)) {
                    toast({
                      title: "Error",
                      description: "A file with this name already exists in this folder",
                      variant: "destructive",
                    });
                    return;
                  }
                  onCreateNote("/", filename);
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
        <DraggableFolder 
          node={folderTree} 
          {...{ 
            notes, 
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
            onMoveNote: (noteId: number, newPath: string) => {
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
            setNewFileName, 
            handleNewFileSubmit, 
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
        />
      </div>
    </DndProvider>
  );
}
