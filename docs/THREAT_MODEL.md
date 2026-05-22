# Threat Model

## Scope

`codex-app-web` is a local developer control plane for a Codex app-server
backend. It proxies browser WebSocket traffic and exposes UI flows for terminal,
file, upload, config, approval, auth, MCP, and workspace behavior.

## Assets

- Local filesystem paths and file contents surfaced by the backend
- Terminal command execution and streamed stdin/stdout/stderr
- Approval decisions for commands, file edits, network access, auth, and user
  input
- Runtime configuration and protocol compatibility metadata
- Local UI auth token and SameSite cookie
- Uploaded image attachments staged in the OS temp directory

## Trust Boundaries

- Browser to local UI server over HTTP/WebSocket
- Local UI server to Codex backend WebSocket
- Upload request body to temp-file staging
- User-triggered terminal/file actions to backend protocol requests
- Organization GitHub Actions release workflow to GitHub Release assets

## Attack Surfaces

- Cross-site WebSocket hijacking through missing Origin checks
- DNS rebinding or Host header abuse against a local privileged service
- Unauthenticated privileged API access
- Oversized WebSocket or upload payloads causing memory pressure
- Malformed JSON-RPC payload forwarding
- SVG/scriptable image uploads
- Broad CSP allowing unexpected network targets
- Platform-specific terminal command wrapping
- Manual or local release artifact publication

## Mitigations

- The UI binds to `127.0.0.1` by default.
- Codex backend URL defaults to `ws://127.0.0.1:40000`.
- `/ws` requires exact path matching, allowed Host, allowed Origin, local token
  auth, `ws` max payload configuration, byte-size checks before JSON parsing,
  JSON-RPC shape validation, and byte-based buffering limits.
- `/api/config` and `/api/uploads` require the same local auth model.
- `/api/health` is unauthenticated but intentionally returns only a basic status.
- Uploads are limited to raster image extensions with matching MIME and magic
  bytes. SVG is disabled by default.
- Temp uploads are created with mode `0600` and cleaned periodically.
- CSP blocks object embedding, framing, and base URI changes, and narrows
  `connect-src` to local UI origins.
- Terminal command wrapping is platform-aware.
- Release automation derives versions and tags from release-please outputs and
  builds assets only in canonical GitHub Actions.

## LAN Mode

LAN mode is not enabled by `SHOW_LAN_URLS`. The `pnpm dev:lan` helper sets
`DEV_LAN_ACCESS=1`, which accepts private IPv4 LAN Host/Origin values only for
development sessions bound to `0.0.0.0`. In production, operators must
explicitly set `UI_HOST`, `ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, and
`CODEX_UI_TOKEN` for the LAN address. Keep the Codex backend loopback-only
unless there is a separate, reviewed network boundary.
