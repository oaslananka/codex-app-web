# codex-app-web — Technical Debt Register

This file tracks meaningful remaining technical debt after the March 2026 protocol-alignment pass.

## Status

- Goal: keep the project at `no known material debt` for official Codex app-server contracts.
- Current status: materially improved, with a small set of accepted follow-up items.
- Last updated: 2026-05-10

## Accepted Debt

### 1. Runtime bootstrap is still concentrated in `codex-ui-runtime.ts`

- File: [src/lib/codex-ui-runtime.ts](./src/lib/codex-ui-runtime.ts)
- Why it matters:
  - Transport wiring, store mutation, and public action exports still converge in one module.
  - This is now much safer than before, but it is still the biggest coordination surface in the app.
- Accepted reason:
  - The March 2026 pass prioritized official-protocol alignment, approval parity, and schema-backed config rendering first.
- Desired end state:
  - Split bootstrap wiring, action exports, and capability bookkeeping into smaller runtime modules.

### 2. Approval UI supports the 2026 payload model, but decision rendering is still generic

- Files:
  - [src/components/codex/Overlays.tsx](./src/components/codex/Overlays.tsx)
  - [src/lib/codex-runtime/services/approval-service.ts](./src/lib/codex-runtime/services/approval-service.ts)
- Why it matters:
  - The runtime now preserves `availableDecisions`, `commandActions`, `networkApprovalContext`, and permission scopes.
  - The modal currently renders these richer payloads as structured context rather than bespoke UI cards per decision family.
- Accepted reason:
  - Generic rendering keeps future Codex approvals from breaking the UI while avoiding another brittle hard-coded approval matrix.
- Desired end state:
  - Add higher-fidelity rendering for exec-policy amendments, network-policy amendments, and command-action summaries.

### 3. Browser smoke coverage is present, but still intentionally lean

- Files:
  - [scripts/smoke-control-center.mjs](./scripts/smoke-control-center.mjs)
  - [azure-pipelines.yml](./azure-pipelines.yml)
- Why it matters:
  - CI now gates on typecheck, unit tests, build, manifest validation, and browser smoke.
  - The smoke flow validates cross-platform UI rendering, tab navigation, and responsive layout, but does not yet spin up a mocked backend for approval-flow interaction coverage.
- Accepted reason:
  - The current smoke suite is stable and cheap to run, which is more valuable than a flaky full-stack browser suite.
- Desired end state:
  - Add a deterministic mock app-server harness to exercise approval rendering and thread/turn happy paths in browser smoke.

### 4. CSP still permits inline framework runtime assets

- Files:
  - [src/lib/server/security.cjs](./src/lib/server/security.cjs)
- Why it matters:
  - Production CSP keeps `object-src`, `base-uri`, `frame-ancestors`, and
    `connect-src` narrow, but still permits inline scripts/styles required by
    the current Next.js runtime and hydration path.
- Accepted reason:
  - Removing inline allowances should be paired with nonce/hash coverage and
    browser hydration tests so the local control-plane UI does not break under
    release pressure.
- Desired end state:
  - Move to nonce or hash-based CSP after hydration, static asset, and local
    WebSocket smoke coverage prove the stricter policy works.

## Closed In This Pass

- Official method lists and config metadata now come from a generated manifest sourced from `codex-official-docs`.
- `collaborationMode/list` is treated as a first-class capability, with safe fallback for older backends.
- Collaboration modes are now server-driven instead of a hard-coded `default | plan` union.
- Approval responses now preserve scoped permissions and array-based `requestUserInput` answers.
- Config rendering is now schema-backed, with generic fallbacks for unknown fields instead of brittle unsupported handling.
- Experimental-feature rendering no longer depends on a hand-maintained documented-key allowlist.
- Smoke artifacts now use a platform-safe temp directory instead of `/tmp/...`.
- CI now enforces manifest validation, typecheck, tests, build, and browser smoke.

## Exit Criteria For “No Known Material Debt”

- `codex-ui-runtime.ts` is reduced so it no longer acts as the dominant runtime coordination point.
- Approval UI promotes the most important advanced decisions from raw JSON context into purpose-built controls.
- Browser smoke can cover at least one deterministic approval or turn-start scenario without depending on a live Codex backend.
