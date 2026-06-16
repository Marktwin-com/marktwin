// Repos you've opened are remembered only in this browser's localStorage.
export interface SavedRepoLocal {
  id: number;
  displayName: string;
  repoFullName: string;
  defaultBranch: string;
  createdAt: string;
}

const STORAGE_KEY = "marktwin:saved-repos";

function readAll(): SavedRepoLocal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(repos: SavedRepoLocal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repos));
}

export function getSavedRepos(): SavedRepoLocal[] {
  return readAll();
}

export function addSavedRepo(input: {
  displayName: string;
  repoFullName: string;
  defaultBranch: string;
}): SavedRepoLocal {
  const repo: SavedRepoLocal = {
    id: Date.now(),
    displayName: input.displayName,
    repoFullName: input.repoFullName,
    defaultBranch: input.defaultBranch || "main",
    createdAt: new Date().toISOString(),
  };
  writeAll([...readAll(), repo]);
  return repo;
}

export function updateSavedRepo(
  id: number,
  updates: Partial<Pick<SavedRepoLocal, "displayName" | "repoFullName" | "defaultBranch">>,
): SavedRepoLocal | undefined {
  const repos = readAll();
  const index = repos.findIndex((repo) => repo.id === id);
  if (index === -1) return undefined;
  const updated = { ...repos[index], ...updates };
  repos[index] = updated;
  writeAll(repos);
  return updated;
}

export function deleteSavedRepo(id: number): boolean {
  const repos = readAll();
  const next = repos.filter((repo) => repo.id !== id);
  writeAll(next);
  return next.length !== repos.length;
}
