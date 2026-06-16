# Marktwin Architecture

Marktwin is a React and Node application built around a strict privacy boundary:
private repository content and GitHub credentials stay in the browser, not on
the Marktwin server.

## System Components

- **Client**: React, TypeScript, Vite, Tailwind, shadcn-style UI components,
  Markdown/WYSIWYG editors, Yjs state, and browser-side GitHub API calls.
- **Server**: Express, static asset serving, ephemeral WebRTC signaling, and
  on-demand PDF export.
- **Storage**: GitHub repositories controlled by the user. Marktwin does not use
  a server-side database for private notes or accounts.
- **Collaboration**: Yjs CRDT updates exchanged over encrypted WebRTC data
  channels after peer discovery.

## Privacy Boundary

Allowed on the server:

- static asset requests
- API request metadata such as method, path, status, and duration
- transient WebRTC signaling data: room hash, peer id, offers, answers, ICE
  candidates, and cleanup timestamps
- Markdown submitted to PDF export for that single request only

Never allowed on the server as stored or reusable private data:

- GitHub personal access tokens or OAuth access tokens
- repository file contents
- plaintext collaboration updates
- plaintext chat messages
- invite secrets or document encryption keys
- reusable share tokens

The canonical privacy model lives in [PRIVACY.md](./PRIVACY.md).

## Client Data Flow

1. A user creates a cabinet for a GitHub repository.
2. The browser stores cabinet metadata in local storage.
3. The user provides a GitHub token for the current browser session, or uses
   browser-side GitHub OAuth PKCE when configured.
4. The browser calls the GitHub REST API directly to list, load, and commit
   files.
5. Markdown files are edited locally, synchronized through Yjs when
   collaborating, and committed back to GitHub by the browser.

## Collaboration Flow

1. The owner starts a private collaboration session.
2. The browser creates fresh invite material and keys.
3. Invite secrets are carried in URL fragments so they are not sent in HTTP
   requests.
4. Peers use `/signal` only to exchange WebRTC connection setup data.
5. Document updates, awareness, and chat travel through encrypted WebRTC/Yjs.
6. Collaborators can edit only through an edit invite. The owner remains the
   party that commits to GitHub.

Manual pairing at `/manual-pair` avoids the signaling server by letting peers
copy WebRTC offers and answers themselves.

## Server Responsibilities

- Serve the built client in production.
- Run Vite middleware in development.
- Host `/signal` for in-memory WebRTC peer discovery.
- Generate PDFs from request-scoped Markdown payloads.
- Avoid logging request bodies or private collaboration payloads.

## Deployment Shape

Marktwin needs a long-running Node process because WebSocket signaling requires
persistent connections. Same-origin deployment is the default: the Express
server serves both the API and client bundle.

Optional environment variables:

- `PORT`: server port, default `5001`.
- `PUBLIC_BASE_URL`: absolute deployment URL for server-generated asset links.
- `VITE_API_BASE_URL`: API origin for split frontend/backend deployments.
- `VITE_GITHUB_OAUTH_CLIENT_ID`: enables browser-side GitHub OAuth PKCE.
- WebRTC ICE variables from `.env.example`: configure STUN/TURN servers for
  production collaboration reliability.

## Release Gates

Before publishing or deploying:

- `npm run check`
- `npm run build`
- `npm run verify`
- confirm no GitHub tokens, invite secrets, Markdown content, or plaintext
  collaboration data are logged or persisted by the server
