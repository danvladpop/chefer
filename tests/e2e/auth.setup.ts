import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as setup } from '@playwright/test';

// ─── Authentication setup ─────────────────────────────────────────────────────
// Runs once before the authenticated projects and saves a signed-in browser
// state to disk. Every other spec reuses it, so the suite runs unattended and
// no test has to know anything about the login form.
//
// Credentials come from the environment, never from source — put them in a
// local .env (gitignored) or export them in your shell:
//
//   E2E_EMAIL=you@example.com E2E_PASSWORD=... pnpm test:e2e
//
// For a local dev database the seeded accounts in CLAUDE.md work fine.

const here = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_FILE = path.join(here, '..', '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env['E2E_EMAIL'];
  const password = process.env['E2E_PASSWORD'];

  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL and E2E_PASSWORD must be set to run the authenticated suite.\n' +
        'Example: E2E_EMAIL=admin@chefer.dev E2E_PASSWORD=... pnpm test:e2e\n' +
        'Seeded local accounts are listed in CLAUDE.md.',
    );
  }

  await page.goto('/login');

  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // The app redirects to /dashboard on success. If credentials are wrong we
  // stay on /login with an error — surface that clearly rather than timing out
  // on an opaque navigation wait.
  await Promise.race([
    page.waitForURL('**/dashboard', { timeout: 15_000 }),
    page
      .getByRole('alert')
      .waitFor({ timeout: 15_000 })
      .then(async () => {
        const message = await page.getByRole('alert').textContent();
        throw new Error(`Login failed: ${message?.trim() ?? 'unknown error'}`);
      }),
  ]);

  await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeAttached();

  await page.context().storageState({ path: AUTH_FILE });
});
