# Marktwin

Private, collaborative Markdown notes backed by your GitHub repositories.

Marktwin is a self-hostable web app for opening a GitHub repository as a note
cabinet, editing Markdown in the browser, collaborating over encrypted WebRTC,
and committing changes back to GitHub without a server-side database or account
system.

Hosted version: [marktwin.com](https://marktwin.com)

## Why Marktwin Exists

- **GitHub-backed notes**: your Markdown files stay in repositories you control.
- **No Marktwin accounts**: use a GitHub personal access token or browser-side
  GitHub OAuth PKCE.
- **Private by design**: document content and GitHub credentials are not stored
  by the Marktwin server.
- **Peer-to-peer collaboration**: live updates flow between browsers through
  encrypted WebRTC data channels.
- **Self-hostable**: the backend is a small Node/Express server for static
  serving, ephemeral WebRTC signaling, and on-demand PDF export.

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
- A GitHub repository containing Markdown files

No database, queue, object store, or account provider is required.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5001`, create a cabinet for a repository in
`owner/repo` format, and paste a GitHub token with repository contents read/write
access.

To create the recommended fine-grained GitHub token, see
[docs/TUTORIAL.md](./docs/TUTORIAL.md).

## Configuration

Marktwin runs without a `.env` file. Optional settings are documented in
[.env.example](./.env.example).

Common production settings:

```bash
PORT=5001
PUBLIC_BASE_URL=https://notes.example.com
VITE_GITHUB_OAUTH_CLIENT_ID=your_github_oauth_client_id
```

Use `PUBLIC_BASE_URL` when the server needs to generate absolute URLs, such as
PDF watermark assets. `VITE_API_BASE_URL` is only needed for uncommon split
frontend/backend deployments; leave it empty for same-origin hosting.

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
npm run check
npm run build
npm run verify
```

`npm run verify` is the public release gate and currently runs TypeScript plus a
production build. There is no linter configured yet; match the surrounding code
style.

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
