# Upstream Codex App-Server Sync

This repository tracks OpenAI Codex app-server protocol artifacts as generated files, not as a git submodule. The sync source is the upstream `openai/codex` repository and a concrete Codex CLI release tag.

Verified on 2026-05-26:

- OpenAI Codex app-server README: `codex app-server generate-ts --out DIR` and `codex app-server generate-json-schema --out DIR` generate version-matched artifacts. The stable surface is the default; `--experimental` is an explicit opt-in.
- GitHub Actions workflow syntax supports `workflow_dispatch`, `schedule`, `pull_request`, `push`, `workflow_run`, `permissions`, `concurrency`, and job timeouts. Job-level `contents:write` and `pull-requests:write` permissions are enough for the sync job when repository workflow permissions allow Actions-created pull requests.
- GitHub's Node 20 runner deprecation notice requires migration toward Node 24-compatible JavaScript actions.
- Azure hosted images include explicit `ubuntu-24.04`, which this repository uses instead of mutable `ubuntu-latest`.
- pnpm `--frozen-lockfile` fails when the lockfile and manifest are out of sync, which is the desired CI behavior.

## Local Sync

```bash
corepack enable
corepack prepare pnpm@11.3.0 --activate
pnpm install --frozen-lockfile
pnpm protocol:sync:upstream -- --upstream-ref rust-v0.129.0
pnpm protocol:manifest:check
pnpm protocol:drift:check
```

PowerShell uses the same commands. `CODEX_BIN` may be set when the `codex` executable is not on `PATH`.

## Generated Files

The sync updates only protocol-derived files and metadata:

- `codex-official-docs/generate-ts/**`
- `codex-official-docs/generate-json-schema/**`
- `codex-official-docs/upstream-metadata.json`
- `src/lib/codex-runtime/official-manifest.generated.ts`

The metadata file records the upstream ref, full upstream commit SHA, inspected upstream path, Codex CLI version, generation commands, and whether experimental API generation was enabled.

## Drift Gate

`pnpm protocol:drift:check` compares generated protocol surface against the base ref. It reports request methods, notifications, server requests, config fields, and categorized payload drift for approval, terminal, file, auth, MCP, app/plugin/skills, config, and experimental surfaces.

Breaking drift must include a companion runtime, UI, test, or automation change. This keeps pure artifact refreshes from silently changing a security-sensitive protocol surface.

## Scheduled PR Workflow

`.github/workflows/upstream-codex-sync.yml` runs on weekdays at a non-round minute and can also be dispatched manually. It updates the single branch `upstream/sync-openai-codex-app-server` and opens or updates one draft PR titled `chore(protocol): sync OpenAI Codex app-server artifacts`.

The repository must keep the default `GITHUB_TOKEN` permission mode at read-only and enable the separate Actions setting that allows workflows to create and approve pull requests. The checked configuration is:

```bash
gh api repos/oaslananka/codex-app-web/actions/permissions/workflow \
  --jq '{default_workflow_permissions, can_approve_pull_request_reviews}'
```

```powershell
gh api repos/oaslananka/codex-app-web/actions/permissions/workflow `
  --jq '{default_workflow_permissions, can_approve_pull_request_reviews}'
```

The expected result is `default_workflow_permissions: read` and `can_approve_pull_request_reviews: true`. To restore that state:

```bash
gh api -X PUT repos/oaslananka/codex-app-web/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=true
```

```powershell
gh api -X PUT repos/oaslananka/codex-app-web/actions/permissions/workflow `
  -f default_workflow_permissions=read `
  -F can_approve_pull_request_reviews=true
```

If repository or organization policy cannot allow Actions-created pull requests, configure `UPSTREAM_SYNC_TOKEN` as a fine-grained PAT or GitHub App token with minimal contents write and pull request write access. The workflow falls back to `GITHUB_TOKEN` only when that secret is absent.

The workflow is idempotent: if the sync branch already exists, it is merged forward onto the current default branch, pushed when that merge changes the branch head, and then used to update the existing open draft PR or create one when none exists.
