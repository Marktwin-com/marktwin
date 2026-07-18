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
