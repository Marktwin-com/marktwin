# Roadmap

Marktwin is early-stage OSS. This roadmap describes the current direction, not a
guaranteed release schedule.

## Full Cabinet P2P Sync

The next major feature is a distributed file-tree synchronization engine. The
repository owner's browser acts as the bridge to GitHub while collaborators edit
the shared cabinet over encrypted WebRTC.

Initial constraints:

- Limit shared cabinets to 20 files to keep memory and synchronization costs
  predictable.
- Temporarily disable active file renaming while collaborators are connected.
- Keep GitHub commits owner-controlled: only the owner syncs the modified P2P
  file tree back to GitHub.

## OSS Hardening

- Add focused automated tests around the privacy boundary, signaling, and GitHub
  sync behavior.
- Add a lightweight lint/format setup once the current style is normalized.
- Improve production deployment examples for common Node/container hosts.
- Reduce client bundle size through route-level or editor-level code splitting.

## Collaboration Reliability

- Document recommended TURN/STUN production setups.
- Improve reconnection and session recovery behavior for restrictive networks.
- Keep manual pairing available as the highest-privacy fallback path.
