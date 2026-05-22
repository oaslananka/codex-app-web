# Plan

## Assumptions made during analysis

- [LOAD-BEARING] The canonical repository is `oaslananka/codex-app-web`.
- [LOAD-BEARING] The project remains an independent web control plane for Codex app-server workflows.
- The project is an application with a custom Node/Fastify server and a Next.js App Router UI, not a registry-published library.
- The first configured release surface remains GitHub Release assets only; npm, GHCR, and static hosting stay out of scope until explicitly added.
- The empty GitHub repository requires one bootstrap commit on `main` before normal pull-request flow can start.

## Inventory

- Primary language: TypeScript with supporting CommonJS and ESM Node scripts.
- Runtime: Node.js 24, pnpm 11.2.2, Next.js App Router, React 19, Fastify 5, `ws`.
- Package manager: pnpm, declared in `package.json` and locked by `pnpm-lock.yaml`.
- Test framework: Vitest with V8 coverage thresholds in `vitest.config.ts`.
- Browser automation: Playwright used by smoke tooling.
- CI provider: GitHub Actions primary workflows in `.github/workflows/`; Azure pipeline kept as secondary validation.
- Release setup: release-please manifest mode, GitHub Release asset workflow, CycloneDX SBOM, SHA256 checksums, artifact attestations.
- Security posture: CodeQL, OSSF Scorecard, actionlint, zizmor, gitleaks, Trivy, CODEOWNERS, issue templates, PR template, Dependabot.
- Documentation: README, CONTRIBUTING, SECURITY, TECH_DEBT, release, operations, threat model, and automation docs.
- Maturity stage: mature local-control-plane app with a newly bootstrapped canonical remote and active branch protection.
- File inventory: 921 text candidates excluding build/vendor/cache directories; main source/documentation subset includes 72 `.ts`, 21 `.tsx`, 8 `.mjs`, 5 `.cjs`, 7 `.md`, 7 `.yml`, 6 `.css`, 1 `.py`, and 1 `.svg`.

## Current state assessment

Strengths:

- `package.json` already declares a current Node 24 and pnpm 11 toolchain.
- `tsconfig.json` enables strict TypeScript checks, `noUncheckedIndexedAccess`, `noImplicitReturns`, and `isolatedModules`.
- `vitest.config.ts` enforces coverage thresholds and excludes generated protocol files.
- `.github/workflows/*.yml` uses explicit `ubuntu-24.04`, SHA-pinned actions, CodeQL, Scorecard, release asset checks, and artifact attestations.
- `scripts/check-repository-hygiene.mjs` enforces pinned actions and local repository hygiene.
- `scripts/check-release-state.mjs` verifies release-please and release asset invariants.
- `main` branch protection now requires the CI, CodeQL, filesystem security, and Scorecard contexts before merge.

Weaknesses and gaps:

- The local repository initially had no commit and the remote had no default branch, so the first push could not use PR flow.
- Project identity still referenced `codex-app-server-web` across package metadata, docs, release asset names, temp directories, and runtime client info.
- Documentation described an obsolete org-plus-personal-mirror topology even though the target repo is `oaslananka/codex-app-web`.
- `docs/automation.md` was missing, so reviewer and dependency automation intent was spread across `.coderabbit.yaml` and `.github/dependabot.yml`.
- The full validation suite depends on external tools (`actionlint`, `zizmor`, `gitleaks`, `trivy`) that may not be installed locally on a new workstation.
- OSSF Scorecard can report closed or auto-dismissed Dependabot alerts before its aggregate score catches up; the Scorecard workflow now pairs the metric with a current Trivy vulnerability scan.

## Best-practices benchmark

- Node.js 24 LTS: official Node release schedule shows Node 24 as the active LTS line for the project window; keep engines at `>=24 <27`.
- pnpm 11.2.2: the declared package manager is current for the repository and supports deterministic frozen-lockfile CI installs.
- Next.js 16.2.6: official Next.js release notes and GitHub releases show the 16.2 line as current for App Router projects.
- React 19.2: official React versions page lists 19.2 as the latest stable release line.
- TypeScript 6.0: official TypeScript 6.0 release notes make it the stable compiler line before the native compiler transition.
- ESLint 10: official ESLint version-support docs mark v10 as the current maintained line.
- Vitest 4.1: official Vitest 4.1 release notes cover current Vite-era test runner behavior and V8 coverage support.
- Playwright 1.59: the official Playwright repository lists 1.59.1 as the current release used for browser smoke work.
- GitHub Actions Node 24 runtime: GitHub Actions changelog requires migration away from Node 20 JavaScript actions; workflows should use Node 24-compatible actions.
- `actions/checkout` v5 and `actions/setup-node` v6: official action repositories document Node 24 runtime support.
- CodeQL Action v4: official CodeQL action guidance uses v4 for the Node 24 runtime transition.
- actionlint 1.7.12, zizmor 1.24, gitleaks 8.30, and Trivy 0.70: official repositories/releases show maintained security tooling compatible with the current workflow checks.
- CodeRabbit plus Dependabot: CodeRabbit supports repository YAML configuration; GitHub Dependabot supports npm and GitHub Actions version update automation from `.github/dependabot.yml`.

## Feature gap analysis

### P0

- Bootstrap canonical repository identity. Why it matters: CI, release, changelog links, and package artifacts must agree on the repo and package name. Estimate: M.
- Verify the full local gate. Why it matters: the project should not ship with stale lockfiles, skipped type checks, or broken release-state assumptions. Estimate: M.
- Push the first `main` commit. Why it matters: the remote has no default branch, so PR workflow cannot start until `main` exists. Estimate: S.

### P1

- Add automation documentation. Why it matters: reviewer and dependency automation behavior should be discoverable from source control. Estimate: S.
- Confirm GitHub Actions run on the canonical repository. Why it matters: old repository guards would skip all CI jobs. Estimate: S.
- Confirm release artifact names follow the package name. Why it matters: release verification depends on exact tarball, SBOM, and attestation names. Estimate: S.

### P2

- Add a deterministic browser smoke scenario for one approval or turn-start happy path. Why it matters: the current smoke suite is intentionally lean. Estimate: M.
- Ratchet coverage thresholds after identity migration is stable. Why it matters: the current thresholds are real but conservative. Estimate: M.
- Keep branch protection aligned with real check names. Why it matters: protection should reference stable contexts from actual runs. Estimate: S.

### P3

- Split runtime bootstrap coordination in `src/lib/codex-ui-runtime.ts`. Why it matters: the module remains the largest runtime coordination surface. Estimate: L.
- Add purpose-built approval rendering for advanced permission families. Why it matters: current generic rendering is compatible but less ergonomic. Estimate: L.
- Move CSP inline allowances toward nonce or hash coverage after hydration smoke coverage exists. Why it matters: stricter CSP needs browser proof before rollout. Estimate: L.

## Architecture and code quality audit

- Layering: UI panels live under `src/components/codex`, shared UI under `src/components/ui`, protocol/runtime logic under `src/lib/codex-runtime`, server boundary under `src/lib/server`, and custom server bootstrap in `server.cjs`.
- Dependency direction: React components consume runtime hooks and services; server code remains outside browser bundles; generated protocol artifacts are isolated under `codex-official-docs`.
- Test pyramid gaps: unit tests cover services, state, UI utilities, and selected panels; browser smoke exists but does not yet cover a deterministic approval flow.
- CI gaps: workflow coverage is broad; check contexts are now protected after the first remote run established their exact names.
- Release engineering gaps: GitHub Release assets, SBOM, checksums, and attestations are configured; release must stay disabled from local/manual tag creation.
- Security gaps: scans are configured, but local availability of external binaries must be checked during bootstrap.
- Dependency security gap found during bootstrap: Trivy and GitHub Dependabot identified vulnerable `ws` and `brace-expansion` versions; both were remediated before final validation.
- Documentation gaps: automation documentation was missing; remote policy needed canonical repo wording.
- Repository hygiene gaps: empty remote/default branch state blocked PR-first execution.

## Milestones

### M0 — Repository identity

Goal: make every user-facing and release-facing repository identity align with `codex-app-web` and `oaslananka/codex-app-web`. Done when package metadata, docs, runtime identifiers, temp prefixes, release asset names, and workflow repository guards all agree.

### M1 — Local validation

Goal: prove the renamed project still passes the local gates that can run on this machine. Done when format, lint, repository hygiene, protocol manifest, typecheck, tests, build, release-state, and available security scans pass or have exact tool blockers recorded.

### M2 — GitHub bootstrap

Goal: create the first remote `main` branch and restore normal PR flow. Done when the initial commit is pushed, GitHub state is refreshed, CI reaches terminal state or a real blocker is recorded, branch protection is configured from observed check names, and a planning PR exists if the remote can accept PRs.

### M3 — Release readiness checkpoint

Goal: verify the project is not publishing a release while still being ready for maintainer-controlled release flow later. Done when changelog/docs reflect the current identity, release automation remains guarded, no tag is created, and final repository/GitHub state is recorded.

## Task list

### T001 — M0 — Rename package and public identity

- **Problem**: package metadata and visible docs used the old project name.
- **Required changes**: update `package.json:name`, `README.md`, `CONTRIBUTING.md`, `TECH_DEBT.md`, `docs/**`, `server.cjs`, runtime client metadata, test fixtures, temp path prefixes, and release asset prefixes from `codex-app-server-web` to `codex-app-web`.
- **Validation**: `rg -n "codex-app-server-web|oaslananka-lab"`.
- **Acceptance**: no old project name or old org repo remains outside protocol terms such as Codex app-server.
- **Estimate**: M.
- **Depends on**: none.

### T002 — M0 — Collapse remote authority to the canonical repository

- **Problem**: README and automation docs described an obsolete canonical-plus-mirror topology.
- **Required changes**: update `README.md`, `docs/automation/repository-mirror.md`, `docs/automation/release-readiness.md`, `docs/RELEASE.md`, and `docs/THREAT_MODEL.md` to identify `oaslananka/codex-app-web` as the single canonical repository.
- **Validation**: `rg -n "organization repository|personal repository|showcase mirror|Org CI|oaslananka-lab"`.
- **Acceptance**: docs describe one canonical GitHub repository and no duplicate mirror identity.
- **Estimate**: S.
- **Depends on**: T001.

### T003 — M0 — Align workflow guards and release asset names

- **Problem**: GitHub Actions would skip jobs if repository guards still referenced the old repo, and release verification depends on package-prefixed artifact names.
- **Required changes**: update `.github/workflows/*.yml` repository guards, workflow names where needed, release asset paths, release verification regexes, `release-please-config.json`, and `pnpm-lock.yaml`.
- **Validation**: `pnpm release:state`, `pnpm repo:hygiene:check`.
- **Acceptance**: release-state reports `codex-app-web` and all guarded jobs target `oaslananka/codex-app-web`.
- **Estimate**: S.
- **Depends on**: T001, T002.

### T004 — M0 — Add automation reference documentation

- **Problem**: reviewer and dependency automation behavior was configured but not documented in one place.
- **Required changes**: add `docs/automation.md` and link it from `README.md`.
- **Validation**: `pnpm format:check`.
- **Acceptance**: docs explain CodeRabbit, Dependabot, actionlint, zizmor, gitleaks, and Trivy roles without private context.
- **Estimate**: S.
- **Depends on**: T002.

### T005 — M1 — Verify formatting

- **Problem**: broad text rewrites can introduce formatting drift.
- **Required changes**: run Prettier through the repository script.
- **Validation**: `pnpm format:check`.
- **Acceptance**: command exits 0 with no formatting changes required.
- **Estimate**: S.
- **Depends on**: T001-T004.

### T006 — M1 — Verify lint and repository hygiene

- **Problem**: renamed files and docs must not introduce lint failures, forbidden local files, unpinned actions, or old runtime references.
- **Required changes**: run ESLint and repository hygiene checks.
- **Validation**: `pnpm lint`, `pnpm repo:hygiene:check`.
- **Acceptance**: both commands exit 0.
- **Estimate**: S.
- **Depends on**: T005.

### T007 — M1 — Verify protocol generated state

- **Problem**: protocol-facing generated metadata should remain deterministic after repository renaming.
- **Required changes**: run generated manifest validation and protocol drift checks.
- **Validation**: `pnpm protocol:manifest:check`, `pnpm protocol:drift:check`.
- **Acceptance**: manifest check exits 0; drift check either exits 0 or records the empty-remote base limitation.
- **Estimate**: S.
- **Depends on**: T006.

### T008 — M1 — Verify typecheck, unit tests, and build

- **Problem**: identity changes touch application metadata, tests, docs, and release scripts.
- **Required changes**: run TypeScript, Vitest, coverage, and Next build gates.
- **Validation**: `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`, `pnpm build`.
- **Acceptance**: all commands exit 0.
- **Estimate**: M.
- **Depends on**: T007.

### T009 — M1 — Verify security and release-state gates

- **Problem**: security and release-state checks should remain active after renaming.
- **Required changes**: run available security checks, upgrade or override vulnerable packages found by Trivy/Dependabot, and record missing external tool blockers exactly.
- **Validation**: `pnpm security:actions`, `pnpm security:secrets`, `pnpm security:trivy`, `pnpm release:state`.
- **Acceptance**: each command exits 0, `ws` resolves to `8.20.1`, `brace-expansion` resolves to `5.0.6`, or a missing-tool blocker is recorded with the install/unblock action.
- **Estimate**: M.
- **Depends on**: T008.

### T010 — M2 — Create initial canonical main branch

- **Problem**: the remote repository has no default branch and local `main` has no commit.
- **Required changes**: commit the current renamed project as the bootstrap commit and push `main` to `origin`.
- **Validation**: `git status --short`, `git push -u origin main`, `gh repo view --json defaultBranchRef`.
- **Acceptance**: remote `main` exists and points at the bootstrap commit.
- **Estimate**: S.
- **Depends on**: T009.

### T011 — M2 — Configure branch protection and Scorecard policy

- **Problem**: after the first remote run, `main` needed protected checks, and Scorecard needed a current dependency scan to handle stale closed Dependabot telemetry.
- **Required changes**: configure GitHub repository merge settings and `main` branch protection; update `.github/workflows/scorecard.yml` so Scorecard policy includes a Trivy dependency vulnerability scan.
- **Validation**: `gh api repos/oaslananka/codex-app-web/branches/main/protection`, `gh run watch <scorecard-run> --exit-status`, `pnpm run ci`.
- **Acceptance**: `main` requires `Cheap Gates`, `Full Validation`, `CodeQL`, `Filesystem Security`, and `Scorecard`; Scorecard and CI Validation both pass on the protected branch.
- **Estimate**: S.
- **Depends on**: T010.

### T012 — M2 — Open planning PR

- **Problem**: normal PR flow needs a plan checkpoint after the bootstrap branch exists.
- **Required changes**: commit `PLAN.md` on `agent/plan`, push it, and open a PR titled `Plan: roadmap to current engineering standard`.
- **Validation**: `gh pr create`, `gh pr view --json state,mergeStateStatus,statusCheckRollup,url`.
- **Acceptance**: planning PR exists or an exact GitHub blocker is recorded.
- **Estimate**: S.
- **Depends on**: T011.

### T013 — M3 — Record release readiness without publishing

- **Problem**: the project should be ready for maintainer-controlled release flow without creating tags or releases.
- **Required changes**: refresh GitHub issues, PRs, milestones, workflows, release state, and repository status; update checkpoint.
- **Validation**: `gh issue list`, `gh pr list`, `gh run list`, `gh release list`, `git status --short`.
- **Acceptance**: final state records no tags/releases created, no stale GitHub state, and all blockers.
- **Estimate**: S.
- **Depends on**: T012.

## Risks and known unknowns

- The remote repository starts empty, so the first commit cannot be delivered through a PR.
- GitHub branch protection is configured from the first observed check contexts; future workflow renames must update required contexts at the same time.
- Local security tools may be absent on the workstation even though CI installs them deterministically.
- Protocol drift checks that compare against `origin/main` can behave differently before and after the first pushed default branch.
- Release-please can require GitHub Actions workflow permissions to create pull requests; that account setting must be verified in GitHub if release PR creation fails later.
