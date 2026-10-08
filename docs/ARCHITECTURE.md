# Marktwin architecture

The open source edition is a React/TypeScript browser application with a small
Node/Express static and signaling server. It has no database or account system.

## Data flow

The browser connects directly to GitHub using a session-held PAT or the optional
browser OAuth flow. Cabinets identify repositories, branches, and selected scopes;
these records live under `marktwin:saved-repos` in local storage. IDs and old token
keys are preserved during upgrade, and stable display numbers are assigned locally.
Cabinet CRUD and sync preferences never call a hosted API.

The working tree is a Yjs document containing text, JSON Canvas, Excalidraw,
artifact metadata, and configured assets. Checkpoint builds one Git tree and commit
and updates the branch without force. Remote changes trigger reconciliation;
non-overlapping changes may merge, while actual conflicts require resolution.
Optional conflict backup branches protect staged work. Failed publication keeps
the local draft and staged changes available for retry.

## Local persistence

Cabinets, the collaboration profile, theme, language, and editor settings are
browser-local. GitHub credentials remain in session storage. IndexedDB stores
recovery snapshots, including private content, when local recovery is enabled.
Recovery keys include repository identity and branch to prevent restoring a draft
into a different repository. This storage is not an encrypted vault: use trusted
browser profiles and clear local copies on shared devices.

## Collaboration

Owners create separate edit and view invitation fragments. The `/signal` WebSocket
exchanges transient discovery and negotiation data with bounded message sizes,
room counts, peers, join deadlines, and per-socket message rates. Application data
travels over encrypted WebRTC data channels. View peers can discuss and see work
but cannot apply document changes; only the owner controls publication and scopes.
Role labels and display names are not authentication credentials.

STUN/TURN settings come from the self-hosted build configuration, without a hosted
ICE API. TURN relays encrypted traffic when selected or used by automatic fallback.
No durable content or credentials are persisted by the application server.

## Application boundaries

The root route and `/app` open Cabinets. `/cabinet/:slug` accepts existing IDs and
supported aliases. `/join` loads an invitation from its URL fragment. `/user` edits
a local profile and preferences; it is not an account page. The bundled tutorial
runs without GitHub and checkpoints only into browser-local tutorial storage.

Shared types contain browser data structures only, with no database tables or ORM.
The server rejects `/api/*`, including account, Cabinet, analytics, and PDF requests.
Markdown print export parses and sanitizes content locally in an isolated print
window with external resources blocked.

## Verification

`npm run verify` combines Node tests, Vitest tests, Chromium browser integration,
TypeScript, production build, and a 150 KiB gzip budget for all eagerly loaded
JavaScript chunks. Editors are loaded lazily. Browser GitHub traffic is simulated;
real multi-network TURN and live provider OAuth checks require external configuration.
