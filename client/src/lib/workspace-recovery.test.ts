import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addWorkspaceFile, getFilesMap, hasUnsyncedChanges, hydrateSelectedScopes, readCabinetNotes, setWorkspaceFileContent } from "./cabinet-files";
import { applyWorkspaceRecovery, clearWorkspaceRecovery, clearWorkspaceRecoveryForRepo, loadWorkspaceRecovery, saveWorkspaceRecovery, workspaceRecoveryMatchesRemoteContent } from "./workspace-recovery";

async function putLegacyRecovery(record: Record<string, unknown>) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("marktwin-workspace-recovery", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}

describe("browser recovery", () => {
  it("recognizes when a guarded local draft is already present on GitHub", async () => {
    const source = new Y.Doc();
    addWorkspaceFile(source, { path: "project-notes", filename: "answers.md", content: "already published" });
    await saveWorkspaceRecovery({ doc: source, repoId: 41, repoFullName: "owner/repo", branch: "main", baseCommitSha: "old", baseTreeSha: "old-tree", selectedScopes: ["/"], baseline: [], dirty: true });
    const record = await loadWorkspaceRecovery(41, "owner/repo", "main");
    const remote = [{
      scope: "/",
      files: [{ path: "project-notes/answers.md", name: "answers.md", sha: "blob", content: "already published", fileType: "markdown" as const }],
      folderMarkers: [],
    }];

    expect(workspaceRecoveryMatchesRemoteContent(record!, remote, { repoId: 41, repoFullName: "owner/repo", branch: "main" })).toBe(true);
    remote[0].files[0].content = "different remote content";
    expect(workspaceRecoveryMatchesRemoteContent(record!, remote, { repoId: 41, repoFullName: "owner/repo", branch: "main" })).toBe(false);
    await clearWorkspaceRecovery(41, "owner/repo", "main");
  });

  it("restores an unsynced Yjs cabinet without storing a token", async () => {
    const source = new Y.Doc();
    addWorkspaceFile(source, { path: "/", filename: "offline.md", fileType: "markdown", content: "saved on iPad" });
    await saveWorkspaceRecovery({ doc: source, repoId: 42, repoFullName: "owner/repo", branch: "main", baseCommitSha: "commit", baseTreeSha: "tree", selectedScopes: ["/"], baseline: [], dirty: true });
    const record = await loadWorkspaceRecovery(42, "owner/repo", "main");
    expect(record).toBeDefined();
    expect(JSON.stringify(record)).not.toContain("token");

    const restored = new Y.Doc();
    applyWorkspaceRecovery(restored, record!, { repoId: 42, repoFullName: "OWNER/REPO", branch: "main" });
    expect(readCabinetNotes(restored)[0].content).toBe("saved on iPad");
    expect(hasUnsyncedChanges(restored)).toBe(true);
    await clearWorkspaceRecovery(42, "owner/repo", "main");
  });

  it("replaces a freshly hydrated file instead of duplicating it", async () => {
    const local = new Y.Doc();
    const originalId = addWorkspaceFile(local, { path: "notes", filename: "idea.md", content: "original" });
    setWorkspaceFileContent(local, originalId, "edited locally");
    const source = new Y.Doc();
    hydrateSelectedScopes(source, [{
      scope: "notes",
      files: [{ path: "notes/idea.md", name: "idea.md", sha: "github-sha", content: "original", fileType: "markdown" }],
      folderMarkers: [],
    }]);
    // Reproduce a recovery already polluted by the old hydrate-then-apply flow.
    Y.applyUpdate(source, Y.encodeStateAsUpdate(local));
    expect(getFilesMap(source).size).toBe(2);
    await saveWorkspaceRecovery({ doc: source, repoId: 43, repoFullName: "owner/repo", branch: "main", baseCommitSha: "commit", baseTreeSha: "tree", selectedScopes: ["notes"], baseline: [], dirty: true });
    const record = await loadWorkspaceRecovery(43, "owner/repo", "main");

    const restored = new Y.Doc();
    hydrateSelectedScopes(restored, [{
      scope: "notes",
      files: [{ path: "notes/idea.md", name: "idea.md", sha: "github-sha", content: "original", fileType: "markdown" }],
      folderMarkers: [],
    }]);
    applyWorkspaceRecovery(restored, record!, { repoId: 43, repoFullName: "owner/repo", branch: "main" });

    expect(getFilesMap(restored).size).toBe(1);
    expect(readCabinetNotes(restored)).toHaveLength(1);
    expect(readCabinetNotes(restored)[0]).toMatchObject({ id: originalId, content: "edited locally", status: "added" });
    await clearWorkspaceRecovery(43, "owner/repo", "main");
  });

  it("clears every branch for one repository without touching another repository", async () => {
    const doc = new Y.Doc();
    await saveWorkspaceRecovery({ doc, repoId: 51, repoFullName: "owner/one", branch: "main", baseCommitSha: "a", baseTreeSha: "a", selectedScopes: ["/"], baseline: [], dirty: true });
    await saveWorkspaceRecovery({ doc, repoId: 51, repoFullName: "owner/one", branch: "draft", baseCommitSha: "b", baseTreeSha: "b", selectedScopes: ["/"], baseline: [], dirty: true });
    await saveWorkspaceRecovery({ doc, repoId: 52, repoFullName: "owner/two", branch: "main", baseCommitSha: "c", baseTreeSha: "c", selectedScopes: ["/"], baseline: [], dirty: true });

    await clearWorkspaceRecoveryForRepo(51);

    expect(await loadWorkspaceRecovery(51, "owner/one", "main")).toBeUndefined();
    expect(await loadWorkspaceRecovery(51, "owner/one", "draft")).toBeUndefined();
    expect(await loadWorkspaceRecovery(52, "owner/two", "main")).toBeDefined();
    await clearWorkspaceRecoveryForRepo(52);
    doc.destroy();
  });

  it("isolates repositories that reuse the same numeric id and branch", async () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    addWorkspaceFile(first, { path: "/", filename: "first.md", content: "first" });
    addWorkspaceFile(second, { path: "/", filename: "second.md", content: "second" });
    await saveWorkspaceRecovery({ doc: first, repoId: 60, repoFullName: "owner/first", branch: "main", baseCommitSha: "a", baseTreeSha: "a", selectedScopes: ["/"], baseline: [], dirty: true });
    await saveWorkspaceRecovery({ doc: second, repoId: 60, repoFullName: "owner/second", branch: "main", baseCommitSha: "b", baseTreeSha: "b", selectedScopes: ["/"], baseline: [], dirty: true });

    expect((await loadWorkspaceRecovery(60, "OWNER/FIRST", "main"))?.repoFullName).toBe("owner/first");
    expect((await loadWorkspaceRecovery(60, "owner/second", "main"))?.repoFullName).toBe("owner/second");
    const firstRecord = await loadWorkspaceRecovery(60, "owner/first", "main");
    expect(() => applyWorkspaceRecovery(new Y.Doc(), firstRecord!, {
      repoId: 60,
      repoFullName: "owner/second",
      branch: "main",
    })).toThrow(/different Cabinet/);

    await clearWorkspaceRecovery(60, "owner/first", "main");
    expect(await loadWorkspaceRecovery(60, "owner/first", "main")).toBeUndefined();
    expect(await loadWorkspaceRecovery(60, "owner/second", "main")).toBeDefined();
    await clearWorkspaceRecoveryForRepo(60);
  });

  it("loads matching legacy identity but quarantines a repository mismatch", async () => {
    const doc = new Y.Doc();
    addWorkspaceFile(doc, { path: "/", filename: "legacy.md", content: "legacy" });
    await saveWorkspaceRecovery({ doc, repoId: 70, repoFullName: "owner/original", branch: "main", baseCommitSha: "a", baseTreeSha: "a", selectedScopes: ["/"], baseline: [], dirty: true });
    const current = await loadWorkspaceRecovery(70, "owner/original", "main");
    await clearWorkspaceRecovery(70, "owner/original", "main");
    await putLegacyRecovery({ ...current, key: "70:main" });

    expect(await loadWorkspaceRecovery(70, "OWNER/ORIGINAL", "main")).toBeDefined();
    expect(await loadWorkspaceRecovery(70, "owner/replacement", "main")).toBeUndefined();
    expect(await loadWorkspaceRecovery(70, "owner/original", "main")).toBeDefined();
    await clearWorkspaceRecoveryForRepo(70);
  });
});
