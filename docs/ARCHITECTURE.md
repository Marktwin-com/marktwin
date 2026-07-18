# Marktwin Architecture

Marktwin is a React and Node application built around a strict boundary:
private repository content and GitHub credentials stay in browsers, not on the
Marktwin server.

## System Components

- **Client:** React, TypeScript, Yjs, CodeMirror, browser-to-GitHub API calls,
  encrypted WebRTC collaboration, staged Changes review, and sanitized local
  print export.
- **Server:** Express static serving and ephemeral WebRTC signaling.
- **Storage:** GitHub for published Markdown; browser local storage for saved
  repository metadata and selected scopes; session storage for credentials.
- **Live state:** one Yjs working tree containing UUID file records and `Y.Text`
  content. Unsynced work is memory/P2P-only.

## Privacy Boundary

The server may receive static requests and transient signaling values (room
hash, temporary peer ID, offer, answer, and ICE candidates). It must never
receive GitHub credentials, repository content, plaintext document updates,
chat, activity, invite secrets, or document keys. `/api/pdf/*` is intentionally
absent; print export is sanitized in the browser.

## Workspace Loading

1. The user connects `owner/repo` through configured OAuth or an advanced PAT.
2. The browser validates repository and branch directly with GitHub.
3. It discovers immediate repository children only. `.agents` is the sole
   default; `Main path` means root-level Markdown only.
4. A selected top-level folder includes descendant Markdown. Non-Markdown
   assets are neither loaded nor managed.
5. File requests use bounded concurrency, cancellation, progress reporting,
   and SHA caching.

## Collaboration Protocol

The owner creates separate fresh edit and view invite fragments. After `/signal`
peer discovery, all application payloads are encrypted locally and separated by
purpose:

- Yjs document updates: accepted from edit rooms only.
- Chat: accepted from edit and view rooms.
- Awareness: presence, display name, role, cursor, and viewed file.
- Owner control: selected scopes, workspace name, and Sync lock; peers cannot
  send or alter owner control.

Closing or rotating a session cancels reconnect timers and closes live rooms.
Display names and activity attribution are review context, never authorization.
`/manual-pair` is an isolated WebRTC transport lab, not a workspace transport.

## Changes and GitHub Publication

All content and structural operations are staged. The owner keeps a browser-local
GitHub baseline for diffs and recovery. Changes supports per-item Undo,
workspace-wide Discard, attribution, a commit message, and explicit final Sync.

Before Sync, every current and original path is normalized and checked against
owner-selected scopes. Sync then snapshots the branch, creates one Git tree and
commit, and fast-forwards the reference. If GitHub advanced, Marktwin creates a
`branch-marktwin-YYYYMMDD-HHmmss` branch at the prepared commit and switches the
saved workspace to it. Failures keep staged state intact.

## Deployment and Release Gates

Marktwin needs a long-running Node process for `/signal`. Configure production
STUN/TURN through `.env.example`; `VITE_GITHUB_OAUTH_CLIENT_ID` optionally enables
OAuth.

Run `npm run verify` before release. It includes unit tests, the multi-browser
Puppeteer smoke flow, TypeScript, and the production build.
