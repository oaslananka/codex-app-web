import { defineConfig } from '@playwright/test';

const e2ePort = Number(process.env.E2E_PORT || 1989);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${e2ePort}`;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: isCi
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/playwright-control-center-server.mjs',
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
