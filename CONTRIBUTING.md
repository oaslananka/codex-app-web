# Contributing

Thanks for helping improve `codex-app-web`.

## Local Setup

```bash
corepack enable
corepack prepare pnpm@11.2.2 --activate
pnpm install --frozen-lockfile
```

Use the repo-declared package manager. Do not add npm, Yarn, or Bun lockfiles.

## Validation

Run the relevant focused check while editing, then the full local gate before review:

```bash
pnpm format:check
pnpm lint
pnpm repo:hygiene:check
pnpm protocol:manifest:check
pnpm protocol:drift:check
pnpm typecheck
pnpm test
pnpm build
pnpm security:scan
pnpm release:state
```

If you touch protocol artifacts, regenerate them with `pnpm protocol:sync:upstream` and include the drift summary in the PR.

## Pull Requests

- Keep changes focused and reproducible.
- Do not commit private prompts, transcripts, scratch files, `.env` files, generated logs, or local build junk.
- Do not weaken approval, file, terminal, auth, CSP, rate-limit, or WebSocket safety defaults.
- Do not disable tests to make CI pass.

## Governance And Support

- Follow the project [Code of Conduct](./CODE_OF_CONDUCT.md).
- Use [GitHub Discussions](https://github.com/oaslananka/codex-app-web/discussions)
  for usage questions and non-actionable design discussion.
- Use issue templates for reproducible bugs, feature requests, documentation
  gaps, release blockers, and public security-safe hardening reports.
- Follow the support and stale policy in [SUPPORT.md](./SUPPORT.md).
- Triage labels and issue flow are documented in
  [docs/governance.md](./docs/governance.md).

## Release Rules

- Use Conventional Commits.
- Do not manually edit release versions, tags, release notes, or changelog
  entries for a release.
- Release automation runs only from
  `oaslananka/codex-app-web`.
- GitHub Release assets are built in CI and include the package tarball, SBOM,
  SHA256 checksums, and provenance attestation.
