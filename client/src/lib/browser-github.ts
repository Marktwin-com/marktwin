export interface GitHubFileNode {
  path: string;
  name: string;
  sha: string;
  size?: number;
  type: "file" | "folder";
}

export interface LoadedGitHubFile extends GitHubFileNode {
  content: string;
}

function parseRepo(repoFullName: string) {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) throw new Error("Repository must use owner/repo format.");
  return { owner, repo };
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
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || response.statusText);
  }

  return response.json();
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

export async function listGitHubFiles(token: string, repoFullName: string, branch: string): Promise<GitHubFileNode[]> {
  const { owner, repo } = parseRepo(repoFullName);
  const tree = await githubRequest<{ tree: Array<{ path?: string; type?: string; sha?: string; size?: number }> }>(
    token,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );

  return tree.tree
    .filter((item) => {
      if (!item.path || !item.sha) return false;
      if (item.type === "blob") {
        const lower = item.path.toLowerCase();
        return lower.endsWith(".md") || lower.endsWith(".svg") || lower.endsWith(".pdf");
      }
      return false;
    })
    .map((item) => ({
      path: item.path!,
      name: item.path!.split("/").pop() || item.path!,
      sha: item.sha!,
      size: item.size,
      type: "file" as const,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export async function loadMarkdownFile(
  token: string,
  repoFullName: string,
  path: string,
  branch: string,
): Promise<LoadedGitHubFile> {
  const { owner, repo } = parseRepo(repoFullName);
  const file = await githubRequest<{
    name: string;
    path: string;
    sha: string;
    size: number;
    content: string;
    encoding: string;
  }>(token, `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);

  if (file.encoding !== "base64") throw new Error("Unsupported GitHub content encoding.");
  return {
    type: "file" as const,
    name: file.name,
    path: file.path,
    sha: file.sha,
    size: file.size,
    content: decodeBase64Utf8(file.content),
  };
}

export async function commitMarkdownFile(params: {
  token: string;
  repoFullName: string;
  path: string;
  branch: string;
  previousSha: string;
  content: string;
  message: string;
}) {
  const { owner, repo } = parseRepo(params.repoFullName);
  const latest = await loadMarkdownFile(params.token, params.repoFullName, params.path, params.branch);
  if (latest.sha !== params.previousSha) {
    return { ok: false as const, latest };
  }

  const result = await githubRequest<{ content: { sha: string } }>(
    params.token,
    `/repos/${owner}/${repo}/contents/${encodePath(params.path)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: params.message,
        content: encodeBase64Utf8(params.content),
        sha: params.previousSha,
        branch: params.branch,
      }),
    },
  );

  return { ok: true as const, sha: result.content.sha };
}

export async function createBranch(
  token: string,
  repoFullName: string,
  baseBranch: string,
  newBranch: string
) {
  const { owner, repo } = parseRepo(repoFullName);
  
  // 1. Get the SHA of the base branch
  const refData = await githubRequest<{ object: { sha: string } }>(
    token,
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(baseBranch)}`
  );
  
  // 2. Create the new branch reference
  await githubRequest(
    token,
    `/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${newBranch}`,
        sha: refData.object.sha,
      }),
    }
  );
  
  return true;
}
