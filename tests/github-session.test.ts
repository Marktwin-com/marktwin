import assert from "node:assert/strict";
import test from "node:test";
import { clearGitHubSessionCredentials, resolveRepositoryCredential } from "../client/src/lib/github-session.ts";

test("credentials use legacy session keys without any application or GitHub API request", async () => {
  const originalStorage = globalThis.sessionStorage; const originalFetch = globalThis.fetch;
  const values = new Map<string, string>([["gh-token-101", "cabinet-token"], ["marktwin.githubToken", "oauth-token"], ["unrelated", "keep"]]);
  const storage = { get length() { return values.size; }, getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), key: (index: number) => [...values.keys()][index] || null, clear: () => values.clear() };
  Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
  globalThis.fetch = () => { throw new Error("Unexpected credential request"); };
  try {
    assert.deepEqual(await resolveRepositoryCredential({ id: 101, repoFullName: "acme/rules" }), { token: "cabinet-token", source: "pat" });
    assert.deepEqual(await resolveRepositoryCredential({ id: 102, repoFullName: "acme/other" }), { token: "oauth-token", source: "oauth" });
    clearGitHubSessionCredentials();
    assert.deepEqual([...values], [["unrelated", "keep"]]);
    assert.equal(await resolveRepositoryCredential({ id: 101, repoFullName: "acme/rules" }), null);
  } finally { globalThis.fetch = originalFetch; Object.defineProperty(globalThis, "sessionStorage", { value: originalStorage, configurable: true }); }
});
