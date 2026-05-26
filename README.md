# codex-app-web

`codex-app-web` is an independent, open-source web interface for Codex app-server workflows. It provides a browser-based control center for working with threads, chat, terminal sessions, files, configuration, approvals, MCP visibility, and runtime diagnostics while staying compatible with existing app-server backends.

This project is independent and community-maintained. It is not affiliated with, endorsed by, or maintained by OpenAI.

**Overview**

The goal of this repository is to make Codex app-server workflows easier to inspect and operate from the browser without changing the backend protocol. It is designed for developer-facing use cases where you want a practical UI for session management, approvals, diagnostics, and workspace interaction, while keeping protocol compatibility and schema-driven behavior intact.

The GitHub repository is the canonical source, CI/CD, and release authority:
`https://github.com/oaslananka/codex-app-web`.

**Core Capabilities**

- Browser-based access to conversation threads and live chat activity
- Terminal execution with streamed output and interactive stdin
- File browsing, editing, copy/remove actions, and path-aware navigation
- Schema-driven config editing with generic fallback support for unknown fields
- Approval flows for commands, file changes, permissions, user input, and auth refreshes
- MCP server visibility, plugin inspection, external agent import, and runtime diagnostics
- Workspace utilities such as fuzzy file search, git diff visibility, and review-thread entry points

**Stack**

- Next.js App Router
- React 19
- Fastify
- WebSocket transport with `ws`
- TypeScript
- pnpm
- Node.js 24 LTS and Node.js 26 Current for supported local development and compatibility validation

**Project Structure**

- [`app/`](./app): Next.js app shell, layout, and entry routes
- [`src/components/`](./src/components): Codex control center UI, overlays, panels, and shared UI primitives
- [`src/lib/`](./src/lib): Runtime, transport, protocol-facing logic, and supporting utilities
- [`src/styles/`](./src/styles): Control center styling, responsive behavior, and overlay/panel presentation
- [`scripts/`](./scripts): Manifest generation, smoke tooling, vendor sync, and local backend helpers
- [`tests/unit/`](./tests/unit): Unit coverage for runtime behavior, protocol handling, overlays, and panel utilities
- [`.github/workflows/ci.yml`](./.github/workflows/ci.yml): GitHub Actions CI and release-authority validation workflow
- [`azure-pipelines.yml`](./azure-pipelines.yml): Secondary Azure validation pipeline
- [`TECH_DEBT.md`](./TECH_DEBT.md): Explicitly accepted debt and known boundaries

**Local Development**

Install dependencies and start the app with a local Codex backend:

```bash
corepack enable
corepack prepare pnpm@11.3.0 --activate
pnpm install
pnpm dev
```

If you want a local backend stub for UI work, start the mock app-server in a second terminal:

```bash
pnpm start:mock-codex
```

The UI server can also be started directly without the helper wrapper:

```bash
pnpm start:ui
```

By default the UI binds to `127.0.0.1`, the Codex backend target is
`ws://127.0.0.1:40000`, and browser WebSocket/API access requires the local
HttpOnly SameSite cookie created by the UI server. Non-browser local clients can
set `CODEX_UI_TOKEN` and send `Authorization: Bearer <token>`.

LAN exposure is opt-in. To expose the UI beyond loopback, set `UI_HOST`,
`ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, and `CODEX_UI_TOKEN` explicitly for the LAN
address. `SHOW_LAN_URLS=1` only controls display of LAN URLs; it does not grant
access.

For local development on a private Windows or LAN workstation, use:

```bash
pnpm dev:lan
```

That command binds the development server to `0.0.0.0` and enables
`DEV_LAN_ACCESS=1`, which accepts private IPv4 LAN Host/Origin values only
while `NODE_ENV=development`. Production LAN deployments still require explicit
`ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, and `CODEX_UI_TOKEN` values.

**Supported Runtime Matrix**

| Surface                                              | Operating systems                     | Node.js            | pnpm   |
| ---------------------------------------------------- | ------------------------------------- | ------------------ | ------ |
| Local development                                    | Windows 11, Ubuntu 24.04 LTS          | 24 LTS, 26 Current | 11.x   |
| CI compatibility matrix                              | `windows-2025-vs2026`, `ubuntu-24.04` | 24, 26             | 11.3.0 |
| Full security, release, and browser-smoke validation | `ubuntu-24.04`                        | 24                 | 11.3.0 |

macOS is not a documented support target yet. Add it here and in the CI matrix before treating it as supported.

**Useful Commands**

```bash
pnpm dev
pnpm start
pnpm start:prod
pnpm start:mock-codex
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm lint
pnpm quality:dead-code
pnpm quality:size
pnpm protocol:manifest:check
pnpm protocol:drift:check
pnpm repo:hygiene:check
pnpm security:bootstrap
pnpm security:scan
pnpm release:state
pnpm smoke
```

**CI/CD and Repository Authority**

- `oaslananka/codex-app-web` is the canonical source, GitHub Actions CI/CD, release, and security-gate authority.
- Azure remains supported through [`azure-pipelines.yml`](./azure-pipelines.yml) only as a secondary validation path; it must not publish, release, or mirror over the canonical GitHub repository.
- The remote policy is documented in [`docs/automation/repository-mirror.md`](./docs/automation/repository-mirror.md).
- Protocol metadata can be validated locally with `pnpm protocol:manifest:check` before opening a change.
- Protocol drift is gated with `pnpm protocol:drift:check`; upstream artifact sync is documented in [`docs/automation/upstream-codex-sync.md`](./docs/automation/upstream-codex-sync.md).
- Dead-code/export drift is gated with `pnpm quality:dead-code`; accepted
  generated-code and public-adapter exclusions live in [`knip.jsonc`](./knip.jsonc).
- Built UI browser assets and the release package tarball are budgeted with
  `pnpm quality:size`. The command expects current `.next` artifacts, creates a
  temporary `dist/quality-size` package tarball, and fails when explicit budgets
  are exceeded.
- Dependency updates are grouped by Dependabot for npm and GitHub Actions through [`.github/dependabot.yml`](./.github/dependabot.yml).
- Review and dependency automation are documented in [`docs/automation.md`](./docs/automation.md).
- GitHub Release is the first guarded release target and is managed by
  release-please from the canonical GitHub repository. Release assets include the
  package tarball, CycloneDX SBOM, SHA256 checksums, and GitHub artifact
  attestations. The release flow is documented in [`docs/RELEASE.md`](./docs/RELEASE.md).

**Local Security Model**

- UI and backend defaults are loopback-only.
- `pnpm build` creates the required production `.next` artifacts. `pnpm start`
  starts the production server from existing artifacts and fails closed if they
  are missing or stale. `pnpm start:prod` is a local convenience command that
  builds first and then starts production.
- Production `pnpm start` starts the web control plane only. Run Codex
  app-server separately and point `CODEX_BACKEND_URL` at that loopback WebSocket
  endpoint. Use `pnpm dev` for the local development helper that orchestrates
  the UI together with a backend command.
- `/api/health` is unauthenticated and intentionally returns only a basic status.
- `/api/config`, `/api/uploads`, and `/ws` require local auth.
- WebSocket upgrades enforce exact `/ws` path matching, Host allowlisting, Origin
  allowlisting, local token authentication, JSON-RPC shape validation, message
  size limits, backend frame validation, backend compression opt-out, heartbeat
  checks, and buffered byte limits. Browser-originated WebSocket frames default
  to 1 MiB (`MAX_WS_PAYLOAD_BYTES`); trusted loopback Codex backend frames use a
  separate 16 MiB cap (`MAX_BACKEND_WS_PAYLOAD_BYTES`) so large protocol
  snapshots remain bounded without weakening browser ingress limits.
- Uploads are limited to common raster image formats. SVG uploads are disabled
  by default. Upload files are written to a per-process temp directory and stale
  temp content is cleaned on startup, periodically, and during shutdown.
- Production CSP keeps `object-src`, `base-uri`, and `frame-ancestors` locked
  down and limits `connect-src` to the local UI origins.
- Reverse proxy HTTPS cookie handling is opt-in. Set `TRUST_PROXY_HEADERS=1`
  only when a trusted TLS proxy overwrites `X-Forwarded-Proto`; otherwise
  forwarded headers are ignored for cookie security decisions.

**Contribution Guidance**

- Prefer incremental, protocol-safe improvements over large speculative rewrites.
- Preserve compatibility with existing Codex app-server backends unless a change is intentionally versioned.
- Keep schema-driven config behavior generic enough to handle unknown or forward-compatible fields.
- Add or update focused tests when runtime behavior, transport behavior, or UI state coordination changes.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm build` before proposing a change.
- If you touch protocol-facing metadata, also run `pnpm protocol:manifest:check`.

**Compatibility Goals**

- Remain compatible with Codex app-server workflows and the surrounding Codex / OpenAI ecosystem at the protocol level
- Avoid backend-specific UI assumptions that would break existing app-server integrations
- Preserve approval handling, config schema fallback behavior, and transport semantics where possible
- Improve presentation and operator ergonomics without rebranding the project as an official vendor product

**License**

This project is available under the MIT License. See [`LICENSE`](./LICENSE).
