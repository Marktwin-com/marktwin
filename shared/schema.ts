// Marktwin has no server-side database. These types describe the shapes the
// client builds locally (from a saved repo + GitHub token) and passes between
// components — there is no backing table.

export interface Vault {
  id: number;
  name: string;
  urlSlug: string;
  githubRepo: string | null;
  lastSyncAt: Date | null;
  createdAt: Date | null;
}

export interface Note {
  id: string;
  vaultId: number;
  filename: string;
  path: string;
  content: string;
  githubSha?: string;
  originalPath?: string;
  status?: "clean" | "added" | "modified" | "deleted";
}

export type PeerRole = "owner" | "edit" | "view";
export type SessionState = "stopped" | "starting" | "waiting" | "connected" | "reconnecting" | "offline" | "syncing" | "conflict";
export interface PeerIdentity { sessionId: string; displayName: string; color: string; role: PeerRole; viewingFileId?: string; viewingFilePath?: string; }
export interface DiscussionAnchor { fileId: string; filePath: string; heading?: string; }
export interface ChatMessage { id: string; sessionId: string; username: string; message: string; timestamp: number; color: string; anchor?: DiscussionAnchor; }
export interface OwnerControlMessage {
  type: "workspace-control";
  selectedScopes: string[];
  selectedFileTypes?: Array<"markdown" | "canvas" | "drawing" | "image" | "asset">;
  syncing: boolean;
  workspaceName: string;
  revision: number;
}
export interface WorkspaceChange { id: string; kind: "added" | "modified" | "deleted" | "moved"; path: string; originalPath?: string; fileId?: string; contentBefore?: string; contentAfter?: string; }
export type WorkspaceActivityCode =
  | "file.created"
  | "folder.created"
  | "folder.moved"
  | "decision.captured"
  | "file.moved"
  | "file.renamed"
  | "file.deleted"
  | "folder.contents_deleted";

export interface WorkspaceActivity {
  id: string;
  actor: PeerIdentity;
  /** Legacy display text. New records use operationCode and are translated at render time. */
  operation?: string;
  operationCode?: WorkspaceActivityCode;
  params?: {
    fileType?: "markdown" | "canvas" | "drawing" | "image" | "asset";
    sourcePath?: string;
    targetPath?: string;
  };
  fileId?: string;
  path?: string;
  timestamp: number;
}
export interface CapturedDecision { id: string; sourceMessageId: string; summary: string; targetFileId: string; targetPath: string; capturedBy: PeerIdentity; timestamp: number; }

export type DecisionStatus = "decided" | "implemented" | "revisit";
export interface DecisionRecord {
  id: string;
  status: DecisionStatus;
  summary: string;
  sourceMessageId?: string;
  sourceDisplayName?: string;
  capturedAt?: number;
  relatedArtifacts: Array<{ id?: string; path: string; label?: string }>;
  rationale?: string;
  risks?: string;
}
export interface ArtifactRef { id?: string; path: string; fileType: "markdown" | "canvas" | "drawing" | "image" | "asset"; label?: string; }
export interface ArtifactRelation { source: ArtifactRef; target: ArtifactRef; kind: "references" | "backlink" | "decision"; broken?: boolean; }
export interface SearchResult { id: string; kind: "command" | "file" | "heading" | "canvas-card" | "decision"; title: string; path?: string; excerpt?: string; fileId?: string; line?: number; decisionId?: string; }
export interface WorkingSetItem extends ArtifactRef { addedAt: number; }
