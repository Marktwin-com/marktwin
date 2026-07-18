# Marktwin

**Craft, together.**

Private, collaborative agent workspaces backed by Markdown in your GitHub repositories.

Marktwin is a self-hostable space for defining agent missions, rules, skills,
tools, boundaries, examples, and review criteria together. It opens selected
Markdown scopes from GitHub, supports encrypted live collaboration and
discussion, and gives the owner an explicit Changes review before one atomic
GitHub commit—without a server-side database or account system.

Hosted version: [marktwin.com](https://marktwin.com)

## Why Marktwin Exists

- **GitHub-backed agent workspaces**: your Markdown files stay in repositories you control.
- **Agent-workspace focus**: Marktwin opens `.agents` by default and lets you opt
  into the repository root or other principal folders when they are useful.
- **No Marktwin accounts**: use a GitHub personal access token or browser-side
  GitHub OAuth PKCE.
- **Private by design**: document content and GitHub credentials are not stored
  by the Marktwin server.
- **Scoped P2P collaboration**: share the selected workspace through separate
  edit and view-only links. View peers can discuss but cannot change documents;
  only the owner can review and publish to GitHub.
- **Reviewable work**: additions, edits, moves, renames, deletions, and captured
  decisions remain staged with Undo/Discard controls until owner review.
- **Conflict-safe GitHub sync**: Marktwin checks the current branch head before
  publishing one atomic workspace commit, and saves work to a new branch instead
  of silently overwriting a conflicting remote change.
- **Browser-private export**: Print / Save as PDF creates a sanitized print view
  locally; private Markdown never goes to a Marktwin PDF endpoint.
- **Self-hostable**: the backend is a small Node/Express server for static
  serving and ephemeral WebRTC signaling only.

Read the full privacy boundary in [docs/PRIVACY.md](./docs/PRIVACY.md) and the
system architecture in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Project Status

Marktwin is usable, but still early. The core privacy model is the part of the
project that should remain stable: private notes, GitHub tokens, invite secrets,
chat content, and collaboration payloads must not become readable by Marktwin
servers.

See [docs/ROADMAP.md](./docs/ROADMAP.md) for planned work.

## Requirements

- Node.js >=20.19.0
- npm >=10
- A GitHub repository containing Markdown files, or a token permitted to create
  a private repository

No database, queue, object store, or account provider is required.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5001`, connect a repository in `owner/repo` format, and
use configured GitHub OAuth or the advanced personal-access-token path. The
credential needs repository Contents read/write access. Marktwin initially
loads only `.agents`; use the folder selector to add
`Main path` (root-level Markdown) or another top-level folder. Edits, file
operations, captured decisions, and Markdown imports remain staged until the
owner reviews Changes and confirms Sync.

To create the recommended fine-grained GitHub token, see
[docs/TUTORIAL.md](./docs/TUTORIAL.md).

## Configuration

Marktwin runs without a `.env` file. Optional settings are documented in
[.env.example](./.env.example).

Common optional production setting:

```bash
PORT=5001
VITE_GITHUB_OAUTH_CLIENT_ID=your_github_oauth_client_id
```

Without an OAuth client ID, Marktwin truthfully presents the PAT flow as the
available connection method. Fine-grained tokens need Contents read/write;
creating a missing private repository also needs Administration write.

## Production Build

```bash
npm run build
npm start
```

Marktwin needs a long-running Node process because `/signal` uses WebSockets for
ephemeral peer discovery. A VM, VPS, container host, Fly.io, Render, or similar
Node-capable platform works. A pure static host or short-lived serverless
function host is not enough for collaboration.

For production collaboration reliability, configure TURN/STUN servers through
the WebRTC environment variables in [.env.example](./.env.example).

## Development

```bash
npm test
npm run check
npm run build
npm run verify
```

`npm run verify` is the public release gate and runs the Node test suite,
TypeScript, and a production build. There is no linter configured yet; match the
surrounding code style.

## Security

The most important invariant is simple: GitHub tokens and private document data
must not be sent to or stored by the Marktwin server.

Report vulnerabilities privately using [SECURITY.md](./SECURITY.md). Do not open
public issues for security reports.

## Contributing

Contributions are welcome when they preserve the privacy model and keep changes
focused. Start with [CONTRIBUTING.md](./CONTRIBUTING.md), then open a pull
request using the project template.

## License

GPL-3.0-or-later. See [LICENSE](./LICENSE).
