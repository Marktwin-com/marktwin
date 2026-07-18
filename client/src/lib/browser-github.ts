const GITHUB_API_VERSION = "2026-03-10";

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public responseMessage = message,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export interface GitHubRepository {
  name: string;
  fullName: string;
  ownerLogin: string;
  defaultBranch: string;
  private: boolean;
}

export interface GitHubBranch {
  name: string;
  commitSha: string;
}

export interface GitHubRootScope {
  key: string;
  label: string;
  kind: "root" | "folder";
  sha: string;
}

export interface GitHubRootSnapshot {
  scopes: GitHubRootScope[];
  rootMarkdown: GitHubTreeItem[];
  commitSha: string;
  treeSha: string;
}

export interface GitHubMarkdownFile {
  path: string;
  name: string;
  sha: string;
  content: string;
}

export interface GitHubScopeSnapshot {
  files: GitHubMarkdownFile[];
  folderMarkers: string[];
}

export interface AtomicTreeChange {
  path: string;
  content?: string;
  sha?: string | null;
}

export interface AtomicCommitResult {
  commitSha: string;
  branch: string;
  branchCreated: boolean;
}

export interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

interface GitHubTreeResponse {
  sha: string;
  truncated: boolean;
  tree: Array<{
    path?: string;
    type?: string;
    sha?: string;
    size?: number;
  }>;
}

const markdownCache = new Map<string, GitHubMarkdownFile>();
const MAX_MARKDOWN_CACHE_ENTRIES = 1000;

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export function parseRepo(repoFullName: string) {
  const parts = repoFullName.trim().split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Repository must use owner/repo format.");
  }
  return { owner: parts[0], repo: parts[1] };
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function githubRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    let parsed: { message?: string } | undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    const message = parsed?.message || response.statusText || "GitHub request failed.";
    throw new GitHubApiError(message, response.status, message);
  }

  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function normalizeTreeItems(tree: GitHubTreeResponse): GitHubTreeItem[] {
  return tree.tree.flatMap((item) => {
    if (!item.path || !item.sha || (item.type !== "blob" && item.type !== "tree")) return [];
    return [{
      path: item.path,
      type: item.type,
      sha: item.sha,
      size: item.size,
    } satisfies GitHubTreeItem];
  });
}

export function isMarkdownPath(path: string) {
  return path.toLowerCase().endsWith(".md");
}

export function defaultRootScopes(scopes: GitHubRootScope[]) {
  return scopes.some((scope) => scope.key === ".agents") ? [".agents"] : [];
}

export async function getAuthenticatedUser(token: string) {
  return githubRequest<{ login: string }>(token, "/user");
}

export async function getRepository(token: string, repoFullName: string): Promise<GitHubRepository> {
  const { owner, repo } = parseRepo(repoFullName);
  const result = await githubRequest<{
    name: string;
    full_name: string;
    owner: { login: string };
    default_branch: string;
    private: boolean;
  }>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);

  return {
    name: result.name,
    fullName: result.full_name,
    ownerLogin: result.owner.login,
    defaultBranch: result.default_branch,
    private: result.private,
  };
}

export async function getBranch(token: string, repoFullName: string, branch: string): Promise<GitHubBranch> {
  const { owner, repo } = parseRepo(repoFullName);
  const result = await githubRequest<{ name: string; commit: { sha: string } }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
  );
  return { name: result.name, commitSha: result.commit.sha };
}

export async function createPrivateRepository(token: string, requestedName: string) {
  const created = await githubRequest<{
    name: string;
    full_name: string;
    owner: { login: string };
    default_branch: string;
    private: boolean;
  }>(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({ name: requestedName, private: true, auto_init: true }),
  });

  const repository: GitHubRepository = {
    name: created.name,
    fullName: created.full_name,
    ownerLogin: created.owner.login,
    defaultBranch: created.default_branch,
    private: created.private,
  };

  await createOrUpdateMarkdownFile({
    token,
    repoFullName: repository.fullName,
    path: ".agents/README.md",
    branch: repository.defaultBranch,
    content: `# Agent workspace

Use this document to align before changing agent behavior.

## Mission

What outcome should this agent help people achieve?

## Behavioral rules

- State the behaviors that must always hold.
- Add concrete examples where interpretation could differ.

## Skills and tools

List the skills, tools, and sources the agent may use—and when.

## Boundaries

Document prohibited actions, approval requirements, privacy constraints, and escalation paths.

## Review criteria

Define how collaborators will decide that a proposed rule or skill is ready to publish.
`,
    message: "Initialize agent workspace via Marktwin",
  });

  return repository;
}

export async function getRootSnapshot(
  token: string,
  repoFullName: string,
  branch: string,
): Promise<GitHubRootSnapshot> {
  const { owner, repo } = parseRepo(repoFullName);
  const branchRef = await githubRequest<{ object: { sha: string } }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodePath(branch)}`,
  );
  const commit = await githubRequest<{ tree: { sha: string } }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${branchRef.object.sha}`,
  );
  const tree = await githubRequest<GitHubTreeResponse>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${commit.tree.sha}`,
  );
  const items = normalizeTreeItems(tree);
  const rootMarkdown = items.filter((item) => item.type === "blob" && isMarkdownPath(item.path));
  const scopes: GitHubRootScope[] = [
    { key: "/", label: "Main path", kind: "root", sha: tree.sha },
    ...items
      .filter((item) => item.type === "tree")
      .sort((left, right) => {
        if (left.path === ".agents") return -1;
        if (right.path === ".agents") return 1;
        return left.path.localeCompare(right.path);
      })
      .map((item) => ({ key: item.path, label: item.path, kind: "folder" as const, sha: item.sha })),
  ];

  return {
    scopes,
    rootMarkdown,
    commitSha: branchRef.object.sha,
    treeSha: commit.tree.sha,
  };
}

export async function loadMarkdownFile(
  token: string,
  repoFullName: string,
  path: string,
  branch: string,
  options: { sha?: string; signal?: AbortSignal } = {},
): Promise<GitHubMarkdownFile> {
  const cacheKey = options.sha ? `${repoFullName}:${options.sha}` : "";
  const cached = cacheKey ? markdownCache.get(cacheKey) : undefined;
  if (cached) return { ...cached };
  const { owner, repo } = parseRepo(repoFullName);
  const file = await githubRequest<{
    name: string;
    path: string;
    sha: string;
    content: string;
    encoding: string;
  }>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`, { signal: options.signal });

  if (file.encoding !== "base64") throw new Error("Unsupported GitHub content encoding.");
  const result = {
    name: file.name,
    path: file.path,
    sha: file.sha,
    content: decodeBase64Utf8(file.content),
  };
  if (cacheKey) {
    markdownCache.set(cacheKey, result);
    if (markdownCache.size > MAX_MARKDOWN_CACHE_ENTRIES) markdownCache.delete(markdownCache.keys().next().value as string);
  }
  return { ...result };
}

export async function loadScopeSnapshot(params: {
  token: string;
  repoFullName: string;
  branch: string;
  scope: GitHubRootScope;
  rootMarkdown: GitHubTreeItem[];
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}): Promise<GitHubScopeSnapshot> {
  const { token, repoFullName, branch, scope, rootMarkdown, signal, onProgress } = params;
  const { owner, repo } = parseRepo(repoFullName);
  let items: GitHubTreeItem[];

  if (scope.kind === "root") {
    items = rootMarkdown;
  } else {
    const tree = await githubRequest<GitHubTreeResponse>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${scope.sha}?recursive=1`,
      { signal },
    );
    if (tree.truncated) {
      throw new Error(`The '${scope.key}' folder is too large to load safely.`);
    }
    items = normalizeTreeItems(tree).map((item) => ({ ...item, path: `${scope.key}/${item.path}` }));
  }

  const markdownItems = items.filter((item) => item.type === "blob" && isMarkdownPath(item.path));
  const markerPaths = items
    .filter((item) => item.type === "blob" && item.path.split("/").pop() === ".gitkeep")
    .map((item) => item.path.split("/").slice(0, -1).join("/"))
    .filter(Boolean);
  let completed = 0;
  onProgress?.(completed, markdownItems.length);
  const files = await mapWithConcurrency(markdownItems, params.concurrency || 6, async (item) => {
    if (signal?.aborted) throw new DOMException("Workspace loading was cancelled.", "AbortError");
    const file = await loadMarkdownFile(token, repoFullName, item.path, branch, { sha: item.sha, signal });
    completed += 1;
    onProgress?.(completed, markdownItems.length);
    return file;
  });

  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    folderMarkers: markerPaths,
  };
}

async function createOrUpdateMarkdownFile(params: {
  token: string;
  repoFullName: string;
  path: string;
  branch: string;
  content: string;
  message: string;
  sha?: string;
}) {
  const { owner, repo } = parseRepo(params.repoFullName);
  const body: Record<string, string> = {
    message: params.message,
    content: encodeBase64Utf8(params.content),
    branch: params.branch,
  };
  if (params.sha) body.sha = params.sha;
  return githubRequest<{ content: { sha: string } }>(
    params.token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(params.path)}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export function makeConflictBranchName(branch: string, now = new Date()) {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  return `${branch.replace(/[^A-Za-z0-9._-]+/g, "-")}-marktwin-${date}-${time}`;
}

export async function commitAtomicChanges(params: {
  token: string;
  repoFullName: string;
  branch: string;
  baseCommitSha: string;
  baseTreeSha: string;
  changes: AtomicTreeChange[];
  message: string;
}): Promise<AtomicCommitResult> {
  const { owner, repo } = parseRepo(params.repoFullName);
  const prefix = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const treeEntries = params.changes.map((change) => {
    const entry: Record<string, string | null> = {
      path: change.path,
      mode: "100644",
      type: "blob",
    };
    if (Object.prototype.hasOwnProperty.call(change, "content")) {
      entry.content = change.content ?? "";
    } else {
      entry.sha = change.sha ?? null;
    }
    return entry;
  });

  const tree = await githubRequest<{ sha: string }>(params.token, `${prefix}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: params.baseTreeSha, tree: treeEntries }),
  });
  const commit = await githubRequest<{ sha: string }>(params.token, `${prefix}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: params.message,
      tree: tree.sha,
      parents: [params.baseCommitSha],
    }),
  });

  try {
    await githubRequest(params.token, `${prefix}/git/refs/heads/${encodePath(params.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    return { commitSha: commit.sha, branch: params.branch, branchCreated: false };
  } catch (error) {
    if (!(error instanceof GitHubApiError) || ![409, 422].includes(error.status)) throw error;
    const latestRef = await githubRequest<{ object: { sha: string } }>(
      params.token,
      `${prefix}/git/ref/heads/${encodePath(params.branch)}`,
    );
    if (latestRef.object.sha === params.baseCommitSha) throw error;
    const fallbackBranch = makeConflictBranchName(params.branch);
    await githubRequest(params.token, `${prefix}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${fallbackBranch}`, sha: commit.sha }),
    });
    return { commitSha: commit.sha, branch: fallbackBranch, branchCreated: true };
  }
}
