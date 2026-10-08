# Privacy in the self-hosted edition

Private workspace files and GitHub credentials do not go to the Marktwin application
server. There are no Marktwin accounts, server-side Cabinet records, product analytics,
email services, or server-side PDF generation in this distribution.

## What stays in the browser

- GitHub PATs and optional OAuth credentials: session storage.
- Saved repositories, branches, scopes, sync preferences, appearance, language,
  and collaboration profile: local storage.
- Unpublished work: Yjs state and, by default, recovery snapshots in IndexedDB.
- Bundled tutorial edits and tutorial checkpoints: browser-local storage.

Local recovery contains private document content and is not encrypted at rest by
Marktwin. Disable **Keep offline drafts** or remove recovery copies in Cabinet
settings when appropriate. Forgetting GitHub credentials in profile settings does
not delete files, saved Cabinets, or recovery drafts.

## What leaves the browser

GitHub receives direct API requests needed to load and publish your repository.
Collaboration peers receive the workspace content you share, encrypted in transit.
The signaling server sees connection metadata, room hashes, temporary peer IDs,
and WebRTC negotiation data. It does not receive invitation fragment secrets,
document updates, chat text, or GitHub tokens. Signaling rooms are ephemeral.

STUN services and configured TURN relays can observe connection metadata. TURN can
observe IP addresses, timing, and encrypted packet sizes. Your selected relay is
not automatically a service operated by Marktwin. Build-time relay credentials are
visible to browsers; they must not be a relay's shared signing secret.

Remote Markdown images are not fetched automatically; repository images are
resolved directly through GitHub.

Font resources may be requested from the font providers referenced by the app.
They receive normal resource-request metadata, not private repository content.

## Printing and logging

Print / Save as PDF renders sanitized Markdown locally and blocks external resources
in the print document. No PDF endpoint is used. Application request logs redact URL
query values and do not log request bodies or signaling payloads. Your reverse proxy
and hosting platform have their own logging policies and should be configured accordingly.

See [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](../SECURITY.md).
