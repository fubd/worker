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

test('signed-in home keeps the action stable after session resolution', async ({ browser }) => {
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
  await trackPrimaryLabelChanges(page);
  await page.waitForTimeout(1_000);
  await expect(primary).toHaveText('进入文档');
  await expect(page.locator('.swan-public-login')).toHaveText('进入文档');
  expect(await page.evaluate(() => window.__homeActionChanges)).toEqual([]);
  await context.close();
});

test('signed-in home follows the server session without a client-readable hint', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const registration = await context.request.post('/api/auth/register', {
    data: {
      username: `home_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      password: 'Playwright-pass-2026',
    },
  });
  expect(registration.status()).toBe(200);
  await context.clearCookies({ name: 'yuyan_has_session' });
  await page.route('**/rsbuild-hmr**', (route) => route.abort());
  await page.route('**/static/js/*', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes('syncHomeSession')) {
      await route.fulfill({
        response,
        body: `document.documentElement.setAttribute('data-swan-public-shell','');\n${body}`,
      });
    } else {
      await route.fulfill({ response, body });
    }
  });
  await page.goto('/');
  const primary = page.locator('.swan-home-actions .swan-public-button.is-primary');
  await expect(primary).toHaveText('进入文档');
  await expect(primary).toHaveAttribute('href', '/docs');
  await expect(page.locator('.swan-public-login')).toHaveText('进入文档');
  await expect(page.locator('[data-swan-public-home="footer"]')).toHaveText('打开文档');
  await context.close();
});
