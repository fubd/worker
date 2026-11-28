import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: 'test-results',
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: process.env.PLAYWRIGHT_PRODUCTION_PROXY
      ? 'http://localhost:3003'
      : 'http://localhost:3002',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  webServer: process.env.PLAYWRIGHT_REUSE_SERVER
    ? undefined
    : [
        {
          command:
            'test -f dist/vercel/_home/member.html && bun run db:migrate:local && bun run db:reset:e2e && bun run dev:api',
          url: 'http://localhost:8787/api/health',
          timeout: 120_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
        {
          command: 'test -f dist/server/home-html.txt && bun run dev:home',
          url: 'http://localhost:3002/home',
          timeout: 120_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
        ...(process.env.PLAYWRIGHT_PRODUCTION_PROXY
          ? [
              {
                command: 'bun run dev:preview',
                url: 'http://localhost:3003/',
                timeout: 30_000,
                stdout: 'ignore' as const,
                stderr: 'pipe' as const,
              },
            ]
          : []),
      ],
});
