import { defineConfig, devices } from '@playwright/test';

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
    ? [['github'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
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
    // Slow down in CI for stability
    launchOptions: {
      slowMo: process.env['CI'] ? 50 : 0,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  // Start the web server before running tests
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
        DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/chefer_test',
      },
    },
  ],
  outputDir: 'test-results',
});
