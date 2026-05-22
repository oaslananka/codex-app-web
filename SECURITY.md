# Security Policy

## Supported Surface

Security fixes are accepted for the default branch and the latest released
GitHub Release source state. This project is an independent Codex app-server web
control center and is not an official OpenAI product.

## Reporting

Do not open public issues containing secrets, tokens, private prompts, logs with credentials, or exploit details. Report sensitive findings privately to the repository owner through GitHub security advisories when available, or by a private contact channel listed on the repository profile.

## Expectations

- Do not place OpenAI API keys, ChatGPT tokens, refresh tokens, SSH keys, PATs, registry tokens, Azure service connection credentials, or GitHub App keys in issues, PRs, logs, screenshots, or fixtures.
- Keep terminal execution, file operations, approval handling, auth, MCP, plugin, and workspace behavior protocol-compatible.
- Keep LAN/dev exposure opt-in and documented.
- Run `pnpm format:check`, `pnpm lint`, `pnpm repo:hygiene:check`, `pnpm protocol:manifest:check`, `pnpm protocol:drift:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm security:scan`, and `pnpm release:state` before requesting review.

## Local Exposure Model

The default runtime is local-only:

- `UI_HOST=127.0.0.1`
- `CODEX_BACKEND_URL=ws://127.0.0.1:40000`
- `ALLOWED_HOSTS=127.0.0.1:1989,localhost:1989`
- `ALLOWED_ORIGINS=http://127.0.0.1:1989,http://localhost:1989`

The server generates a high-entropy local UI token at startup when
`CODEX_UI_TOKEN` is not set and stores it only in an HttpOnly SameSite=Strict
browser cookie. The token is not committed or written to disk. Non-browser local
clients should set `CODEX_UI_TOKEN` and authenticate with a Bearer token.

Production LAN mode requires all of the following to be set intentionally:
`UI_HOST`, `ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, and `CODEX_UI_TOKEN`.
`SHOW_LAN_URLS=1` only prints reachable-looking LAN URLs; it is not an
access-control setting. The `pnpm dev:lan` helper additionally sets
`DEV_LAN_ACCESS=1`, which accepts private IPv4 LAN Host/Origin values in
development mode only and is ignored when `NODE_ENV=production`.

## Protected Surfaces

- `/api/health` is unauthenticated and discloses only a basic status.
- `/api/config` and `/api/uploads` require local auth.
- `/ws` requires exact path matching, allowed Host, allowed Origin, local token
  auth, max payload enforcement, JSON-RPC validation, and byte-based buffering
  limits. Browser-to-UI frames and loopback Codex-backend frames have separate
  byte caps so browser ingress remains tight while backend protocol snapshots
  are still bounded.
- Uploads accept raster image formats only. SVG upload is disabled by default.
- Production CSP restricts object embedding, framing, base URI, and network
  targets to the local UI origins.

## Secret Handling

Never commit `.env` files, private keys, registry tokens, PATs, OpenAI keys,
ChatGPT tokens, refresh tokens, Azure service connection credentials, or GitHub
App credentials. If a credential is exposed, remove it from the repository,
rotate it, and verify that history and release artifacts no longer contain it.

## Reverse Proxy Deployments

The application ignores `X-Forwarded-*` headers by default. If the UI is served
behind a trusted TLS reverse proxy, configure the proxy to overwrite
`X-Forwarded-Proto` and set `TRUST_PROXY_HEADERS=1`. In that mode the local auth
cookie is marked `Secure` when the trusted proxy reports HTTPS. Do not enable
proxy trust on a directly exposed or untrusted network listener.

Production starts require existing Next.js build artifacts. Run `pnpm build`
before `pnpm start`; missing or stale artifacts stop startup with a non-zero
exit so the app does not silently run development mode in production.
