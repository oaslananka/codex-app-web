# Architecture Decision Records

This directory records durable technical decisions for codex-app-web. Each ADR
captures context, decision, and consequences so future changes can adjust the
decision intentionally instead of rediscovering it from git history.

## Index

| ADR                                     | Status   | Decision                                                                               |
| --------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| [0001](0001-repository-authority.md)    | Accepted | GitHub is the canonical repository and release authority.                              |
| [0002](0002-protocol-artifact-sync.md)  | Accepted | Codex app-server protocol artifacts are generated from pinned upstream Codex releases. |
| [0003](0003-release-artifact-model.md)  | Accepted | GitHub Releases publish the guarded package, SBOM, checksums, and provenance.          |
| [0004](0004-local-security-boundary.md) | Accepted | The app defaults to a local-only security boundary with explicit LAN opt-in.           |
