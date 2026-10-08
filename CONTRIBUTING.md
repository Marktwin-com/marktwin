# Contributing to Marktwin

Thanks for taking an interest in Marktwin. This is a small, opinionated project —
keep that in mind before sending large refactors.

## Getting started

```bash
npm ci
npm run dev
```

Then open `http://localhost:5001`. No database or account is required: paste a
GitHub personal access token directly in the app to open a repository.

See [.env.example](./.env.example) for optional configuration (GitHub OAuth, custom
WebRTC ICE servers).

## Before opening a PR

```bash
npm run verify
npm audit --audit-level=low
```

This runs Node and Vitest unit suites, Chromium integration tests, TypeScript, a production build, and the client bundle check. There is no linter configured yet —
match the surrounding code style.

## Guidelines

- Keep the privacy model intact: document content and GitHub tokens must never be
  sent to or stored on the server. See [docs/PRIVACY.md](./docs/PRIVACY.md).
- Prefer small, focused PRs over large ones.
- Describe the *why* in your PR description, not just the *what*.
- Follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Reporting bugs / requesting features

Open a GitHub issue. For security issues, see [SECURITY.md](./SECURITY.md) instead.

See [dependency maintenance](docs/DEPENDENCIES.md) for the security pins and CI checks.
