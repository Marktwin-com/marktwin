# Marktwin Privacy Model

## Product Rule

> Private repository content, GitHub credentials, discussion, activity,
> plaintext collaboration updates, invite secrets, and document keys must not
> be readable by Marktwin servers.

There are no Marktwin accounts, server sessions, or private-content database.
The server serves the app and relays ephemeral WebRTC setup data only.

## Data Paths

The owner browser holds the GitHub credential in session storage, calls GitHub
directly, hosts the selected Yjs workspace, and is the only participant allowed
to publish. Collaborator browsers receive encrypted peer-to-peer state. Edit
links may send document updates; view links may send chat and awareness but not
document or owner-control updates.

The signaling server sees only a derived room hash, temporary peer IDs, offers,
answers, ICE candidates, and cleanup timestamps. It never receives repository
paths, Markdown, chat, GitHub credentials, or invite fragments.

## Local and GitHub Storage

- Saved repository name, branch, and selected top-level scopes persist in this
  browser's local storage.
- GitHub/OAuth credentials live in session storage and are removed with the
  browser session.
- Unsynced files, discussion, and activity are memory/P2P-only. Closing every
  copy before Sync can lose them.
- Published Markdown lives in the user's GitHub repository.

## Discussion, Presence, and Identity

Chat is an explicit encrypted protocol message, separate from Yjs document
updates, so view peers can participate without write permission. Discussion is
ephemeral unless an editor uses Capture decision, which stages a Markdown entry
for owner review. Awareness may contain display name, color, role, cursor, and
viewed file. Names and activity records are not authentication or authorization.

## Export

Print / Save as PDF sanitizes Markdown in the browser and strips images and
active/embed content before opening the print view. Marktwin exposes no server
PDF generation or test route, so private Markdown does not enter a server export
path.

## Session and Link Safety

Each Start/Rotate creates fresh edit and view secrets in URL fragments. Stop
closes rooms and cancels reconnect timers. Invite links grant live-session
access, should be shared through a trusted channel, and cannot recover work once
all in-memory copies are gone.

## Manual WebRTC Lab

`/manual-pair` demonstrates an isolated encrypted Yjs text connection without
Marktwin signaling. It is explicitly not connected to workspace files, roles,
discussion, Changes, or GitHub publication.

## Deployment Checks

- Run `npm run verify`.
- Confirm `/api/pdf/generate` and `/api/pdf/test` return 404.
- Confirm server logs contain no tokens, Markdown, chat, or invite fragments.
- Confirm `/signal` accepts setup metadata only.
- Confirm view updates are rejected and owner-selected scopes are enforced at
  Sync.
- Configure a controlled TURN service when reliable connectivity across
  restrictive networks is required.
