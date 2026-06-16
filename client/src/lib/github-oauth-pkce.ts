const OAUTH_STATE_KEY = "marktwin.githubOAuthState";
const OAUTH_VERIFIER_KEY = "marktwin.githubOAuthVerifier";
const OAUTH_RETURN_KEY = "marktwin.githubOAuthReturnTo";
const OAUTH_TOKEN_KEY = "marktwin.githubToken";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export function configuredGitHubClientId() {
  return import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID as string | undefined;
}

export function consumeGitHubOAuthToken() {
  const token = sessionStorage.getItem(OAUTH_TOKEN_KEY);
  if (token) sessionStorage.removeItem(OAUTH_TOKEN_KEY);
  return token;
}

export async function startGitHubOAuth(returnTo = "/app") {
  const clientId = configuredGitHubClientId();
  if (!clientId) throw new Error("VITE_GITHUB_OAUTH_CLIENT_ID is not configured.");

  const verifier = randomString(64);
  const state = randomString(32);
  const redirectUri = `${window.location.origin}/github/callback`;
  sessionStorage.setItem(OAUTH_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  sessionStorage.setItem(OAUTH_RETURN_KEY, returnTo);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo read:user",
    state,
    code_challenge: await sha256Base64Url(verifier),
    code_challenge_method: "S256",
  });
  window.location.assign(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

export async function completeGitHubOAuthFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const verifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY);
  const clientId = configuredGitHubClientId();
  const returnTo = sessionStorage.getItem(OAUTH_RETURN_KEY) || "/app";

  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_RETURN_KEY);

  if (!code || !state || !expectedState || state !== expectedState || !verifier || !clientId) {
    throw new Error("Invalid GitHub OAuth callback.");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      code,
      redirect_uri: `${window.location.origin}/github/callback`,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) throw new Error("GitHub OAuth token exchange failed.");
  const token = await response.json();
  if (!token.access_token) throw new Error(token.error_description || "GitHub did not return an access token.");

  sessionStorage.setItem(OAUTH_TOKEN_KEY, token.access_token);
  return returnTo;
}
