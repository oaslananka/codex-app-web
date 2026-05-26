# Dependency Policy

This repository keeps direct runtime and development dependencies on the
latest compatible stable release unless a major upgrade requires behavior or
security regression coverage first. Dependency refreshes must update
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, CI package-manager
pins, and local setup documentation together.

Verified on 2026-05-26 against npm registry metadata and the official package
release channels for pnpm, ESLint, Vitest, DOMPurify, ws, Tailwind CSS,
Prettier, typescript-eslint, Playwright, PostCSS, Autoprefixer, happy-dom, and
Marked.

## Intentional Holdbacks

| Package  | Current | Latest stable | Reason                                                                                                                             | Owner       | Revisit                                          |
| -------- | ------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------ |
| `marked` | 17.0.6  | 18.0.4        | Major upgrade. Keep the current parser until markdown rendering and HTML sanitization regression tests cover the breaking upgrade. | @oaslananka | Next dependency refresh after coverage is added. |

## Release-Age Exceptions

The workspace uses pnpm's release-age guard. `minimumReleaseAgeExclude` entries
in `pnpm-workspace.yaml` are allowed only when a direct dependency refresh needs
the current stable version and the package is already part of this repository's
trusted toolchain or runtime surface.

Each exception must be removed during the next dependency refresh after the
release-age window has elapsed, unless a newer stable version replaces it.
