import { expect, test } from '@playwright/test';

function useFullHomeBuild(): void {
  test.skip(
    !process.env.RUN_FULL_STATIC_BUILD,
    'Run Playwright after `bun run build`; the serial E2E build cannot rebuild the browser shell.',
  );
}

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

async function trackInitialMemberAction(page: import('@playwright/test').Page): Promise<void> {
  const initScript = () => {
    const state: { labels: string[]; first: { text: string; href: string } | null } = {
      labels: [],
      first: null,
    };
    let ready = false;
    Object.defineProperties(window, {
      __homeFirst: { value: state, configurable: true },
      __homeReady: {
        get: () => ready,
        set: (next: boolean) => {
          ready = next;
        },
        configurable: true,
      },
    });
    const record = () => {
      const primary = document.querySelector<HTMLAnchorElement>(
        '.swan-home-actions [data-swan-public-home="primary"]',
      );
      if (!primary?.textContent) return;
      const text = primary.textContent.trim();
      state.first ??= { text, href: primary.getAttribute('href') ?? '' };
      if (state.labels.at(-1) !== text) state.labels.push(text);
      (window as { __homeReady?: boolean }).__homeReady = true;
    };
    record();
    const observe = () => {
      record();
      new MutationObserver(record).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    };
    if (document.documentElement) observe();
    else document.addEventListener('readystatechange', observe, { once: true });
  };
  await page.addInitScript(initScript);
  const response =
    process.env.PLAYWRIGHT_PRODUCTION_PROXY || !process.env.RUN_FULL_STATIC_BUILD
      ? await page.goto('/')
      : await page.goto('http://localhost:8787/home?fresh');
  const html = (await response?.text())?.replace(/<!--.*?-->/gs, '') ?? '';
  expect(html).toContain('<meta name="yuyan-home-auth" content="member">');
  expect(html).toContain('data-swan-public-home="primary">进入文档');
  await page.waitForFunction(() => (window as { __homeReady?: boolean }).__homeReady === true);
  expect(await page.evaluate(() => (window as { __homeFirst?: unknown }).__homeFirst)).toEqual({
    labels: ['进入文档'],
    first: { text: '进入文档', href: '/docs' },
  });
}

test('home action renders the final state without changing its label', async ({ browser }) => {
  useFullHomeBuild();
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
  useFullHomeBuild();
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

test('signed-in home keeps its member action after a full refresh', async ({ browser }) => {
  useFullHomeBuild();
  const context = await browser.newContext();
  const page = await context.newPage();
  const registration = await context.request.post('/api/auth/register', {
    data: {
      username: `home_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      password: 'Playwright-pass-2026',
    },
  });
  expect(registration.status()).toBe(200);
  await trackInitialMemberAction(page);
  const primary = page.locator('.swan-home-actions .swan-public-button.is-primary');
  await expect(primary).toHaveText('进入文档');
  await expect(page.locator('.swan-public-login')).toHaveText('进入文档');
  await context.close();
});
