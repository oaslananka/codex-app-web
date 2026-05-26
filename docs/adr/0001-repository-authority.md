# ADR 0001: Repository Authority

## Status

Accepted

## Context

The project has GitHub Actions, release automation, issues, pull requests, and
security scanning attached to `oaslananka/codex-app-web`. Azure is retained as a
secondary validation path, but it must not publish or override canonical release
state.

## Decision

GitHub is the canonical source of truth for repository state, issues, pull
requests, branch protection, CI/CD, and release publication. Azure may validate
the same source tree, but GitHub owns release and governance decisions.

## Consequences

- GitHub Issues remain the implementation queue and audit trail.
- Pull requests must pass GitHub-required checks before merge.
- Release evidence is gathered from GitHub Releases and GitHub Actions.
- Azure configuration must mirror validation expectations without introducing a
  competing release path.
