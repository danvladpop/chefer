import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Signed-in browser state produced by e2e/auth.setup.ts. Gitignored. */
const AUTH_FILE = path.join(here, '.auth', 'user.json');

/**
 * Playwright configuration for E2E tests.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI']
    ? [
        ['github'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'test-results/results.json' }],
      ]
    : [['html', { open: 'on-failure' }], ['list']],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
    trace: process.env['CI'] ? 'on-first-retry' : 'on',
    screenshot: 'only-on-failure',
    video: process.env['CI'] ? 'retain-on-failure' : 'off',
    launchOptions: {
      slowMo: process.env['CI'] ? 50 : 0,
    },
  },
  projects: [
    // Signs in once and writes AUTH_FILE. Everything below reuses it.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // ── Authenticated responsive suites ──────────────────────────────────────
    // Mobile runs on WebKit: iOS Safari is where the viewport-unit and
    // scroll-container behaviour this work targets actually differs.
    {
      name: 'mobile',
      testMatch: /mobile-.*\.spec\.ts/,
      use: { ...devices['iPhone 12'], storageState: AUTH_FILE },
      dependencies: ['setup'],
    },
    {
      name: 'desktop',
      testMatch: /desktop-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Public pages ─────────────────────────────────────────────────────────
    // No auth needed. Kept separate so a stale public spec cannot mask a
    // failure in the responsive suites above.
    {
      name: 'public',
      testMatch: /home\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Reuses the running dev servers locally; boots them in CI.
  webServer: [
    {
      command: 'pnpm --filter @chefer/web start',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: {
        PORT: '3000',
        NODE_ENV: 'test',
      },
    },
    {
      command: 'pnpm --filter @chefer/api start',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        PORT: '3001',
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env['DATABASE_URL'] ??
          'postgresql://postgres:postgres@localhost:5432/chefer_test',
      },
    },
  ],
  outputDir: 'test-results',
});
