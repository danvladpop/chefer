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

  // Role locators, not getByLabel: the login form's visibility toggle carries
  // aria-label="Show password", so getByLabel(/password/i) matches both it and
  // the input and trips Playwright's strict mode.
  await page.getByRole('textbox', { name: /email address/i }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // The app redirects to /dashboard on success. If credentials are wrong we
  // stay on /login with an error — surface that clearly rather than timing out
  // on an opaque navigation wait.
  // `.first()` because the form also renders per-field validation alerts; any
  // of them appearing means we did not get in.
  const errorAlert = page.getByRole('alert').first();

  await Promise.race([
    page.waitForURL('**/dashboard', { timeout: 15_000 }),
    errorAlert.waitFor({ timeout: 15_000 }).then(async () => {
      // Give React a beat to fill the alert — it mounts before its text lands.
      await page.waitForTimeout(250);
      const message = (await errorAlert.textContent())?.trim();
      throw new Error(
        `Login failed for ${email}: ${message || 'the form rejected the credentials'}`,
      );
    }),
  ]);

  await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeAttached();

  await page.context().storageState({ path: AUTH_FILE });
});
