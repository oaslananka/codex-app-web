import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import nodeLoggerModule from '../src/lib/logging/node-logger.cjs';

const { createNodeLogger } = nodeLoggerModule;
const logger = createNodeLogger('script:smoke');

function artifactPath(name) {
  return path.join(os.tmpdir(), 'codex-app-web-smoke', name);
}

async function assertVisible(page, selector) {
  await page.locator(selector).waitFor({ state: 'visible', timeout: 15000 });
}

async function assertAnyVisible(page, selector) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 15000 });
}

async function selectTab(page, tabId, panelSelector) {
  const tab = page.locator(`button[data-tab="${tabId}"]`);
  await tab.waitFor({ state: 'visible', timeout: 15000 });
  await tab.click({ force: true });
  await page.waitForFunction(
    ([selector]) => {
      const panel = document.querySelector(selector);
      return Boolean(panel && panel.classList.contains('active'));
    },
    [panelSelector],
    { timeout: 15000 },
  );
}

async function completeApprovalFlow(page) {
  await assertVisible(page, '#approval-overlay');
  await assertAnyVisible(page, '.approval-section-card');
  await assertVisible(page, 'text=Available decisions');
  await assertVisible(page, 'text=Network policy amendments');
  await assertAnyVisible(page, 'text=registry.npmjs.org');
  await page.screenshot({ path: artifactPath('desktop-approval-overlay.png'), fullPage: true });

  await page.locator('#approval-btns .btn-approve').click();
  await page.locator('#approval-overlay').waitFor({ state: 'hidden', timeout: 15000 });
}

async function main() {
  const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:1989').replace(/\/$/, '');
  const shouldVerifyApproval = process.env.SMOKE_APPROVAL === '1';
  fs.mkdirSync(path.join(os.tmpdir(), 'codex-app-web-smoke'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    await assertVisible(page, '#header');
    await assertVisible(page, '#content-tabs');
    await assertVisible(page, '#panel-chat');
    await page.screenshot({ path: artifactPath('desktop-home.png'), fullPage: true });

    if (shouldVerifyApproval) {
      await completeApprovalFlow(page);
    }

    await selectTab(page, 'info', '#panel-info');
    await assertVisible(page, '#panel-info.active');
    await page.screenshot({ path: artifactPath('desktop-info-tab.png'), fullPage: true });

    await selectTab(page, 'config', '#panel-config');
    await assertVisible(page, '#panel-config.active');
    await page.screenshot({ path: artifactPath('desktop-config-tab.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await assertVisible(page, '#btn-toggle-sidebar');
    await page.click('#btn-toggle-sidebar');
    await page.screenshot({ path: artifactPath('mobile-sidebar.png'), fullPage: true });

    if (errors.length) {
      throw new Error(`Console errors detected: ${errors.slice(0, 5).join(' | ')}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  logger.error('Smoke test failed', error);
  process.exitCode = 1;
});
