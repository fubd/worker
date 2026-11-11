/**
 * Headless capture of the built home page at the two layout breakpoints.
 *
 * The capture is deliberately done from the built app (not from a design
 * mock): the snapshot must match what the app actually renders, including
 * Ant Design's CSS-in-JS output.
 */
import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';

export type Capture = {
  html: string;
  css: string;
  dropped: { media: number; keyframes: number; style: number };
  rules: number;
  viewport: { w: number; h: number };
};

export const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
] as const;

export type ViewportName = (typeof VIEWPORTS)[number]['name'];
export type CaptureMap = Record<ViewportName, Capture>;

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter((value): value is string => !!value);

export function findChrome(): string {
  // An explicit CHROME_PATH is authoritative: do not silently fall back to a
  // different browser when the caller asked for a specific one.
  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
  }

  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Chrome/Chromium not found. Install Chrome, set CHROME_PATH, or set FIRST_SCREEN_SKIP=1 to skip the snapshot.',
  );
}

export async function captureSnapshots(
  baseUrl: string,
  executablePath: string,
): Promise<CaptureMap> {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const captures = {} as CaptureMap;
    for (const viewport of VIEWPORTS) {
      captures[viewport.name] = await captureAt(browser, baseUrl, viewport);
    }
    return captures;
  } finally {
    await browser.close();
  }
}

async function captureAt(
  browser: Browser,
  baseUrl: string,
  viewport: (typeof VIEWPORTS)[number],
): Promise<Capture> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    colorScheme: 'light',
    locale: 'zh-CN',
  });

  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForSelector('#root .swan-hero h1', { timeout: 15_000 });
    await page.waitForSelector('#root .swan-stat-value', { timeout: 15_000 });
    await page.waitForSelector('#root .swan-code-block', { timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));

    // Freeze animations for the capture. The style is marked so the CSS
    // filter does not copy this capture-only rule into the snapshot.
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.setAttribute('data-swan-capture', '');
      style.textContent =
        '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
      document.head.appendChild(style);
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );

    const capture = await page.evaluate(captureInPage);

    if (errors.length > 0) {
      console.warn(`[first-screen] ${viewport.name} console errors:`, errors.slice(0, 5));
    }
    if (!capture.html || !capture.css) {
      throw new Error(`empty ${viewport.name} capture`);
    }

    return capture;
  } finally {
    await context.close();
  }
}

/**
 * Runs inside the page. Kept self-contained: Playwright serializes this
 * function, so it cannot reference imports or Node values.
 */
function captureInPage(): Capture {
  const root = document.getElementById('root');
  if (!root) throw new Error('missing #root');

  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script').forEach((element) => element.remove());
  // The app and the snapshot briefly coexist in the same document; strip IDs
  // so the snapshot cannot introduce duplicate IDs (Ant Design menus use
  // rc-menu-uuid-* ids). The snapshot is inert, so label/aria references are
  // not needed.
  clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));

  const css: string[] = [];
  const seen = new Set<string>();
  const dropped = { media: 0, keyframes: 0, style: 0 };

  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode as Element | null;
    if (owner?.hasAttribute('data-swan-capture')) continue;

    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    for (const rule of Array.from(rules)) {
      let keep = true;

      if (rule.type === CSSRule.STYLE_RULE) {
        const selector = (rule as CSSStyleRule).selectorText.replace(
          /::?(before|after|placeholder|selection|first-line|first-letter|marker|backdrop|file-selector-button)/gi,
          '',
        );
        try {
          keep = !!document.querySelector(selector);
        } catch {
          keep = true;
        }
        if (!keep) dropped.style++;
      } else if (rule.type === CSSRule.MEDIA_RULE) {
        try {
          keep = window.matchMedia((rule as CSSMediaRule).conditionText).matches;
        } catch {
          keep = true;
        }
        if (!keep) dropped.media++;
      } else if (rule.type === CSSRule.KEYFRAMES_RULE) {
        keep = false;
        dropped.keyframes++;
      }

      if (keep) {
        const text = rule.cssText;
        if (!seen.has(text)) {
          seen.add(text);
          css.push(text);
        }
      }
    }
  }

  return {
    html: clone.innerHTML,
    css: css.join('\n'),
    dropped,
    rules: css.length,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}
