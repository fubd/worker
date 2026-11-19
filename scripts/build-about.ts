/**
 * Generate the final static /about page from the built React route.
 *
 * The page has no runtime state or user actions beyond navigation, so shipping
 * React, ReactDOM, React Router and antd provides no user-facing capability.
 * Capture both responsive layouts at build time and keep the finished DOM/CSS.
 */
import { existsSync, unlinkSync } from 'node:fs';

import { captureRouteSnapshots, findChrome } from './first-screen/capture';
import { generateAboutHtml } from './first-screen/generate-about';
import { startCaptureServer } from './first-screen/server';
import { verifyAboutHtml } from './first-screen/verify-about';

const distDir = 'dist';
const output = `${distDir}/about.html`;

async function main() {
  if (process.env.FIRST_SCREEN_SKIP === '1') {
    removeOutput();
    console.log('[about-static] skipped (FIRST_SCREEN_SKIP=1)');
    return;
  }
  if (!existsSync(`${distDir}/index.html`)) {
    throw new Error('dist/index.html not found; run rsbuild build first');
  }

  const executablePath = findChrome();
  const server = startCaptureServer(distDir, `${distDir}/vendor`);

  try {
    const captures = await captureRouteSnapshots(server.url, executablePath, {
      path: '/about',
      label: 'about',
      readySelectors: [
        '#root .swan-shell',
        '#root .ant-table',
        '#root .swan-code-block',
        '#root .swan-footer',
      ],
    });
    const result = generateAboutHtml(distDir, captures);
    console.log(`[about-static] wrote ${output} (${result.bytes} bytes)`);

    server.setServeAbout(true);
    await verifyAboutHtml(server, executablePath);
    console.log('[about-static] verification passed');
  } finally {
    server.stop();
  }
}

function removeOutput() {
  try {
    unlinkSync(output);
  } catch {
    // no stale output
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
  console.error(`[about-static] failed: ${message}`);
  removeOutput();

  if (process.env.FIRST_SCREEN_STRICT === '1') {
    process.exit(1);
  }

  console.warn('[about-static] about.html removed; /about will fall back to the SPA shell');
  process.exit(0);
});
