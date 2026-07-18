# Roadmap

Marktwin is early-stage OSS. This roadmap describes the current direction, not a
guaranteed release schedule.

## OSS Hardening

- Expand the current privacy, scoped-sync, recovery, GitHub, and multi-browser
  smoke coverage with axe and visual-regression automation.
- Add a lightweight lint/format setup once the current style is normalized.
- Improve production deployment examples for common Node/container hosts.
- Continue editor-level splitting after the completed route-level split.

## Collaboration Reliability

- Document recommended TURN/STUN production setups.
- Add a supported manual workspace transport; the current `/manual-pair` route
  remains an explicitly isolated technical lab.
- Add durable, encrypted session recovery only after its key lifecycle is clear.

## Workspace Expansion

- Keep the default workspace focused on `.agents` and Markdown while evaluating
  opt-in support for additional agent artifacts and repository assets.
- Add persistent encrypted local drafts only after the current in-memory/P2P
  staging model is stable.
