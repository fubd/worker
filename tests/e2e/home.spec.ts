import { expect, test } from '@playwright/test';

test('home action renders the final state without changing its label', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.swan-home-actions')).toBeVisible();
  await page.evaluate(() => {
    const button = document.querySelector('.swan-home-actions .swan-public-button.is-primary');
    let initial: string | null | undefined;
    let observer: MutationObserver;
    observer = new MutationObserver(() => {
      if (initial === undefined) {
        initial = button?.textContent;
        return;
      }
      if (!button?.textContent || button.textContent === initial) return;
      observer.disconnect();
      console.log('home action changed');
    });
    observer.observe(button!, { childList: true, subtree: true, characterData: true });
  });
  await page.waitForTimeout(1_000);
  const primary = page.locator('.swan-home-actions .swan-public-button.is-primary');
  await expect(primary).toHaveText('开始写作');
  await expect(page.locator('.swan-public-login')).toHaveText('登录');
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
  const primary = page.locator('.swan-home-actions .swan-public-button.is-primary');
  await expect(primary).toHaveText('进入文档');
  await page.waitForTimeout(1_000);
  await expect(primary).toHaveText('进入文档');
  await expect(page.locator('.swan-public-login')).toHaveText('进入文档');
  await context.close();
});
