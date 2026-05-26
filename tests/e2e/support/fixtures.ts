import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';

export const FIRST_USABLE_UI_BUDGET_MS = 15_000;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

type AxeFixture = {
  makeAxeBuilder: () => AxeBuilder;
};

export const test = base.extend<AxeFixture>({
  makeAxeBuilder: async ({ page }, use) => {
    await use(() => new AxeBuilder({ page }).withTags(AXE_TAGS));
  },
});

export { expect };

export async function openControlCenter(page: Page) {
  await page.goto('/');
  await expect(page.locator('#header')).toBeVisible();
  await expect(page.locator('#conn-label')).toHaveText('ONLINE');
  return page.evaluate(() => performance.now());
}

export async function dismissApprovalIfPresent(page: Page) {
  const overlay = page.locator('#approval-overlay');
  await page.waitForTimeout(500);
  if (!(await overlay.isVisible())) {
    return;
  }
  await page.locator('#approval-btns .btn-deny').click();
  await expect(overlay).toBeHidden();
}

export function summarizeAxeViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.flatMap((node) => node.target).slice(0, 5),
  }));
}
