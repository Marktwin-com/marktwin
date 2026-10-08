import { normalizeAutoSyncIntervalSeconds, type AutoSyncIntervalSeconds } from "./workspace-sync-preferences";
import { alwaysAvailableWorkspaceFileTypes } from "./workspace-formats";
export interface SavedRepoLocal {
  id: number;
  cabinetNumber: number;
  displayName: string;
  repoFullName: string;
  githubRepositoryId?: string | null;
  githubInstallationId?: string | null;
  defaultBranch: string;
  selectedRootScopes?: string[];
  selectedFileTypes?: string[];
  autoSync: boolean;
  autoSyncIntervalSeconds?: AutoSyncIntervalSeconds;
  autoMergeNonOverlapping: boolean;
  createConflictBackup: boolean;
  pendingConflictBackupBranches: string[];
  createdAt: string;
  access?: "owner" | "shared";
  settingsEditable?: boolean;
  connectionSource?: string | null;
}


const STORAGE_KEY = "marktwin:saved-repos";
const NUMBER_KEY = "marktwin:next-cabinet-number";
export class SavedRepoRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "SavedRepoRequestError"; }
}
function writeAll(repos: SavedRepoLocal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repos));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("marktwin:cabinets-changed"));
}
export function getSavedRepos(): SavedRepoLocal[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let rows: SavedRepoLocal[];
  try { rows = JSON.parse(raw); } catch { throw new Error("Saved Cabinets could not be read. Your browser data has not been changed."); }
  if (!Array.isArray(rows) || rows.some(row => !row || !Number.isSafeInteger(row.id) || typeof row.repoFullName !== "string")) throw new Error("Saved Cabinets have an invalid format. Your browser data has not been changed.");
  const used = new Set(rows.map(row => row.cabinetNumber).filter(value => Number.isSafeInteger(value) && value > 0));
  // Avoid assigning a number that shadows another Cabinet's legacy ID URL.
  const reservedIds = new Set(rows.map(row => row.id));
  let next = Math.max(1, Number(localStorage.getItem(NUMBER_KEY)) || 1, ...Array.from(used, number => number + 1));
  const result = rows.map(row => {
    let cabinetNumber = row.cabinetNumber;
    if (!Number.isSafeInteger(cabinetNumber) || cabinetNumber < 1) {
      while (used.has(next) || reservedIds.has(next)) next++;
      cabinetNumber = next++; used.add(cabinetNumber);
    }
    return { ...row, cabinetNumber, defaultBranch: row.defaultBranch || "main", selectedFileTypes: alwaysAvailableWorkspaceFileTypes(row.selectedFileTypes), autoSync: row.autoSync ?? false, autoSyncIntervalSeconds: normalizeAutoSyncIntervalSeconds(row.autoSyncIntervalSeconds), autoMergeNonOverlapping: row.autoMergeNonOverlapping ?? true, createConflictBackup: row.createConflictBackup ?? true, pendingConflictBackupBranches: row.pendingConflictBackupBranches || [], createdAt: row.createdAt || new Date(0).toISOString() };
  });
  if (JSON.stringify(result) !== raw) writeAll(result);
  localStorage.setItem(NUMBER_KEY, String(next));
  return result;
}
type RepoUpdates = Partial<Pick<SavedRepoLocal, "displayName" | "repoFullName" | "defaultBranch" | "selectedRootScopes" | "selectedFileTypes" | "autoSync" | "autoSyncIntervalSeconds" | "autoMergeNonOverlapping" | "createConflictBackup" | "pendingConflictBackupBranches">>;
export function addSavedRepo(input: Pick<SavedRepoLocal, "displayName" | "repoFullName" | "defaultBranch"> & RepoUpdates): SavedRepoLocal {
  const repos = getSavedRepos();
  let id = Date.now();
  while (repos.some(repo => repo.id === id || repo.cabinetNumber === id)) id++;
  let cabinetNumber = Math.max(1, Number(localStorage.getItem(NUMBER_KEY)) || 1, ...repos.map(repo => repo.cabinetNumber + 1));
  while (repos.some(repo => repo.id === cabinetNumber) || cabinetNumber === id) cabinetNumber++;
  const repo: SavedRepoLocal = { ...input, id, cabinetNumber, defaultBranch: input.defaultBranch || "main", selectedFileTypes: alwaysAvailableWorkspaceFileTypes(input.selectedFileTypes), autoSync: input.autoSync ?? false, autoSyncIntervalSeconds: normalizeAutoSyncIntervalSeconds(input.autoSyncIntervalSeconds), autoMergeNonOverlapping: input.autoMergeNonOverlapping ?? true, createConflictBackup: input.createConflictBackup ?? true, pendingConflictBackupBranches: input.pendingConflictBackupBranches || [], createdAt: new Date().toISOString() };
  writeAll([...repos, repo]);
  localStorage.setItem(NUMBER_KEY, String(cabinetNumber + 1));
  return repo;
}
export function updateSavedRepo(id: number, updates: RepoUpdates): SavedRepoLocal {
  const repos = getSavedRepos();
  const index = repos.findIndex(repo => repo.id === id);
  if (index < 0) throw new SavedRepoRequestError("Cabinet not found in this browser.", 404);
  const updated = { ...repos[index], ...updates };
  updated.selectedFileTypes = alwaysAvailableWorkspaceFileTypes(updated.selectedFileTypes);
  updated.autoSyncIntervalSeconds = normalizeAutoSyncIntervalSeconds(updated.autoSyncIntervalSeconds);
  repos[index] = updated;
  writeAll(repos);
  return updated;
}
export function deleteSavedRepo(id: number): boolean {
  const repos = getSavedRepos();
  const next = repos.filter(repo => repo.id !== id);
  writeAll(next);
  return next.length !== repos.length;
}
