# Marktwin

**Craft, together.**

Marktwin is my hobby project for working together on Markdown files that stay in your GitHub repositories.

Edit, discuss and review changes together, then sync them back to GitHub. Your files stay yours.

Try it free at [marktwin.com](https://marktwin.com).

If you have feedback or wish it did something more, let me know. It gives me another reason to procrastinate and work on it.

## What you can do

- Edit Markdown and other supported text files, JSON Canvas boards, and Excalidraw drawings in GitHub-backed Cabinets.
- Search files and content, capture ideas, connect artifacts, and record decisions alongside the work.
- Collaborate through encrypted WebRTC sessions with separate editor and viewer invitations, chat, and presence. Only the owner publishes to GitHub.
- Review staged changes and publish one Git commit with **Checkpoint**. Non-overlapping changes can merge automatically; conflicts remain available for explicit review.
- Recover unfinished drafts from browser-local IndexedDB. Recovery is enabled by default and can be disabled or cleared in Cabinet settings.
- Choose themes, languages, editor preferences, and a local collaboration name and color.
- Print Markdown or save it as PDF in the browser without uploading it to a rendering service.

## Self-hosted architecture

This edition needs no Marktwin account, database, email provider, or hosted service.
The Node/Express server serves the app and provides ephemeral WebRTC signaling.
GitHub credentials stay in browser session storage; private repository contents
move directly between the browser and GitHub or encrypted collaboration peers.
Saved Cabinets and preferences stay in local storage. Product telemetry is disabled.

See [architecture](docs/ARCHITECTURE.md) and [privacy](docs/PRIVACY.md).

## Requirements and quick start

- Node.js **22.12 or newer** (Node 22 LTS is used in CI)
- npm **10 or newer**
- A modern browser: Safari 16.4+, Chrome 111+, or Firefox 128+
- A GitHub repository and a token with the required repository permissions

```bash
npm ci
npm run dev
```

Open `http://localhost:5001`. The root URL opens Cabinets directly. Add an
`owner/repository` connection, open it, and enter a GitHub personal access token.
Choose the branch and repository scopes when first configuring the Cabinet.
Marktwin prefers `.agents` when available; otherwise it offers the repository
root. **Main path includes the repository and its descendant folders**.
Markdown/text, Canvas, and Drawing are always available; images and other assets
follow the workspace configuration.

Edits remain staged until Checkpoint unless you explicitly enable automatic sync.
A fine-grained token needs Contents read/write for publishing. Creating a missing
private repository also needs Administration write; see the [token tutorial](docs/TUTORIAL.md).

## Configuration

Copy [.env.example](.env.example) to `.env` if you need overrides. Default local
startup requires no configuration.

- `PORT`: application port, default `5001`.
- `HMR_HOST`: optional development reverse-proxy override.
- `VITE_GITHUB_OAUTH_CLIENT_ID`: preserves the optional browser OAuth PKCE path.
  It requires a provider configuration that supports browser token exchange.
  Without it, the UI offers the PAT flow. There is no server OAuth proxy or client secret.
- `VITE_STUN_URLS`, `VITE_TURN_URLS`, `VITE_TURN_USERNAME`,
  `VITE_TURN_CREDENTIAL`, or `VITE_WEBRTC_ICE_SERVERS`: optional ICE configuration.
  These are browser-visible build settings; never put a TURN shared signing secret in them.

TURN is not required to start the app, but many network combinations require a
relay for reliable collaboration. Use a relay you operate or trust and configure
appropriate access limits. The app does not contact the hosted Marktwin ICE API.
Rebuild after changing `VITE_*` values.

## Production

```bash
npm run build
npm start
```

Use HTTPS and a long-running Node process with WebSocket upgrades for `/signal`.
A static-only host or short-lived function cannot provide signaling. Configure
TURN before relying on collaboration across different networks. The production
server does not require PostgreSQL or hosted account configuration.

## Development and validation

```bash
npm run verify
```

This runs the public Node unit tests, ported Vitest suites, Chromium integration
checks, TypeScript, a production build, and the initial-bundle budget check.
Browser tests use an in-memory GitHub fixture; they do not publish real commits.
`npm ci` uses the checked-in peer-resolution setting to avoid npm 10's resolver
failure with this dependency graph.

## Upgrading existing installations

Saved Cabinets are upgraded locally without changing their IDs, branches, or
selected scopes. Existing Cabinet URLs and session token keys remain supported.
New configuration fields get conservative defaults: automatic sync is off unless
already enabled. The new Main path scope includes descendants; review the scope
selection if an older installation used it only for root-level Markdown files.
Save or publish work in old open tabs before reloading into the new edition;
live sessions should use matching application versions.

## Contributing and security

Project planning is maintained privately by the owner. Feature requests and
implementation proposals belong in [GitHub Issues](https://github.com/OptimAI-labs/marktwin/issues).
See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

Dependency updates and security checks are documented in [dependency maintenance](docs/DEPENDENCIES.md).
