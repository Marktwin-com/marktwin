import { isMarktwinConflictBackupBranch } from "@shared/conflict-backup";

const KEY_PREFIX = "marktwin.pendingConflictBackups";

function storageKey(repoId: number, repoFullName: string) {
  return `${KEY_PREFIX}.${repoId}.${repoFullName.toLowerCase()}`;
}

export function readLocalConflictBackups(repoId: number, repoFullName: string) {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(repoId, repoFullName)) || "[]");
    return Array.isArray(value)
      ? value.filter(isMarktwinConflictBackupBranch)
      : [];
  } catch {
    return [];
  }
}

export function writeLocalConflictBackups(repoId: number, repoFullName: string, branches: string[]) {
  if (typeof window === "undefined") return false;
  const unique = Array.from(new Set(branches.filter(isMarktwinConflictBackupBranch)));
  const key = storageKey(repoId, repoFullName);
  try {
    if (unique.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(unique));
    return true;
  } catch {
    // Server metadata remains the primary queue if browser storage is unavailable.
    return false;
  }
}

export function rememberLocalConflictBackup(repoId: number, repoFullName: string, branch: string) {
  return writeLocalConflictBackups(repoId, repoFullName, [
    ...readLocalConflictBackups(repoId, repoFullName),
    branch,
  ]);
}
