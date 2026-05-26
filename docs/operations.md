# Operations

`codex-app-web` is intended to run as a local or private Node/Fastify
service with a Next.js custom server and WebSocket proxy.

## Supported Runtime Matrix

| Surface                                              | Operating systems              | Node.js            | pnpm   |
| ---------------------------------------------------- | ------------------------------ | ------------------ | ------ |
| Local development                                    | Windows 11, Ubuntu 24.04 LTS   | 24 LTS, 26 Current | 11.x   |
| CI compatibility matrix                              | `windows-2025`, `ubuntu-24.04` | 24, 26             | 11.2.2 |
| Full security, release, and browser-smoke validation | `ubuntu-24.04`                 | 24                 | 11.2.2 |

macOS is not a documented support target until the repository adds matching CI coverage.

## Production Start

Build first:

```bash
pnpm build
```

Start from the existing production artifacts:

```bash
pnpm start
```

The production process refuses to start if required `.next` artifacts are
missing or stale. Development fallback is available only outside production or
when `ALLOW_NEXT_DEV_FALLBACK=1` is set for a local development session.

`pnpm start` runs only the web control plane. In production, start the Codex
app-server backend as a separate local service and set `CODEX_BACKEND_URL` to
its loopback WebSocket endpoint. For local development, use `pnpm dev` when you
want the helper wrapper to orchestrate both the UI and backend command.

## Private Network Exposure

For local development on a trusted private network:

```bash
pnpm dev:lan
```

That helper binds the development UI to `0.0.0.0`, logs private LAN URLs, and
accepts private IPv4 LAN Host/Origin values only while `NODE_ENV=development`.

Loopback is the default. For private LAN use, set all of the following
explicitly in production:

```text
UI_HOST=0.0.0.0
ALLOWED_HOSTS=<trusted-host>:1989
ALLOWED_ORIGINS=https://<trusted-host>
CODEX_UI_TOKEN=<local-only high-entropy token>
```

Use TLS termination and network access controls before exposing the service
beyond loopback.

## Reverse Proxy

By default the server does not trust `X-Forwarded-*` headers. Behind a trusted
TLS reverse proxy that overwrites forwarded headers, set:

```text
TRUST_PROXY_HEADERS=1
```

With proxy trust enabled, `X-Forwarded-Proto: https` is allowed to trigger the
`Secure` cookie attribute. Without proxy trust, only direct TLS sockets are
treated as secure.

## Upload Temp Data

Uploads are written below a per-process directory inside the configured upload
root. Startup removes stale directories from previous processes, periodic
cleanup removes stale files inside the active process directory, and shutdown
removes the active process directory. The cleanup helpers only remove paths
contained by the upload root.
