import { chromium } from 'playwright-core';

import { VIEWPORTS } from './capture';
import type { CaptureServer } from './server';

export async function verifyAboutHtml(
  server: CaptureServer,
  executablePath: string,
): Promise<void> {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const viewport of VIEWPORTS) {
      const noJsContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
        javaScriptEnabled: false,
      });
      try {
        const page = await noJsContext.newPage();
        await page.goto(`${server.url}/about`, { waitUntil: 'load', timeout: 30_000 });

        if (!(await page.locator('#swan-first-screen').isVisible())) {
          throw new Error(`no-JS ${viewport.name}: static about page is not visible`);
        }
        if ((await page.locator('#root').count()) !== 0) {
          throw new Error(`no-JS ${viewport.name}: React root must not exist`);
        }
        if ((await page.locator('#swan-first-screen .ant-table').count()) < 2) {
          throw new Error(`no-JS ${viewport.name}: stack table is incomplete`);
        }
        const variantSelector = viewport.isMobile ? '.swan-fs-mobile' : '.swan-fs-desktop';
        if (
          !(await page
            .locator(variantSelector)
            .getByText('技术栈', { exact: true })
            .first()
            .isVisible())
        ) {
          throw new Error(`no-JS ${viewport.name}: about content is missing`);
        }
        if (!(await page.locator(`${variantSelector} .ant-table`).isVisible())) {
          throw new Error(`no-JS ${viewport.name}: active stack table is not visible`);
        }

        const desktopVisible = await page.locator('.swan-fs-desktop').isVisible();
        const mobileVisible = await page.locator('.swan-fs-mobile').isVisible();
        const expectedDesktop = viewport.name === 'desktop';
        if (desktopVisible !== expectedDesktop || mobileVisible !== !expectedDesktop) {
          throw new Error(
            `no-JS ${viewport.name}: wrong variant (desktop=${desktopVisible}, mobile=${mobileVisible})`,
          );
        }
      } finally {
        await noJsContext.close();
      }

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
      });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        const reactAssets: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        page.on('request', (request) => {
          const url = request.url();
          if (url.includes('/static/js/')) reactAssets.push(url);
        });

        const response = await page.goto(`${server.url}/about`, {
          waitUntil: 'load',
          timeout: 30_000,
        });
        try {
          await page.waitForSelector('#swan-first-screen .ant-table', {
            state: 'attached',
            timeout: 15_000,
          });
        } catch {
          const state = await page.evaluate(() => ({
            url: location.href,
            title: document.title,
            staticPage: !!document.getElementById('swan-first-screen'),
            tables: document.querySelectorAll('#swan-first-screen .ant-table').length,
            body: document.body.textContent?.trim().slice(0, 160) ?? '',
          }));
          throw new Error(
            `${viewport.name}: static about did not render (status=${response?.status()}, state=${JSON.stringify(state)})`,
          );
        }

        if (reactAssets.length > 0) {
          throw new Error(`${viewport.name}: static about requested React assets`);
        }
        if (viewport.isMobile) {
          await page
            .locator('#swan-first-screen .swan-header button[aria-label="打开菜单"]:visible')
            .click();
          await page.waitForSelector('#swan-static-menu.is-open', { timeout: 2_000 });
          if (!(await page.locator('#swan-static-menu a[href="/todos"]').isVisible())) {
            throw new Error('mobile: static navigation did not open');
          }
        }
        if (errors.length > 0) {
          throw new Error(`${viewport.name} console errors: ${errors.slice(0, 3).join(' | ')}`);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
