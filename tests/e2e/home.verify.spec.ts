import { expect, test } from '@playwright/test';

const baseURL = process.env.DEEP_HOS_VERIFY_URL;
const primary = '.swan-home-actions .swan-public-button.is-primary';

test.skip(!baseURL, 'home verification URL is not configured');

test('home stays stable while the session check completes', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const labels: string[] = [];
  page.on('console', (message) => {
    if (message.text().startsWith('HOME_LABEL=')) labels.push(message.text().slice(11));
  });
  await page.goto(`${baseURL}/`);
  await page.locator(primary).waitFor();
  await page.evaluate((selector) => {
    const button = document.querySelector(selector)!;
    let first = true;
    new MutationObserver(() => {
      const label = button.textContent?.trim() ?? '';
      if (first) {
        first = false;
        return;
      }
      console.log(`HOME_LABEL=${label}`);
    }).observe(button, { childList: true, subtree: true, characterData: true });
  }, primary);
  await page.waitForTimeout(2_000);
  await expect(page.locator(primary)).toHaveText('开始写作');
  expect(labels).toEqual([]);
  const resources = await page.evaluate((selector) => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType('paint');
    return {
      status: document.readyState,
      label: document.querySelector(selector)?.textContent?.trim(),
      documentBytes: nav.transferSize,
      resourceCount: entries.length,
      resourceBytes: entries.reduce((total, entry) => total + entry.transferSize, 0),
      jsRequestCount: entries.filter((entry) => /\.m?js(?:\?|$)/.test(new URL(entry.name).pathname))
        .length,
      resources: entries.map((entry) => ({
        path: new URL(entry.name).pathname,
        bytes: entry.transferSize,
        duration: Math.round(entry.duration),
      })),
      paint: paint.map((entry) => ({ name: entry.name, ms: Math.round(entry.startTime) })),
    };
  }, primary);
  console.log(`HOME_RESOURCES=${JSON.stringify(resources)}`);
  expect(resources.label).toBe('开始写作');
  expect(resources.jsRequestCount).toBeLessThanOrEqual(7);
  await context.close();
});
