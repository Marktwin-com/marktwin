# Marktwin Privacy Model

## Product Rule

Marktwin is built around this boundary:

> Private document content, GitHub repository content, GitHub credentials, chat content, comments, cursor text, edit history, invite secrets, and document keys must not be readable by Marktwin servers.

There are no accounts, no sessions, and no database. The server's only job is
ephemeral WebRTC signaling and on-demand PDF export. It must not be part of
the private document data path.

## Current Architecture

```text
Owner browser
  -> holds the GitHub token in browser session storage only
  -> loads Markdown and supported assets directly from GitHub
  -> creates fresh edit and view invite secrets
  -> encrypts collaboration payloads locally
  -> shares Yjs cabinet state, chat messages, and awareness over encrypted WebRTC
  -> manually commits final content directly to GitHub

Collaborator browser
  -> joins through /join with an invite secret
  -> derives collaboration keys locally
  -> exchanges encrypted Yjs updates over WebRTC
  -> may edit only when using an edit invite
  -> cannot commit to GitHub through Marktwin

Marktwin server
  -> holds no accounts, sessions, or database
  -> provides ephemeral /signal WebSocket room discovery
  -> renders markdown to PDF on request (the markdown is sent for that single request only, not stored)
```

## Server Data Allowed

Allowed:

- transient signaling room hash, peer id, WebRTC offer/answer, ICE candidates, and cleanup timestamps
- markdown content submitted to `/api/pdf/generate`, for the duration of that single request only

Not allowed, ever:

- GitHub tokens or OAuth access tokens
- Markdown content or repository file contents, persisted in any form
- plaintext comments or chat messages
- plaintext CRDT/Yjs updates
- document or cabinet encryption keys
- raw invite secrets
- reusable share tokens

## Private Cabinet Flow

1. Owner opens Marktwin and pastes a GitHub personal access token (or signs in via GitHub OAuth PKCE, which never touches the server either).
2. Browser calls GitHub directly to list and load files.
3. Owner starts a private cabinet session.
4. Browser creates fresh edit and view invite material.
5. Invite links are generated as `/join#...` fragments so invite secrets are not sent to the server in HTTP requests.
6. Invite secrets stay client-side and are used to derive encryption keys locally.
7. Browsers exchange encrypted Yjs updates over WebRTC data channels.
8. Cabinet file metadata is synchronized as Yjs metadata; file content remains in per-file Yjs text types.
9. Chat messages are stored in the shared Yjs document and travel through the encrypted collaboration path.
10. Awareness data, including display name, color, and cursor state, is sent through Yjs awareness for collaboration UX.
11. Owner commits manually to GitHub.
12. Before commit, the browser checks the current remote SHA and avoids silently overwriting remote changes.

## Identity In Collaboration

There is no account, so the owner's display name is a randomly generated name (e.g. `User4f2a`) that can be changed in the UI for the current session only. Collaborator display names work the same way.

Display names and cursor awareness are collaboration metadata. They must not be used as authorization boundaries.

## Chat Privacy

Cabinet chat uses the same private Yjs collaboration path as document updates. Chat messages are never sent through a plaintext server endpoint.

## Signaling Server

The `/signal` WebSocket is in-memory and ephemeral. It accepts only:

- room hash
- temporary peer id
- WebRTC offer
- WebRTC answer
- ICE candidates
- timestamps needed for cleanup

It does not store rooms in a database, log payloads, or receive document names, repo paths, GitHub tokens, plaintext edits, comments, chat, cursor text, or document keys.

Rooms are deleted when empty, and inactive peers are terminated.

## View And Edit Links

Each private cabinet session creates separate fresh links:

- edit link: can send Yjs updates accepted by the owner room
- view link: can decrypt and view updates, but the owner room ignores edit packets from that room

Collaborators do not need Marktwin accounts — there is no such thing. The owner remains the only user who can commit to GitHub through Marktwin.

## Manual Pairing Mode

`/manual-pair` provides a high-privacy path without Marktwin signaling:

1. Owner creates an offer.
2. Collaborator pastes the offer and creates an answer.
3. Owner pastes the answer.
4. WebRTC starts and encrypted Yjs updates flow directly between browsers.

This proves private collaboration does not require Marktwin to mediate the session.

## Removed Or Disabled

Marktwin never had, or has removed, all of the following:

- accounts, login, sessions, and any password storage
- a server-side database
- server-side private GitHub sync or token storage
- server-side private repository file proxying
- plaintext note sharing routes
- plaintext private collaboration WebSockets
- a server-owned demo cabinet
- server-side branch merge/conflict content handling

## Current Production Notes

- Browser-side GitHub OAuth PKCE is available when `VITE_GITHUB_OAUTH_CLIENT_ID` is configured.
- Any pasted browser token path must keep the token in browser session storage and must not send it to Marktwin servers.
- WebRTC ICE servers are environment-configurable through `VITE_WEBRTC_ICE_SERVERS` JSON or `VITE_STUN_URLS` / `VITE_TURN_URLS` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL`.
- Use a Marktwin-controlled TURN server for production if peer-to-peer connectivity must work across restrictive networks without relying on public STUN services.
- Treat exposed GitHub tokens as compromised and rotate them immediately.

## Deployment Checks

Before deployment:

- run `npm run check`
- run `npm run build`
- confirm backend request logs contain no GitHub tokens or Markdown content
- confirm invite secrets are never sent to the server
- confirm `/signal` receives only room hashes, peer ids, offers, answers, and ICE candidates
- confirm private chat content stays in the encrypted Yjs/WebRTC path
- confirm collaborators cannot commit to GitHub through Marktwin
- confirm view-only sessions cannot produce accepted edits
