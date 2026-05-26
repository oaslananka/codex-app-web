# Automation

This repository uses automation that can be reviewed from source control.

## Pull Request Review

- CodeRabbit is configured in [`.coderabbit.yaml`](../.coderabbit.yaml).
- Automatic reviews are disabled by default.
- Review can be requested explicitly with the configured `coderabbit:review`
  keyword.
- Generated docstring, unit-test, and simplification suggestions are disabled
  to keep automated feedback focused on review comments.

CodeRabbit configuration follows the version-controlled repository settings
model documented by CodeRabbit.

## Dependency Updates

- Dependabot version updates are configured in
  [`.github/dependabot.yml`](../.github/dependabot.yml).
- npm runtime, test, and tooling updates are grouped separately.
- GitHub Actions updates are grouped separately.
- Cooldowns reduce noisy update churn while still allowing patch updates to
  arrive sooner than larger changes.

Dependabot is used instead of Renovate in this repository because GitHub-native
version updates already cover the npm and GitHub Actions ecosystems in use here,
and the current repository does not need cross-registry or custom datasource
rules.

## Workflow Security

- GitHub Actions are pinned to full commit SHAs.
- `pnpm repo:hygiene:check` enforces SHA-pinned external actions.
- `pnpm security:bootstrap` installs pinned local scanner binaries under
  `.tools/security/bin` with SHA-256 verification.
- `pnpm security:actions` runs `actionlint` and `zizmor --offline`.
- `pnpm security:secrets` runs `gitleaks` with repository policy.
- `pnpm security:trivy` runs a filesystem scan for vulnerabilities, secrets,
  and misconfiguration.

Run `pnpm security:bootstrap` once before local scans. The same bootstrap path
is used by the primary CI, scorecard, and release workflows.

These checks are part of `pnpm security:scan` and the primary CI workflow.

## Quality Regression Gates

- `pnpm quality:dead-code` runs Knip to detect unused files, dependencies,
  exports, and exported types. Accepted generated-code and adapter-surface
  exclusions are documented in [`knip.jsonc`](../knip.jsonc).
- `pnpm quality:size` checks explicit byte budgets for built browser assets and
  the release package tarball. Run `pnpm build` first so `.next/static` reflects
  the current source tree.
- The primary CI runs the dead-code gate in Cheap Gates and the size gate after
  the production build in Full Validation.
