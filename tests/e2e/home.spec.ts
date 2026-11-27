import { expect, test } from '@playwright/test';

async function trackPrimaryLabelChanges(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('.swan-home-actions .swan-public-button.is-primary').waitFor();
  await page.evaluate(() => {
    const primary = document.querySelector('.swan-home-actions .swan-public-button.is-primary');
    if (!primary) throw new Error('Primary home action is missing');
    const changes: string[] = [];
    let initial = primary.textContent?.trim();
    Object.assign(window, { __homeActionChanges: changes });
    new MutationObserver(() => {
      const next = primary.textContent?.trim() ?? '';
      if (next === initial) return;
      initial = next;
      changes.push(next);
    }).observe(primary, { childList: true, subtree: true, characterData: true });
  });
}

test('home action renders the final state without changing its label', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.swan-home-actions')).toBeVisible();
  await trackPrimaryLabelChanges(page);
  await page.waitForTimeout(1_000);
  const primary = page.locator('.swan-home-actions .swan-public-button.is-primary');
  await expect(primary).toHaveText('开始写作');
  await expect(page.locator('.swan-public-login')).toHaveText('登录');
  expect(await page.evaluate(() => window.__homeActionChanges)).toEqual([]);
  await context.close();
});

test('signed-in home keeps the action stable while the session loads', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const registration = await context.request.post('/api/auth/register', {
    data: {
      username: `home_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      password: 'Playwright-pass-2026',
    },
  });
  expect(registration.status()).toBe(200);
  await page.route('**/api/auth/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.goto('/');
  await trackPrimaryLabelChanges(page);
  const primary = page.locator('.swan-home-actions .swan-public-button.is-primary');
  await expect(primary).toHaveText('进入文档');
  await page.waitForTimeout(1_000);
  await expect(primary).toHaveText('进入文档');
  await expect(page.locator('.swan-public-login')).toHaveText('进入文档');
  expect(await page.evaluate(() => window.__homeActionChanges)).toEqual([]);
  await context.close();
});
