# Security Policy

Marktwin's privacy model depends on document content and GitHub credentials never
reaching the server (see [docs/PRIVACY.md](./docs/PRIVACY.md)). Reports about that
boundary are treated as the highest priority.

## Reporting a vulnerability

Please report security issues privately to **nwolf@optimai.cl** rather than
opening a public issue. Include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept if available.
- The affected version or commit.
- Whether the issue could expose GitHub tokens, repository contents, invite
  secrets, plaintext collaboration data, or PDF request payloads.

We'll acknowledge your report within a few days, triage it privately, and publish
fix details only after users have a reasonable path to update.

## Supported versions

Marktwin does not yet have tagged releases. Security fixes land on `main`.

## Scope

Highest-priority reports include:

- GitHub tokens or OAuth tokens reaching the server.
- Private Markdown, chat, comments, or collaboration payloads being logged,
  persisted, or exposed to the wrong peer.
- Invite secrets appearing in HTTP request paths, query strings, server logs, or
  analytics.
- View-only collaboration sessions being able to commit or produce accepted
  edits.
