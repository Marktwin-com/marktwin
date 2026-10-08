# Dependency maintenance

Use Node 22.12 or newer and `npm ci`. The lockfile is committed. The repository
sets `legacy-peer-deps=true` because npm 10's default peer resolver fails on this
dependency graph; clean installation, type checking, and browser integration tests
validate the resolved React 18 combination.

Run `npm run verify` and `npm audit --audit-level=low` before publishing. CI runs
both and scans reachable Git history with Gitleaks. Dependabot checks npm and
GitHub Actions weekly. The audit currently has no advisory exceptions.

## Explicit transitive overrides

Some upstream releases still pin older transitive dependencies. `package.json`
selects patched versions rather than suppressing audit findings:

- Nano ID 3 consumers stay on the patched 3.x release. Nano ID 4 consumers use
  patched 5.x; browser tests exercise drawing and Mermaid rendering.
- Sass uses the current 1.x release to remove its old watcher dependency chain.
- Lodash ES uses patched 4.x. KaTeX uses the same patched version throughout
  Markdown and diagram rendering.
- The typography plugin uses the patched PostCSS selector parser.

Remove each override when upstream dependency ranges permit the patched version.
Keep the drawing, Mermaid, mathematics, and style/browser checks when changing
these pins. Do not use `npm audit fix --force` without reviewing its proposed
upgrades or downgrades.

Tailwind 4 uses its Vite plugin; there is no separate PostCSS configuration.
The interface targets modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+).
