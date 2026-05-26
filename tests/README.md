# Test Layout

The test tree is organized by execution surface so local and CI runs use the
same deterministic fixtures.

## Unit Tests

- `tests/unit/**/*.test.ts` and `tests/unit/**/*.test.tsx` cover runtime
  services, UI state reducers, React panels, server helpers, and repository
  quality scripts.
- Shared runtime state should be created from `buildInitialState()` and patched
  per test instead of copying large snapshots.
- Component tests mock only the context hooks they need, then render the real
  component under test with `react-dom/server` or `happy-dom`.

## E2E Tests

- `tests/e2e/**/*.spec.ts` runs through Playwright Test.
- `tests/e2e/support/fixtures.ts` owns shared helpers: app startup, optional
  approval dismissal, axe configuration, and the first usable UI budget.
- `scripts/playwright-control-center-server.mjs` starts the production UI and
  `scripts/e2e-codex-app-server.mjs` provides deterministic Codex protocol
  responses for threads, approvals, terminal execution, files, and failure
  states.

## Mutation Tests

- `stryker.config.json` bounds the initial mutation gate to small runtime
  helpers with stable unit coverage.
- Keep `thresholds.break` ratcheted upward only after the matching tests are
  strengthened and `pnpm test:mutation` passes locally.

## Commands

```bash
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm test:mutation
```

```powershell
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm test:mutation
```
