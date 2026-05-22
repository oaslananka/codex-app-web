# Repository Remote Policy

The canonical source, CI/CD, and release authority is:

```text
https://github.com/oaslananka/codex-app-web
```

No secondary mirror is configured for this project. The canonical repository
owns GitHub Actions CI/CD, release, deployment, provenance, SBOM, registry
submission, and security gates.

## Required Remote Shape

- Keep `origin` pointed at `https://github.com/oaslananka/codex-app-web.git`.
- Open PRs only against the canonical repository.
- Do not keep superseded automation PRs or stale branches open after the
  replacement branch already includes their content.
- Remove stale automated suggestion comments from PRs, or minimize submitted
  review timeline items that cannot be deleted.
- Do not run release, deployment, provenance, SBOM, Codecov, registry
  submission, or security-gate side effects from any fork or mirror.

## Local Remote Setup

```bash
git remote set-url origin https://github.com/oaslananka/codex-app-web.git
```

Open a draft PR in the canonical repository and run the validation workflow:

```bash
gh workflow run "CI Validation" \
  --repo oaslananka/codex-app-web \
  --ref automation/upstream-sync-and-release-readiness
```

If GitHub Actions, Codecov, Socket, GitGuardian, Snyk, or another external check
is blocked by account, billing, quota, or organization policy, record the exact
run URL or status URL and do not publish from a local machine.

Azure may remain configured as a secondary validation pipeline, but it is not
the canonical CI/CD, release, deployment, or remote authority for this topology.
