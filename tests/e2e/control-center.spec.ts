import {
  FIRST_USABLE_UI_BUDGET_MS,
  dismissApprovalIfPresent,
  expect,
  openControlCenter,
  summarizeAxeViolations,
  test,
} from './support/fixtures';

const readyThreadId = '123e4567-e89b-42d3-a456-426614174901';
const errorThreadId = '123e4567-e89b-42d3-a456-426614174902';

test.describe('Codex control center critical paths', () => {
  test('starts the app and loads a backend thread session within budget', async ({
    page,
    makeAxeBuilder,
  }) => {
    const firstUsableMs = await openControlCenter(page);
    expect(firstUsableMs).toBeLessThan(FIRST_USABLE_UI_BUDGET_MS);
    await dismissApprovalIfPresent(page);

    await expect(page.locator(`[data-id="${readyThreadId}"]`)).toContainText(
      'Release readiness check',
    );
    await page.locator(`[data-id="${readyThreadId}"]`).click();

    await expect(page.locator('#thread-title')).toHaveText('Release readiness check');
    await expect(page.locator('.msg-body').last()).toContainText('Artifacts verified');

    const scan = await makeAxeBuilder().include('#main').analyze();
    expect(summarizeAxeViolations(scan.violations)).toEqual([]);
  });

  test('resolves approval UI with accessible modal content', async ({ page, makeAxeBuilder }) => {
    await openControlCenter(page);

    await expect(page.locator('#approval-overlay')).toBeVisible();
    await expect(page.locator('#approval-title')).toContainText('approval');
    await expect(page.locator('#approval-detail')).toContainText('pnpm publish --dry-run');
    await expect(page.locator('.approval-section-card').first()).toContainText(
      'registry.npmjs.org',
    );

    const scan = await makeAxeBuilder().include('#approval-overlay').analyze();
    expect(summarizeAxeViolations(scan.violations)).toEqual([]);

    await page.locator('#approval-btns .btn-approve').click();
    await expect(page.locator('#approval-overlay')).toBeHidden();
  });

  test('exercises terminal output and workspace file browsing', async ({
    page,
    makeAxeBuilder,
  }) => {
    await openControlCenter(page);
    await dismissApprovalIfPresent(page);

    await page.locator('button[data-tab="terminal"]').click();
    await expect(page.locator('#panel-terminal.active')).toBeVisible();
    await page.locator('#term-cmd').fill('echo codex-e2e');
    await page.locator('#btn-term-run').click();
    await expect(page.locator('#term-output')).toContainText('Codex E2E terminal output');
    await expect(page.locator('#term-output')).toContainText('[Exit: 0]');

    await page.locator('button[data-tab="files"]').click();
    await page.locator('#files-path').fill('/workspace/codex-app-web');
    await page.locator('#btn-browse').click();
    await expect(page.locator('#file-tree')).toContainText('README.md');
    await page.locator('[data-path="/workspace/codex-app-web/README.md"]').click();
    await expect(page.locator('#file-editor')).toContainText('Workspace file panel content');

    const scan = await makeAxeBuilder().include('#panel-files').analyze();
    expect(summarizeAxeViolations(scan.violations)).toEqual([]);
  });

  test('renders recoverable backend failure states', async ({ page }) => {
    await openControlCenter(page);
    await dismissApprovalIfPresent(page);

    await page.locator(`[data-id="${errorThreadId}"]`).click();
    await expect(page.locator('#thread-title')).toHaveText('Broken workspace fixture');
    await expect(page.locator('.thread-status-pill')).toHaveText('System error');
    await expect(page.locator('.msg-body').last()).toContainText('Workspace fixture failed');

    await page.locator('button[data-tab="files"]').click();
    await page.locator('#files-path').fill('/workspace/codex-app-web/missing');
    await page.locator('#btn-browse').click();
    await expect(page.locator('#panel-files .panel-error')).toContainText(
      'No such file or directory',
    );
  });
});
