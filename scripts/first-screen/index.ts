/**
 * Build-time first-screen snapshot pipeline.
 *
 * Run after `rsbuild build`:
 *   bun scripts/first-screen/index.ts
 *
 * Env:
 *   FIRST_SCREEN_SKIP=1      skip entirely (CI without Chrome)
 *   FIRST_SCREEN_STRICT=1    fail the build if capture/verification fails
 *   FIRST_SCREEN_CSS_MODE=   auto (default) | inline-css | async | blocking
 *   CHROME_PATH=...          Chrome/Chromium executable
 *
 * Fail-open: on any error, dist/home.html is removed and the Worker falls
 * back to the normal SPA shell.
 */
import { existsSync, unlinkSync } from 'node:fs';
import { captureSnapshots, findChrome } from './capture';
import { generateHomeHtml, type AppCssMode } from './generate';
import { startCaptureServer } from './server';
import { verifyHomeHtml } from './verify';

const distDir = 'dist';
const vendorDir = 'vendor';

async function main() {
  if (process.env.FIRST_SCREEN_SKIP === '1') {
    console.log('[first-screen] skipped (FIRST_SCREEN_SKIP=1)');
    return;
  }
  if (!existsSync(`${distDir}/index.html`)) {
    throw new Error('dist/index.html not found; run rsbuild build first');
  }

  const executablePath = findChrome();
  const server = startCaptureServer(distDir, vendorDir);

  try {
    console.log(`[first-screen] capturing from ${server.url}`);
    const captures = await captureSnapshots(server.url, executablePath);
    console.log(
      `[first-screen] desktop: ${captures.desktop.html.length} html / ${captures.desktop.css.length} css; ` +
        `mobile: ${captures.mobile.html.length} html / ${captures.mobile.css.length} css`,
    );

    const requestedMode = (process.env.FIRST_SCREEN_CSS_MODE ?? 'auto') as AppCssMode;
    const result = generateHomeHtml(distDir, captures, requestedMode);
    console.log(
      `[first-screen] wrote dist/home.html (${result.bytes} bytes, css mode: ${result.mode}, app css: ${result.appCssBytes} bytes)`,
    );

    server.setServeHome(true);
    await verifyHomeHtml(server, executablePath);
    console.log('[first-screen] verification passed');
  } finally {
    server.stop();
  }
}

main().catch((error: unknown) => {
  // Playwright's launch errors include a long call log; keep the first line.
  const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
  console.error(`[first-screen] failed: ${message}`);

  try {
    unlinkSync(`${distDir}/home.html`);
  } catch {
    // no file to remove
  }

  if (process.env.FIRST_SCREEN_STRICT === '1') {
    process.exit(1);
  }

  console.warn('[first-screen] home.html removed; / will fall back to the SPA shell');
  process.exit(0);
});
