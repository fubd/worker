/**
 * Post-generation smoke test: load the generated home.html in the same
 * browser and make sure the snapshot hands over cleanly. If this fails, the
 * orchestrator deletes home.html and the Worker falls back to index.html.
 */
import { chromium } from 'playwright-core';
import { VIEWPORTS } from './capture';
import type { CaptureServer } from './server';

export async function verifyHomeHtml(server: CaptureServer, executablePath: string): Promise<void> {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
      });

      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });

        await page.goto(`${server.url}/`, { waitUntil: 'load', timeout: 30_000 });
        await page.waitForSelector('#root .swan-stat-value', { timeout: 15_000 });
        await page.waitForSelector('#swan-first-screen', { state: 'detached', timeout: 15_000 });

        const state = await page.evaluate(() => ({
          attr: document.documentElement.getAttribute('data-swan-first-screen'),
          snapshot: !!document.getElementById('swan-first-screen'),
          rootVisibility: getComputedStyle(document.getElementById('root')).visibility,
          stats: !!document.querySelector('#root .swan-stat-value'),
        }));

        if (
          state.attr !== null ||
          state.snapshot ||
          state.rootVisibility !== 'visible' ||
          !state.stats
        ) {
          throw new Error(`${viewport.name} handover state is wrong: ${JSON.stringify(state)}`);
        }
        if (errors.length > 0) {
          throw new Error(`${viewport.name} console errors: ${errors.slice(0, 3).join(' | ')}`);
        }
      } finally {
        await context.close();
      }
    }

    // No-JS: the snapshot must be the visible page and the app root must stay
    // hidden. Playwright's locators work even when page scripts are disabled.
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
        javaScriptEnabled: false,
      });
      try {
        const page = await context.newPage();
        await page.goto(`${server.url}/`, { waitUntil: 'load', timeout: 30_000 });

        if ((await page.locator('#swan-first-screen').count()) !== 1) {
          throw new Error(`no-JS ${viewport.name}: snapshot markup is missing`);
        }
        if (!(await page.locator('#swan-first-screen').isVisible())) {
          throw new Error(`no-JS ${viewport.name}: snapshot is not visible`);
        }
        if (await page.locator('#root').isVisible()) {
          throw new Error(`no-JS ${viewport.name}: app root should stay hidden`);
        }

        const desktopVisible = await page.locator('.swan-fs-desktop').isVisible();
        const mobileVisible = await page.locator('.swan-fs-mobile').isVisible();
        const expectedDesktop = viewport.name === 'desktop';
        if (desktopVisible !== expectedDesktop || mobileVisible !== !expectedDesktop) {
          throw new Error(
            `no-JS ${viewport.name}: wrong variant (desktop=${desktopVisible}, mobile=${mobileVisible})`,
          );
        }

        const content = await page.content();
        if (!content.includes('data-swan-first-screen="preparing"')) {
          throw new Error(`no-JS ${viewport.name}: preparing attribute is missing`);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
