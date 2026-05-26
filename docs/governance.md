# Governance

This repository is maintained through GitHub issues, pull requests, branch
protection, and documented labels. GitHub Issues are the canonical work queue
for bugs, features, documentation gaps, release blockers, and governance tasks.

## Triage Flow

1. Confirm the issue belongs in this repository and does not contain secrets.
2. Add one `area:*`, one `type:*`, one `priority:*`, and one `risk:*` label.
3. Ask for missing reproduction, environment, or acceptance details when needed.
4. Assign an owner when work is ready to start.
5. Link pull requests with `Closes #N`, `Fixes #N`, or `Resolves #N`.
6. Close issues only after validation evidence is present in the issue or PR.

Security-sensitive reports with exploit details, credentials, private logs, or
private prompts must be moved to a private GitHub Security Advisory or another
private maintainer channel before public discussion continues.

## Label Taxonomy

Priority labels:

| Label         | Meaning                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| `priority:P0` | Immediate blocker for security, release, public install, CI, or package integrity |
| `priority:P1` | Major compatibility, product, governance, or operational gap                      |
| `priority:P2` | Quality, testing, developer experience, or maintainability improvement            |
| `priority:P3` | Polish, demo, community, or future roadmap improvement                            |

Area labels:

| Label                | Meaning                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `area:release`       | Release automation, changelog, tags, artifacts, provenance, and publishing       |
| `area:ci`            | Continuous integration, workflow reliability, branch checks, and automation      |
| `area:security`      | Security scanning, disclosure, supply chain, secrets, and vulnerability handling |
| `area:docs`          | README, generated documentation, guides, API docs, and release notes             |
| `area:compatibility` | Runtime, OS, browser, protocol, and upstream compatibility                       |
| `area:testing`       | Unit, integration, E2E, accessibility, mutation, and regression testing          |
| `area:packaging`     | Installers, package manifests, artifact parity, and distribution metadata        |
| `area:dx`            | Local development workflow, contributor tooling, and automation ergonomics       |
| `area:infra`         | Infrastructure, repository settings, external services, and hosted automation    |
| `area:governance`    | Community standards, support policy, labels, triage, ownership, and project flow |

Type labels:

| Label              | Meaning                                      |
| ------------------ | -------------------------------------------- |
| `type:bug`         | Incorrect or failing behavior                |
| `type:enhancement` | New or expanded capability                   |
| `type:task`        | Operational or maintenance task              |
| `type:docs`        | Documentation task                           |
| `type:security`    | Security-sensitive task or vulnerability fix |

Risk labels:

| Label         | Meaning                                            |
| ------------- | -------------------------------------------------- |
| `risk:high`   | High impact if delayed or implemented incorrectly  |
| `risk:medium` | Moderate operational, product, or maintenance risk |
| `risk:low`    | Low immediate risk                                 |

## Stale And Support Policy

Support routing and stale handling are documented in
[`../SUPPORT.md`](../SUPPORT.md). Do not add stale automation until the workflow
has been reviewed against the current label taxonomy and branch-protection
requirements.
