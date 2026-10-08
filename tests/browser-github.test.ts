import assert from "node:assert/strict";
import test from "node:test";

import {
  GitHubApiError,
  BranchAdvancedError,
  commitAtomicChanges,
  createPrivateRepository,
  getRepository,
  getRootSnapshot,
  loadScopeSnapshot,
  makeConflictBranchName,
} from "../client/src/lib/workspace-github.ts";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("repository metadata and typed GitHub errors are preserved", async () => {
  globalThis.fetch = async () => jsonResponse({
    name: "rules",
    full_name: "acme/rules",
    owner: { login: "acme" },
    default_branch: "main",
    private: true,
  });
  assert.deepEqual(await getRepository("token", "acme/rules"), {
    name: "rules",
    fullName: "acme/rules",
    ownerLogin: "acme",
    defaultBranch: "main",
    private: true,
  });

  globalThis.fetch = async () => jsonResponse({ message: "Not Found" }, 404);
  await assert.rejects(() => getRepository("token", "acme/missing"), (error) => {
    assert.ok(error instanceof GitHubApiError);
    assert.equal(error.status, 404);
    assert.equal(error.responseMessage, "Not Found");
    return true;
  });
});

test("personal repository creation adopts GitHub metadata and seeds .agents", async () => {
  const requests: Array<{ url: string; body: any }> = [];
  const responses = [
    jsonResponse({
      name: "rules",
      full_name: "personal-owner/rules",
      owner: { login: "personal-owner" },
      default_branch: "trunk",
      private: true,
    }, 201),
    jsonResponse({ content: { sha: "seed-sha" } }, 201),
  ];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return responses.shift()!;
  };
  const repository = await createPrivateRepository("token", "rules");
  assert.equal(repository.fullName, "personal-owner/rules");
  assert.equal(repository.defaultBranch, "trunk");
  assert.equal(requests[0].url.endsWith("/user/repos"), true);
  assert.deepEqual(requests[0].body, { name: "rules", private: true, auto_init: true });
  assert.equal(requests[1].url.includes("/.agents/README.md"), true);
  assert.equal(requests[1].body.branch, "trunk");
});

test("authentication and permission failures keep their GitHub status", async () => {
  for (const status of [401, 403]) {
    globalThis.fetch = async () => jsonResponse({ message: `status-${status}` }, status);
    await assert.rejects(
      getRepository("token", "acme/rules"),
      (error: unknown) => error instanceof GitHubApiError && error.status === status,
    );
  }
});

test("root discovery exposes only immediate principal scopes", async () => {
  const responses = [
    jsonResponse({ object: { sha: "commit-1" } }),
    jsonResponse({ tree: { sha: "tree-1" } }),
    jsonResponse({ sha: "tree-1", truncated: false, tree: [
      { path: ".agents", type: "tree", sha: "agents-tree" },
      { path: "docs", type: "tree", sha: "docs-tree" },
      { path: "README.md", type: "blob", sha: "readme-sha" },
      { path: "image.svg", type: "blob", sha: "svg-sha" },
    ] }),
  ];
  globalThis.fetch = async () => responses.shift()!;
  const root = await getRootSnapshot("token", "acme/rules", "main");
  assert.deepEqual(root.scopes.map((scope) => scope.key), ["/", ".agents", "docs"]);
  assert.deepEqual(root.rootMarkdown.map((file) => file.path), ["README.md"]);
  assert.equal(root.commitSha, "commit-1");
});

test("folder scopes load descendant Markdown and hidden empty-folder markers only", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/git/trees/agents-tree")) {
      return jsonResponse({ sha: "agents-tree", truncated: false, tree: [
        { path: "AGENTS.md", type: "blob", sha: "agents-sha" },
        { path: "skills/SKILL.md", type: "blob", sha: "skill-sha" },
        { path: "skills/icon.svg", type: "blob", sha: "icon-sha" },
        { path: "empty/.gitkeep", type: "blob", sha: "marker-sha" },
      ] });
    }
    const path = decodeURIComponent(new URL(url).pathname.split("/").slice(5).join("/"));
    const name = path.split("/").at(-1)!;
    return jsonResponse({
      name,
      path,
      sha: `${name}-sha`,
      encoding: "base64",
      content: Buffer.from(`# ${name}`).toString("base64"),
    });
  };
  const loaded = await loadScopeSnapshot({
    token: "token",
    repoFullName: "acme/rules",
    branch: "main",
    scope: { key: ".agents", label: ".agents", kind: "folder", sha: "agents-tree" },
    rootMarkdown: [],
  });
  assert.deepEqual(loaded.files.map((file) => file.path), [".agents/AGENTS.md", ".agents/skills/SKILL.md"]);
  assert.deepEqual(loaded.folderMarkers, [".agents/empty"]);
});

test("large scope loading is bounded, reports progress, and reuses SHA content", async () => {
  let activeContentRequests = 0;
  let peakContentRequests = 0;
  let contentRequests = 0;
  const progress: Array<[number, number]> = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/git/trees/bounded-tree")) {
      return jsonResponse({ sha: "bounded-tree", truncated: false, tree: Array.from({ length: 12 }, (_, index) => ({
        path: `file-${index}.md`, type: "blob", sha: `bounded-sha-${index}`,
      })) });
    }
    contentRequests += 1;
    activeContentRequests += 1;
    peakContentRequests = Math.max(peakContentRequests, activeContentRequests);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeContentRequests -= 1;
    const name = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!);
    return jsonResponse({ name, path: `.agents/${name}`, sha: `response-${name}`, encoding: "base64", content: Buffer.from(name).toString("base64") });
  };
  const input = {
    token: "token",
    repoFullName: "acme/bounded-rules",
    branch: "main",
    scope: { key: ".agents", label: ".agents", kind: "folder" as const, sha: "bounded-tree" },
    rootMarkdown: [],
    concurrency: 3,
    onProgress: (completed: number, total: number) => progress.push([completed, total]),
  };
  const first = await loadScopeSnapshot(input);
  await loadScopeSnapshot(input);
  assert.equal(first.files.length, 12);
  assert.equal(peakContentRequests <= 3, true);
  assert.equal(contentRequests, 12);
  assert.deepEqual(progress.at(-1), [12, 12]);
});

test("atomic sync publishes one commit and fast-forwards the branch", async () => {
  const requests: Array<{ url: string; method: string; body: any }> = [];
  const responses = [
    jsonResponse({ sha: "tree-2" }, 201),
    jsonResponse({ sha: "commit-2" }, 201),
    jsonResponse({ ref: "refs/heads/main" }),
  ];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method || "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return responses.shift()!;
  };
  const result = await commitAtomicChanges({
    token: "token",
    repoFullName: "acme/rules",
    branch: "main",
    baseCommitSha: "commit-1",
    baseTreeSha: "tree-1",
    changes: [{ path: ".agents/EMPTY.md", content: "" }, { path: ".agents/OLD.md", sha: null }],
    message: "Update workspace",
  });
  assert.deepEqual(result, { commitSha: "commit-2", treeSha: "tree-2" });
  assert.equal(requests.filter((request) => request.url.endsWith("/git/commits")).length, 1);
  assert.deepEqual(requests[0].body.tree, [
    { path: ".agents/EMPTY.md", mode: "100644", type: "blob", content: "" },
    { path: ".agents/OLD.md", mode: "100644", type: "blob", sha: null },
  ]);
});

test("a non-fast-forward reports the new head without silently publishing to another branch", async () => {
  const requests: string[] = [];
  const responses = [jsonResponse({ sha: "tree-2" }, 201), jsonResponse({ sha: "commit-2" }, 201), jsonResponse({ message: "Reference update failed" }, 422), jsonResponse({ object: { sha: "commit-from-github" } })];
  globalThis.fetch = async input => { requests.push(String(input)); return responses.shift()!; };
  await assert.rejects(commitAtomicChanges({ token: "token", repoFullName: "acme/rules", branch: "main", baseCommitSha: "commit-1", baseTreeSha: "tree-1", changes: [{ path: ".agents/AGENTS.md", content: "rules" }], message: "Update workspace" }), error => error instanceof BranchAdvancedError);
  assert.equal(requests.some(url => url.endsWith("/git/refs")), false);
});

test("a rejected ref update without a changed head remains retryable", async () => {
  const responses = [
    jsonResponse({ sha: "tree-2" }, 201),
    jsonResponse({ sha: "commit-2" }, 201),
    jsonResponse({ message: "Validation failed" }, 422),
    jsonResponse({ object: { sha: "commit-1" } }),
  ];
  globalThis.fetch = async () => responses.shift()!;
  await assert.rejects(
    commitAtomicChanges({
      token: "token",
      repoFullName: "acme/rules",
      branch: "main",
      baseCommitSha: "commit-1",
      baseTreeSha: "tree-1",
      changes: [{ path: ".agents/AGENTS.md", content: "rules" }],
      message: "Update workspace",
    }),
    (error: unknown) => error instanceof GitHubApiError && error.status === 422,
  );
});

test("conflict branch names are stable and Git-safe", () => {
  assert.equal(
    makeConflictBranchName("feature/agent rules", "writer", new Date(2026, 6, 18, 9, 7, 5)),
    "feature-agent-rules-marktwin-backup-writer-20260718-090705",
  );
});
