import { isMarktwinConflictBackupBranch } from "@shared/conflict-backup";

import { isArtifactMetadataPath } from "./artifact-metadata";
import { isMarkdownPath, isTextPath } from "./text-files";
import { alwaysAvailableWorkspaceFileTypes } from "./workspace-formats";

// Keep the API version explicit and supported by GitHub's REST API.
const GITHUB_API_VERSION = "2022-11-28";

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

export const DEFAULT_WORKSPACE_BRANCH = "main";

export interface GitHubBranch {
  name: string;
  commitSha: string;
}

export interface GitHubCommitSummary {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  authoredAt: string;
  url: string;
}

export type WorkspaceFileType = "markdown" | "canvas" | "drawing" | "image" | "asset";
export type WorkspaceFileContentEncoding = "utf8" | "base64";

export interface GitHubRootScope {
  key: string;
  label: string;
  kind: "root" | "folder";
  sha: string;
}

export interface GitHubRootSnapshot {
  scopes: GitHubRootScope[];
  /** Managed root-level index. Scope loading resolves the selected tree recursively. */
  rootFiles: GitHubTreeItem[];
  rootMarkdown: GitHubTreeItem[];
  commitSha: string;
  treeSha: string;
}

export interface GitHubWorkspaceFile {
  path: string;
  name: string;
  sha: string;
  content: string;
  contentEncoding?: WorkspaceFileContentEncoding;
  fileType: WorkspaceFileType;
}

export type GitHubMarkdownFile = GitHubWorkspaceFile;

export interface GitHubScopeSnapshot {
  files: GitHubMarkdownFile[];
  folderMarkers: string[];
}

export interface AtomicTreeChange {
  path: string;
  content?: string;
  contentEncoding?: WorkspaceFileContentEncoding;
  sha?: string | null;
}

export interface AtomicCommitResult {
  commitSha: string;
  treeSha: string;
}

export class BranchAdvancedError extends Error {
  constructor(public latestCommitSha: string) {
    super("The GitHub branch advanced while publishing.");
    this.name = "BranchAdvancedError";
  }
}

export function isEmptyGitHubRepositoryError(error: unknown): error is GitHubApiError {
  return error instanceof GitHubApiError
    && [404, 409, 422].includes(error.status)
    && /empty|no commits|does not have any commits/i.test(error.responseMessage);
}

export function emptyRootSnapshot(): GitHubRootSnapshot {
  return {
    scopes: [{ key: "/", label: "Main path", kind: "root", sha: "" }],
    rootFiles: [],
    rootMarkdown: [],
    commitSha: "",
    treeSha: "",
  };
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

const workspaceFileCache = new Map<string, GitHubWorkspaceFile>();
const MAX_WORKSPACE_FILE_CACHE_ENTRIES = 1000;

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
    cache: "no-store",
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

function decodeBase64Bytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeBase64Utf8(base64: string): string {
  return new TextDecoder().decode(decodeBase64Bytes(base64));
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

export function workspaceFileTypeForPath(path: string): WorkspaceFileType | null {
  const lower = path.toLowerCase();
  if (isTextPath(lower)) return "markdown";
  if (lower.endsWith(".canvas")) return "canvas";
  if (lower.endsWith(".excalidraw")) return "drawing";
  if (imageMimeTypeForPath(lower)) return "image";
  if (assetMimeTypeForPath(lower)) return "asset";
  return null;
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

const ASSET_MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
};

export function imageMimeTypeForPath(path: string) {
  const lower = path.toLowerCase();
  const extension = Object.keys(IMAGE_MIME_TYPES).find((candidate) => lower.endsWith(candidate));
  return extension ? IMAGE_MIME_TYPES[extension] : null;
}

export function imageExtensionForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase().split(";", 1)[0];
  return Object.entries(IMAGE_MIME_TYPES).find(([, value]) => value === normalized)?.[0] || ".png";
}

export function assetMimeTypeForPath(path: string) {
  const lower = path.toLowerCase();
  const extension = Object.keys(ASSET_MIME_TYPES).find((candidate) => lower.endsWith(candidate));
  return extension ? ASSET_MIME_TYPES[extension] : null;
}

export function assetMimeTypeForFile(file: Pick<File, "name" | "type">) {
  const byPath = assetMimeTypeForPath(file.name);
  if (!byPath) return null;
  const declared = file.type.toLowerCase().split(";", 1)[0];
  if (!declared || declared === byPath || (byPath === "video/x-m4v" && declared === "video/mp4")) return byPath;
  return null;
}

export function workspaceFileTypeUsesBase64(fileType: WorkspaceFileType) {
  return fileType === "image" || fileType === "asset";
}

export { isMarkdownPath, isTextPath };

export function isManagedWorkspacePath(path: string, selectedTypes: ReadonlySet<WorkspaceFileType>) {
  const type = workspaceFileTypeForPath(path);
  return type !== null && selectedTypes.has(type);
}

export function defaultRootScopes(scopes: ReadonlyArray<GitHubRootScope>) {
  const firstFolder = scopes.find((scope) => scope.kind === "folder");
  return scopes.some((scope) => scope.key === ".agents") ? [".agents"] : scopes.some((scope) => scope.key === "/") ? ["/"] : firstFolder ? [firstFolder.key] : [];
}

/**
 * Resolve saved Cabinet scopes against the current repository tree.
 *
 * A saved list can be absent, stale, or empty (for example after an older
 * settings save). In all of those cases the Cabinet must retain a usable
 * scope instead of opening in the misleading "no folders" state. The root
 * scope is a real working scope and permits creating files and folders at the
 * repository root.
 */
export function resolveSelectedRootScopes(
  scopes: ReadonlyArray<GitHubRootScope>,
  selectedRootScopes?: readonly string[] | null,
) {
  const available = new Set(scopes.map((scope) => scope.key));
  const retained = (selectedRootScopes ?? []).filter((scope) => available.has(scope));
  return retained.length > 0 ? retained : defaultRootScopes(scopes);
}

/**
 * Main path represents the whole repository tree. When it is selected, loading
 * additional top-level scopes would only download the same files twice.
 */
export function scopesForWorkspaceLoad(scopes: readonly string[]) {
  return scopes.includes("/") ? ["/"] : Array.from(new Set(scopes));
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
    default_branch: string | null;
    private: boolean;
  }>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);

  return {
    name: result.name,
    fullName: result.full_name,
    ownerLogin: result.owner.login,
    defaultBranch: result.default_branch || DEFAULT_WORKSPACE_BRANCH,
    private: result.private,
  };
}

export async function getRecentCommits(token: string, repoFullName: string, branch: string, limit = 25): Promise<GitHubCommitSummary[]> {
  const { owner, repo } = parseRepo(repoFullName);
  const result = await githubRequest<Array<{
    sha: string;
    html_url: string;
    author?: { login?: string } | null;
    commit: {
      message: string;
      author?: { name?: string; date?: string } | null;
      committer?: { name?: string; date?: string } | null;
    };
  }>>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=${Math.min(100, Math.max(1, limit))}`);
  return result.map((entry) => ({
    sha: entry.sha,
    shortSha: entry.sha.slice(0, 7),
    message: entry.commit.message.split(/\r?\n/, 1)[0] || "Untitled commit",
    author: entry.author?.login || entry.commit.author?.name || entry.commit.committer?.name || "Unknown author",
    authoredAt: entry.commit.author?.date || entry.commit.committer?.date || "",
    url: entry.html_url,
  }));
}

export async function getBranch(token: string, repoFullName: string, branch: string): Promise<GitHubBranch> {
  const { owner, repo } = parseRepo(repoFullName);
  const result = await githubRequest<{ name: string; commit: { sha: string } }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
  );
  return { name: result.name, commitSha: result.commit.sha };
}

export async function getBranches(token: string, repoFullName: string): Promise<GitHubBranch[]> {
  const { owner, repo } = parseRepo(repoFullName);
  const branches: GitHubBranch[] = [];
  try {
    for (let page = 1; page <= 10; page += 1) {
      const result = await githubRequest<Array<{ name: string; commit: { sha: string } }>>(
        token,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=${page}`,
      );
      branches.push(...result.map((branch) => ({ name: branch.name, commitSha: branch.commit.sha })));
      if (result.length < 100) break;
    }
  } catch (error) {
    if (isEmptyGitHubRepositoryError(error)) return [];
    throw error;
  }
  return branches;
}

/**
 * GitHub cannot create a branch in a repository with no commits. Create the
 * first commit with a hidden marker so the workspace can subsequently publish
 * the user's real files without adding visible content to the Cabinet.
 */
export async function initializeEmptyRepository(
  token: string,
  repoFullName: string,
  branch = DEFAULT_WORKSPACE_BRANCH,
) {
  try {
    // GitHub's Git Data endpoints cannot create the first object in an empty
    // repository. The Contents endpoint explicitly supports that case and
    // creates the initial branch and commit for us.
    const created = await createOrUpdateMarkdownFile({
      token,
      repoFullName,
      path: ".gitkeep",
      content: "",
      message: "Initialize Marktwin workspace",
    });
    const branches = await getBranches(token, repoFullName);
    const actualBranch = branches.find((candidate) => candidate.name === branch)?.name || branches[0]?.name || branch;
    const snapshot = await getRootSnapshot(token, repoFullName, actualBranch);
    return {
      branch: actualBranch,
      commitSha: created.commit?.sha || snapshot.commitSha,
      treeSha: snapshot.treeSha,
    };
  } catch (error) {
    // A double-click or another tab may have initialized the repository first.
    if (!(error instanceof GitHubApiError) || ![409, 422].includes(error.status)) throw error;
    const branches = await getBranches(token, repoFullName);
    const actualBranch = branches.find((candidate) => candidate.name === branch)?.name || branches[0]?.name;
    if (!actualBranch) throw error;
    const snapshot = await getRootSnapshot(token, repoFullName, actualBranch);
    return { branch: actualBranch, commitSha: snapshot.commitSha, treeSha: snapshot.treeSha };
  }
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

List the skills, tools, and sources the agent may use, and when.

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
  let branchRef: { object: { sha: string } };
  try {
    branchRef = await githubRequest<{ object: { sha: string } }>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodePath(branch)}`,
    );
  } catch (error) {
    if (isEmptyGitHubRepositoryError(error)) return emptyRootSnapshot();
    throw error;
  }
  const commit = await githubRequest<{ tree: { sha: string } }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${branchRef.object.sha}`,
  );
  const tree = await githubRequest<GitHubTreeResponse>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${commit.tree.sha}`,
  );
  return rootSnapshotFromTree(branchRef.object.sha, commit.tree.sha, tree);
}

function rootSnapshotFromTree(commitSha: string, treeSha: string, tree: GitHubTreeResponse): GitHubRootSnapshot {
  const items = normalizeTreeItems(tree);
  const rootFiles = items.filter((item) => item.type === "blob" && workspaceFileTypeForPath(item.path) !== null);
  const rootMarkdown = rootFiles.filter((item) => isMarkdownPath(item.path));
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
    rootFiles,
    rootMarkdown,
    commitSha,
    treeSha,
  };
}

/** Read the exact immutable commit created by Marktwin, bypassing a branch-ref
 * read that GitHub may briefly serve from an older cache after publication. */
export async function getCommitRootSnapshot(
  token: string,
  repoFullName: string,
  commitSha: string,
  treeSha: string,
) {
  const { owner, repo } = parseRepo(repoFullName);
  const tree = await githubRequest<GitHubTreeResponse>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${treeSha}`,
  );
  return rootSnapshotFromTree(commitSha, treeSha, tree);
}

export async function loadMarkdownFile(
  token: string,
  repoFullName: string,
  path: string,
  branch: string,
  options: { sha?: string; signal?: AbortSignal } = {},
): Promise<GitHubMarkdownFile> {
  const cacheKey = options.sha ? `${repoFullName}:${options.sha}` : "";
  const cached = cacheKey ? workspaceFileCache.get(cacheKey) : undefined;
  if (cached) return { ...cached };
  const { owner, repo } = parseRepo(repoFullName);
  const normalizedPath = path.replace(/^\/+/, "");
  const file = options.sha
    ? await githubRequest<{ sha: string; content: string; encoding: string }>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(options.sha)}`,
      { signal: options.signal },
    )
    : await githubRequest<{ sha: string; content: string; encoding: string }>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
      { signal: options.signal },
    );

  if (file.encoding !== "base64") throw new Error("Unsupported GitHub content encoding.");
  const fileType = workspaceFileTypeForPath(normalizedPath) || "markdown";
  const result = {
    name: normalizedPath.split("/").pop() || normalizedPath,
    path: normalizedPath,
    sha: file.sha,
    content: fileType === "image" || fileType === "asset" ? file.content.replace(/\s/g, "") : decodeBase64Utf8(file.content),
    ...(fileType === "image" || fileType === "asset" ? { contentEncoding: "base64" as const } : {}),
    fileType,
  };
  if (cacheKey) {
    workspaceFileCache.set(cacheKey, result);
    if (workspaceFileCache.size > MAX_WORKSPACE_FILE_CACHE_ENTRIES) workspaceFileCache.delete(workspaceFileCache.keys().next().value as string);
  }
  return { ...result };
}

export async function loadRepositoryImage(token: string, repoFullName: string, path: string, branch: string) {
  const mimeType = imageMimeTypeForPath(path);
  if (!mimeType) throw new Error("This repository image type is not supported.");
  const { owner, repo } = parseRepo(repoFullName);
  const file = await githubRequest<{ path: string; sha: string; size: number; content: string; encoding: string }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
  );
  if (file.encoding !== "base64") throw new Error("GitHub returned an unsupported image encoding.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Image exceeds the 10 MB preview limit.");
  const bytes = decodeBase64Bytes(file.content);
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Image exceeds the 10 MB preview limit.");
  return { path: file.path, sha: file.sha, mimeType, bytes };
}

export async function loadScopeSnapshot(params: {
  token: string;
  repoFullName: string;
  branch: string;
  scope: GitHubRootScope;
  rootMarkdown: GitHubTreeItem[];
  rootFiles?: GitHubTreeItem[];
  fileTypes?: WorkspaceFileType[];
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}): Promise<GitHubScopeSnapshot> {
  const { token, repoFullName, branch, scope, signal, onProgress } = params;
  const { owner, repo } = parseRepo(repoFullName);
  // Main path means the repository tree, not only files directly beside the
  // README. A recursive reload keeps newly-published nested files visible.
  const tree = await githubRequest<GitHubTreeResponse>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${scope.sha}?recursive=1`,
    { signal },
  );
  if (tree.truncated) {
    throw new Error(scope.kind === "root"
      ? "The repository is too large to load safely from Main path. Choose narrower folders in Workspace settings."
      : `The '${scope.key}' folder is too large to load safely.`);
  }
  const items = scope.kind === "root"
    ? normalizeTreeItems(tree)
    : normalizeTreeItems(tree).map((item) => ({ ...item, path: `${scope.key}/${item.path}` }));

  const selectedTypes = new Set<WorkspaceFileType>(alwaysAvailableWorkspaceFileTypes(params.fileTypes));
  const managedItems = items.filter((item) => item.type === "blob" && (
    isManagedWorkspacePath(item.path, selectedTypes) || isArtifactMetadataPath(item.path)
  ));
  const markerPaths = items
    .filter((item) => item.type === "blob" && item.path.split("/").pop() === ".gitkeep")
    .map((item) => item.path.split("/").slice(0, -1).join("/"))
    .filter(Boolean);
  let completed = 0;
  onProgress?.(completed, managedItems.length);
  const files = await mapWithConcurrency(managedItems, params.concurrency || 6, async (item) => {
    if (signal?.aborted) throw new DOMException("Workspace loading was cancelled.", "AbortError");
    const file = await loadMarkdownFile(token, repoFullName, item.path, branch, { sha: item.sha, signal });
    completed += 1;
    onProgress?.(completed, managedItems.length);
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
  branch?: string;
  content: string;
  message: string;
  sha?: string;
}) {
  const { owner, repo } = parseRepo(params.repoFullName);
  const body: Record<string, string> = {
    message: params.message,
    content: encodeBase64Utf8(params.content),
  };
  if (params.branch) body.branch = params.branch;
  if (params.sha) body.sha = params.sha;
  return githubRequest<{ content: { sha: string }; commit?: { sha: string } }>(
    params.token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(params.path)}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

function backupBranchSegment(value: string, fallback: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 48) || fallback;
}

export function makeConflictBranchName(branch: string, username = "user", now = new Date()) {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  const name = `${backupBranchSegment(branch, "branch")}-marktwin-backup-${backupBranchSegment(username, "user")}-${date}-${time}`;
  if (!isMarktwinConflictBackupBranch(name)) throw new Error("Could not create a safe conflict backup branch name.");
  return name;
}

async function createAtomicCommit(params: {
  token: string;
  repoFullName: string;
  baseCommitSha: string;
  baseTreeSha: string;
  changes: AtomicTreeChange[];
  message: string;
}) {
  const { owner, repo } = parseRepo(params.repoFullName);
  const prefix = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const blobChanges = params.changes.filter((change) => change.contentEncoding === "base64" && typeof change.content === "string");
  const blobShas = new Map<string, string>();
  await Promise.all(blobChanges.map(async (change) => {
    const blob = await githubRequest<{ sha: string }>(params.token, `${prefix}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: change.content, encoding: "base64" }),
    });
    blobShas.set(change.path, blob.sha);
  }));

  const treeEntries = params.changes.map((change) => {
    const entry: Record<string, string | null> = {
      path: change.path,
      mode: "100644",
      type: "blob",
    };
    if (change.contentEncoding === "base64") {
      entry.sha = blobShas.get(change.path) || null;
    } else if (Object.prototype.hasOwnProperty.call(change, "content")) {
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
  return { commitSha: commit.sha, treeSha: tree.sha };
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
  const created = await createAtomicCommit(params);

  try {
    await githubRequest(params.token, `${prefix}/git/refs/heads/${encodePath(params.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: created.commitSha, force: false }),
    });
    return created;
  } catch (error) {
    if (!(error instanceof GitHubApiError) || ![409, 422].includes(error.status)) throw error;
    const latestRef = await githubRequest<{ object: { sha: string } }>(
      params.token,
      `${prefix}/git/ref/heads/${encodePath(params.branch)}`,
    );
    if (
      latestRef.object.sha === params.baseCommitSha
      && !/fast[ -]?forward|reference update failed/i.test(error.responseMessage)
    ) throw error;
    throw new BranchAdvancedError(latestRef.object.sha);
  }
}

export async function createConflictBackup(params: {
  token: string;
  repoFullName: string;
  branch: string;
  baseCommitSha: string;
  baseTreeSha: string;
  changes: AtomicTreeChange[];
  message: string;
  username?: string;
}) {
  const { owner, repo } = parseRepo(params.repoFullName);
  const created = await createAtomicCommit(params);
  const createdAt = Date.now();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const branch = makeConflictBranchName(params.branch, params.username, new Date(createdAt + attempt * 1000));
    try {
      await githubRequest(params.token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: created.commitSha }),
      });
      return { branch, commitSha: created.commitSha };
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 422 || attempt === 4) throw error;
    }
  }
  throw new Error("Could not create a unique temporary backup branch.");
}

export async function deleteBranch(token: string, repoFullName: string, branch: string) {
  const { owner, repo } = parseRepo(repoFullName);
  await githubRequest<void>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodePath(branch)}`,
    { method: "DELETE" },
  );
}
