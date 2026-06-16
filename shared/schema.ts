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
  id: number;
  vaultId: number;
  filename: string;
  path: string;
  content: string;
  fileType?: string;
  fileSize?: number | null;
}
