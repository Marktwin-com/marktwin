export const WORKSPACE_FILE_DRAG_TYPES = ["application/x-marktwin-workspace-file", "text/marktwin-workspace-file"] as const;

export interface WorkspaceFileDragPayload {
  noteId: string;
  path: string;
}

let activeWorkspaceFileDrag: WorkspaceFileDragPayload | null = null;
let activeWorkspaceFolderDrop: string | null = null;

export function beginWorkspaceFileDrag(payload: WorkspaceFileDragPayload) {
  activeWorkspaceFileDrag = payload;
}

export function currentWorkspaceFileDrag() {
  return activeWorkspaceFileDrag;
}

export function setWorkspaceFolderDrop(path: string | null) {
  activeWorkspaceFolderDrop = path;
}

export function currentWorkspaceFolderDrop() {
  return activeWorkspaceFolderDrop;
}

export function endWorkspaceFileDrag() {
  activeWorkspaceFileDrag = null;
  activeWorkspaceFolderDrop = null;
}
