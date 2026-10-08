import assert from "node:assert/strict";
import test from "node:test";

import {
  addSavedRepo,
  getSavedRepos,
  updateSavedRepo,
} from "../client/src/lib/saved-repos.ts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const originalLocalStorage = globalThis.localStorage;

test.beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
});

test.after(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: originalLocalStorage,
    configurable: true,
  });
});

test("scope selections persist per cabinet and old records migrate lazily", () => {
  const cabinet = addSavedRepo({
    displayName: "acme/rules",
    repoFullName: "acme/rules",
    defaultBranch: "main",
  });
  assert.equal(getSavedRepos()[0].selectedRootScopes, undefined);

  updateSavedRepo(cabinet.id, { selectedRootScopes: [".agents", "/"] });
  assert.deepEqual(getSavedRepos()[0].selectedRootScopes, [".agents", "/"]);
});

test("upgrading Cabinets preserves IDs, branches and scopes and allocates stable numbers", () => {
  localStorage.setItem("marktwin:saved-repos", JSON.stringify([
    { id: 1, displayName: "Legacy", repoFullName: "acme/rules", defaultBranch: "feature/work", selectedRootScopes: ["docs"], createdAt: "2026-01-01" },
    { id: 101, displayName: "Other", repoFullName: "acme/other", defaultBranch: "main", selectedRootScopes: [".agents"] },
  ]));
  const upgraded = getSavedRepos();
  assert.deepEqual(upgraded.map(repo => repo.id), [1, 101]);
  assert.equal(upgraded[0].defaultBranch, "feature/work");
  assert.deepEqual(upgraded[0].selectedRootScopes, ["docs"]);
  assert.deepEqual(upgraded[0].selectedFileTypes, ["markdown", "canvas", "drawing"]);
  assert.equal(upgraded[0].autoSync, false);
  assert.equal(upgraded[0].autoSyncIntervalSeconds, 60);
  assert.deepEqual(getSavedRepos(), upgraded);
  assert.equal(upgraded.some(repo => repo.cabinetNumber === 1 || repo.cabinetNumber === 101), false);
  const created = addSavedRepo({ displayName: "Third", repoFullName: "acme/third", defaultBranch: "main" });
  assert.equal(new Set([...upgraded, created].map(repo => repo.cabinetNumber)).size, 3);
});

test("corrupt Cabinet storage is reported without overwriting the original data", () => {
  localStorage.setItem("marktwin:saved-repos", "{incomplete");
  assert.throws(getSavedRepos, /could not be read/);
  assert.equal(localStorage.getItem("marktwin:saved-repos"), "{incomplete");
  assert.throws(() => addSavedRepo({ displayName: "New", repoFullName: "acme/new", defaultBranch: "main" }));
  assert.equal(localStorage.getItem("marktwin:saved-repos"), "{incomplete");
});

test("Cabinet preferences are persisted without network requests or credentials", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Unexpected request"); };
  try {
    const repo = addSavedRepo({ displayName: "Private", repoFullName: "acme/private", defaultBranch: "main" });
    updateSavedRepo(repo.id, { autoSync: true, autoSyncIntervalSeconds: 300, pendingConflictBackupBranches: ["main-marktwin-backup-writer-20261008-120000"] });
    assert.equal(getSavedRepos()[0].autoSyncIntervalSeconds, 300);
    assert.equal(getSavedRepos()[0].autoSync, true);
    assert.equal(/token|password|credential/i.test(localStorage.getItem("marktwin:saved-repos")!), false);
  } finally { globalThis.fetch = originalFetch; }
});
