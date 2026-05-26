# Release Readiness

This repository is an app/control-plane project. Its first configured production
release target is GitHub Release from the canonical GitHub repository. It must not
publish to npm, PyPI, DockerHub, GHCR, a marketplace, or any other registry
unless a repository owner explicitly adds that release surface and the CI
release-state check detects it.

Release, deployment, provenance, SBOM, Codecov, registry submission, and
security-gate side effects must run only from the canonical GitHub repository:

```text
https://github.com/oaslananka/codex-app-web
```

Run the release-state check before any publish attempt:

```bash
pnpm release:state
```

The safe production path is the guarded release job in GitHub Actions. It must
publish only after release-please creates a release
and must include:

- validation gates that already passed from clean source,
- least-privilege credentials stored in the CI provider,
- release artifact checksums and SBOM output where artifacts are produced,
- provenance or artifact attestations where the platform supports them.

The release flow is documented in [`../RELEASE.md`](../RELEASE.md).

## Default Branch Protection

`main` is the protected release authority branch. Changes must land through a
pull request with an up-to-date branch and resolved conversations before merge.
Linear history is required, force pushes and branch deletion are blocked, and
CODEOWNERS review is required for protected paths.

The required status checks are:

- `Cheap Gates`
- `Full Validation`
- `CodeQL`
- `Filesystem Security`
- `Runtime Matrix (ubuntu-24.04 / Node 24)`
- `Runtime Matrix (ubuntu-24.04 / Node 26)`
- `Runtime Matrix (windows-2025 / Node 24)`
- `Runtime Matrix (windows-2025 / Node 26)`
- `Scorecard`

Repository administrators may repair repository settings and failed automation,
but normal feature, fix, documentation, and release-readiness changes should use
the same pull request path as external contributors.

## Scorecard Policy

The OSSF Scorecard workflow enforces a repository aggregate threshold and
requires the security-critical checks for pinned dependencies, workflow safety,
token permissions, SAST, vulnerability status, license, security policy,
dependency updates, and binary artifact hygiene to satisfy explicit minimum
scores. `Signed-Releases` is monitored as an advisory Scorecard signal because
GitHub Release asset presence, checksums, and Sigstore-backed artifact
attestations are enforced by the release workflow. An omitted, inconclusive, or
below-target `Signed-Releases` result must be reviewed, but the release
workflow's checksum and attestation gates remain the primary enforcement
mechanisms.

The aggregate threshold is currently set to `6.6` because several upstream
Scorecard checks are intentionally or temporally not maximized for this
repository:

- `Maintained` is reduced while the public repository is younger than 90 days.
- `Code-Review` reflects the current zero-required-review policy.
- `CI-Tests` is history-based and improves as more checked pull requests are
  merged.
- `Contributors`, `Fuzzing`, and `CII-Best-Practices` are maturity signals, not
  release blockers for the local control-plane artifact.
- `Signed-Releases` is advisory while release integrity is enforced by the
  release workflow's asset presence, checksum, and artifact attestation gates.

Do not lower the threshold when a security-critical check regresses. Raise it as
the historical and maturity checks improve.
