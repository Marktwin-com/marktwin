import assert from "node:assert/strict";
import test from "node:test";

import {
  completeGitHubOAuthFromLocation,
  configuredGitHubClientId,
  consumeGitHubOAuthToken,
  startGitHubOAuth,
} from "../client/src/lib/github-oauth-pkce.ts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const originalWindow = globalThis.window;
const originalSessionStorage = globalThis.sessionStorage;
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: originalSessionStorage, configurable: true });
  globalThis.fetch = originalFetch;
});

test("OAuth is truthful when unconfigured and consumes tokens once", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { location: { origin: "https://marktwin.test", assign() {} } }, configurable: true });
  assert.equal(configuredGitHubClientId(), undefined);
  await assert.rejects(() => startGitHubOAuth("/my-cabinets"), /not configured/);
  storage.setItem("marktwin.githubToken", "oauth-token");
  assert.equal(consumeGitHubOAuthToken(), "oauth-token");
  assert.equal(consumeGitHubOAuthToken(), null);
});

test("configured OAuth starts PKCE and callback stores the returned token", async () => {
  const storage = new MemoryStorage();
  let assigned = "";
  const location = { origin: "https://marktwin.test", search: "", assign(value: string) { assigned = value; } };
  Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { location }, configurable: true });
  await startGitHubOAuth("/my-cabinets", "client-id");
  const authorization = new URL(assigned);
  assert.equal(authorization.hostname, "github.com");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  location.search = `?code=oauth-code&state=${authorization.searchParams.get("state")}`;
  let exchangeBody: Record<string, string> = {};
  globalThis.fetch = async (_input, init) => {
    exchangeBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ access_token: "returned-token" }), { status: 200 });
  };
  assert.equal(await completeGitHubOAuthFromLocation("client-id"), "/my-cabinets");
  assert.equal(exchangeBody.code, "oauth-code");
  assert.equal(typeof exchangeBody.code_verifier, "string");
  assert.equal(consumeGitHubOAuthToken(), "returned-token");
});
