export interface RepositoryCredentialTarget { id: number; repoFullName: string; }
export function getCabinetPat(repo: RepositoryCredentialTarget, storage: Storage = sessionStorage) {
  const repoName = repo.repoFullName.split("/")[1] || repo.repoFullName;
  return storage.getItem(`gh-token-${repo.id}`) || storage.getItem(`gh-token-${repoName}`);
}
export async function resolveRepositoryCredential(repo: RepositoryCredentialTarget): Promise<{ token: string; source: "pat" | "oauth" } | null> {
  const pat = getCabinetPat(repo);
  if (pat) return { token: pat, source: "pat" };
  const token = sessionStorage.getItem("marktwin.githubToken");
  return token ? { token, source: "oauth" } : null;
}
export function clearGitHubSessionCredentials(storage: Storage = sessionStorage) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  keys.forEach(key => { if (key && (key.startsWith("gh-token-") || key.startsWith("marktwin.github"))) storage.removeItem(key); });
}
