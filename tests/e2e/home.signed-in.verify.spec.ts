import { expect, test } from '@playwright/test';

const baseURL = process.env.DEEP_HOS_VERIFY_URL;
const primary = '.swan-home-actions .swan-public-button.is-primary';

test.skip(!baseURL, 'home verification URL is not configured');

test('signed-in home keeps its action stable on production', async ({ browser }) => {
  const baseUrl = new URL(baseURL!);
  const context = await browser.newContext({ baseURL: baseUrl.origin, serviceWorkers: 'block' });
  const page = await context.newPage();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const registration = await context.request.post('/api/auth/register', {
    data: { username: `verify_${suffix}`.slice(0, 32), password: 'Playwright-pass-2026' },
  });
  expect(registration.status()).toBe(200);
  await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
  await page.locator(primary).waitFor();
  const initial = (await page.locator(primary).textContent())?.trim();
  const initialHref = await page.locator(primary).getAttribute('href');
  const initialNav = (await page.locator('.swan-public-login').textContent())?.trim();
  await page.waitForTimeout(3_000);
  await page.evaluate((selector) => {
    const button = document.querySelector(selector)!;
    const changes: string[] = [];
    Object.assign(window, { __homeLabelChanges: changes, __homeButton: button });
    new MutationObserver(() => {
      const current = document.querySelector(selector);
      const label = current?.textContent?.trim() ?? '';
      if (current !== button || label !== initial) changes.push(label);
    }).observe(button, { childList: true, subtree: true, characterData: true });
  }, primary);
  await page.waitForTimeout(2_000);
  const changes = await page.evaluate(
    (selector) => [
      ...window.__homeLabelChanges,
      ...(document.querySelector(selector) === window.__homeButton
        ? []
        : [`replaced:${document.querySelector(selector)?.textContent?.trim()}`]),
    ],
    primary,
  );
  expect(initial).toBe('进入文档');
  expect(initialHref).toBe('/docs');
  expect(initialNav).toBe('进入文档');
  expect(changes).toEqual([]);
  await context.close();
});
