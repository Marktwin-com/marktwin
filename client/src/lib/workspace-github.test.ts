import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BranchAdvancedError,
  commitAtomicChanges,
  createConflictBackup,
  defaultRootScopes,
  deleteBranch,
  getBranches,
  getCommitRootSnapshot,
  getRootSnapshot,
  initializeEmptyRepository,
  loadScopeSnapshot,
  makeConflictBranchName,
  resolveSelectedRootScopes,
  scopesForWorkspaceLoad,
  workspaceFileTypeForPath,
} from "./workspace-github";

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("workspace GitHub optimistic commits", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prefers .agents, then repository root for first Cabinet scope", () => {
    expect(defaultRootScopes([{ key: ".agents", label: ".agents", kind: "folder", sha: "a" }, { key: "/", label: "root", kind: "root", sha: "b" }])).toEqual([".agents"]);
    expect(defaultRootScopes([{ key: "/", label: "root", kind: "root", sha: "b" }])).toEqual(["/"]);
    expect(defaultRootScopes([{ key: "docs", label: "docs", kind: "folder", sha: "d" }])).toEqual(["docs"]);
  });

  it("keeps configured scopes and falls back to a usable root when saved scopes are empty or stale", () => {
    const scopes = [
      { key: "/", label: "Main path", kind: "root", sha: "root" },
      { key: "project-notes", label: "project-notes", kind: "folder", sha: "energy" },
    ] as const;
    expect(resolveSelectedRootScopes(scopes, ["/", "project-notes"])).toEqual(["/", "project-notes"]);
    expect(resolveSelectedRootScopes(scopes, [])).toEqual(["/"]);
    expect(resolveSelectedRootScopes(scopes, ["missing"])).toEqual(["/"]);
  });

  it("loads Main path once because it covers the whole repository tree", () => {
    expect(scopesForWorkspaceLoad(["/", "project-notes", "docs"])).toEqual(["/"]);
    expect(scopesForWorkspaceLoad(["docs", "docs", "notes"])).toEqual(["docs", "notes"]);
  });

  it("loads nested core files recursively for a legacy Text-only Cabinet", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        sha: "tree-root",
        truncated: false,
        tree: [
          { path: "project-notes", type: "tree", sha: "tree-energy" },
          { path: "project-notes/questions.md", type: "blob", sha: "blob-questions" },
          { path: "project-notes/paper.tex", type: "blob", sha: "blob-paper" },
          { path: "project-notes/roadmap.canvas", type: "blob", sha: "blob-roadmap" },
          { path: "project-notes/sketch.excalidraw", type: "blob", sha: "blob-sketch" },
          { path: "project-notes/recording.mp4", type: "blob", sha: "blob-recording" },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        name: "questions.md",
        path: "project-notes/questions.md",
        sha: "blob-questions",
        content: btoa("The content GitHub just saved"),
        encoding: "base64",
      }))
      .mockResolvedValueOnce(jsonResponse({
        name: "paper.tex",
        path: "project-notes/paper.tex",
        sha: "blob-paper",
        content: btoa("\\section{Plan}"),
        encoding: "base64",
      }))
      .mockResolvedValueOnce(jsonResponse({
        name: "roadmap.canvas",
        path: "project-notes/roadmap.canvas",
        sha: "blob-roadmap",
        content: btoa('{"nodes":[],"edges":[]}'),
        encoding: "base64",
      }))
      .mockResolvedValueOnce(jsonResponse({
        name: "sketch.excalidraw",
        path: "project-notes/sketch.excalidraw",
        sha: "blob-sketch",
        content: btoa('{"type":"excalidraw","version":2,"elements":[]}'),
        encoding: "base64",
      }));

    await expect(loadScopeSnapshot({
      token: "token",
      repoFullName: "owner/repo",
      branch: "main",
      scope: { key: "/", label: "Main path", kind: "root", sha: "tree-root" },
      rootMarkdown: [],
      rootFiles: [],
      fileTypes: ["markdown"],
    })).resolves.toMatchObject({
      files: [
        { path: "project-notes/paper.tex", content: "\\section{Plan}" },
        { path: "project-notes/questions.md", content: "The content GitHub just saved" },
        { path: "project-notes/roadmap.canvas", content: '{"nodes":[],"edges":[]}' },
        { path: "project-notes/sketch.excalidraw", content: '{"type":"excalidraw","version":2,"elements":[]}' },
      ],
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/owner/repo/git/trees/tree-root?recursive=1");
    expect(fetchMock.mock.calls.slice(1).map(([url]) => url)).toEqual([
      "https://api.github.com/repos/owner/repo/git/blobs/blob-questions",
      "https://api.github.com/repos/owner/repo/git/blobs/blob-paper",
      "https://api.github.com/repos/owner/repo/git/blobs/blob-roadmap",
      "https://api.github.com/repos/owner/repo/git/blobs/blob-sketch",
    ]);
  });

  it("classifies supported binary assets separately from images", () => {
    expect(workspaceFileTypeForPath("media/launch.mp4")).toBe("asset");
    expect(workspaceFileTypeForPath("media/launch.mp3")).toBe("asset");
    expect(workspaceFileTypeForPath("docs/brief.pdf")).toBe("asset");
    expect(workspaceFileTypeForPath("media/photo.png")).toBe("image");
    expect(workspaceFileTypeForPath("downloads/installer.exe")).toBeNull();
  });

  it("builds the post-sync snapshot from the exact published commit tree", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      sha: "tree-published",
      truncated: false,
      tree: [{ path: "project-notes", type: "tree", sha: "tree-energy" }],
    }));

    await expect(getCommitRootSnapshot("token", "owner/repo", "commit-published", "tree-published"))
      .resolves.toMatchObject({ commitSha: "commit-published", treeSha: "tree-published" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/owner/repo/git/trees/tree-published");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("refs/heads");
  });

  it("treats GitHub's no-commit response as an empty repository", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ message: "Git Repository is empty." }, 409))
      .mockResolvedValueOnce(jsonResponse({ message: "Git Repository is empty." }, 409));

    await expect(getBranches("token", "owner/repo")).resolves.toEqual([]);
    await expect(getRootSnapshot("token", "owner/repo", "main")).resolves.toMatchObject({
      scopes: [{ key: "/", kind: "root" }],
      rootFiles: [],
      commitSha: "",
      treeSha: "",
    });
  });

  it("initializes an empty repository without adding visible workspace content", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ content: { sha: "marker-sha" }, commit: { sha: "commit-initial" } }))
      .mockResolvedValueOnce(jsonResponse([{ name: "main", commit: { sha: "commit-initial" } }]))
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "commit-initial" } }))
      .mockResolvedValueOnce(jsonResponse({ tree: { sha: "tree-initial" } }))
      .mockResolvedValueOnce(jsonResponse({ sha: "tree-initial", truncated: false, tree: [{ path: ".gitkeep", type: "blob", sha: "marker-sha" }] }));

    await expect(initializeEmptyRepository("token", "owner/repo", "main")).resolves.toEqual({
      branch: "main",
      commitSha: "commit-initial",
      treeSha: "tree-initial",
    });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/owner/repo/contents/.gitkeep");
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      message: "Initialize Marktwin workspace",
      content: "",
    });
  });

  it("updates the configured branch without creating a fallback branch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ sha: "tree-new" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "commit-new" }))
      .mockResolvedValueOnce(jsonResponse({ ref: "refs/heads/main" }));

    await expect(commitAtomicChanges({
      token: "token",
      repoFullName: "owner/repo",
      branch: "main",
      baseCommitSha: "commit-old",
      baseTreeSha: "tree-old",
      changes: [{ path: "docs/a.md", content: "new" }],
      message: "Update",
    })).resolves.toEqual({ commitSha: "commit-new", treeSha: "tree-new" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.github.com/repos/owner/repo/git/refs/heads/main");
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === "POST" && String(call[0]).endsWith("/git/refs"))).toBe(false);
  });

  it("uploads base64 image changes as Git blobs before creating the tree", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ sha: "blob-image" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "tree-new" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "commit-new" }))
      .mockResolvedValueOnce(jsonResponse({ ref: "refs/heads/main" }));

    await expect(commitAtomicChanges({
      token: "token",
      repoFullName: "owner/repo",
      branch: "main",
      baseCommitSha: "commit-old",
      baseTreeSha: "tree-old",
      changes: [{ path: ".marktwin/figures/photo.png", content: "iVBORw0KGgo=", contentEncoding: "base64" }],
      message: "Add image",
    })).resolves.toEqual({ commitSha: "commit-new", treeSha: "tree-new" });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/owner/repo/git/blobs");
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ content: "iVBORw0KGgo=", encoding: "base64" });
    const treeBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(treeBody.tree).toEqual([{ path: ".marktwin/figures/photo.png", mode: "100644", type: "blob", sha: "blob-image" }]);
  });

  it("reports a newly advanced head as an explicit optimistic-update error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ sha: "tree-new" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "commit-new" }))
      .mockResolvedValueOnce(jsonResponse({ message: "Reference update failed" }, 422))
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "remote-new" } }));

    const promise = commitAtomicChanges({
      token: "token",
      repoFullName: "owner/repo",
      branch: "main",
      baseCommitSha: "commit-old",
      baseTreeSha: "tree-old",
      changes: [{ path: "docs/a.md", content: "new" }],
      message: "Update",
    });
    await expect(promise).rejects.toBeInstanceOf(BranchAdvancedError);
    await expect(promise).rejects.toMatchObject({ latestCommitSha: "remote-new" });
  });

  it("creates an explicit temporary backup ref based on the original commit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ sha: "tree-backup" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "commit-backup" }))
      .mockResolvedValueOnce(jsonResponse({ ref: "refs/heads/main-marktwin-backup" }));

    const result = await createConflictBackup({
      token: "token",
      repoFullName: "owner/repo",
      branch: "feature/work",
      baseCommitSha: "commit-old",
      baseTreeSha: "tree-old",
      changes: [{ path: "docs/a.md", content: "local" }],
      message: "Backup",
      username: "NathWolf",
    });

    expect(result.branch).toMatch(/^feature-work-marktwin-backup-NathWolf-\d{8}-\d{6}$/);
    const commitBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(commitBody.parents).toEqual(["commit-old"]);
    const refBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(refBody).toEqual({ ref: `refs/heads/${result.branch}`, sha: "commit-backup" });
  });

  it("uses a safe Marktwin username in backup branch names", () => {
    expect(makeConflictBranchName("feature/work", "Nath Wolf", new Date(2026, 7, 14, 10, 30, 25)))
      .toBe("feature-work-marktwin-backup-Nath-Wolf-20260814-103025");
  });

  it("retries with another timestamp when a backup ref name already exists", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ sha: "tree-backup" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "commit-backup" }))
      .mockResolvedValueOnce(jsonResponse({ message: "Reference already exists" }, 422))
      .mockResolvedValueOnce(jsonResponse({ ref: "refs/heads/backup" }));

    const result = await createConflictBackup({
      token: "token",
      repoFullName: "owner/repo",
      branch: "main",
      baseCommitSha: "commit-old",
      baseTreeSha: "tree-old",
      changes: [{ path: "docs/a.md", content: "local" }],
      message: "Backup",
    });
    const firstRef = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body)).ref;
    const secondRef = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body)).ref;
    expect(secondRef).not.toBe(firstRef);
    expect(secondRef).toBe(`refs/heads/${result.branch}`);
  });

  it("deletes a recorded backup through the Git references endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(undefined, 204));
    await deleteBranch("token", "owner/repo", "main-marktwin-backup-20260813-120000");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/git/refs/heads/main-marktwin-backup-20260813-120000",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
