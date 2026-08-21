import { existsSync, statSync } from 'node:fs';
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

/** How long a saved session is trusted before we sign in again. */
const AUTH_TTL_MS = 8 * 60 * 60 * 1000;

setup('authenticate', async ({ page }) => {
  // Reuse a recent session so the suite runs without credentials in the
  // environment. Only the first run of the day needs them.
  if (process.env['E2E_FORCE_LOGIN'] !== '1' && existsSync(AUTH_FILE)) {
    const ageMs = Date.now() - statSync(AUTH_FILE).mtimeMs;
    if (ageMs < AUTH_TTL_MS) {
      setup.skip(
        true,
        `Reusing saved session (${Math.round(ageMs / 60_000)}m old). ` +
          'Set E2E_FORCE_LOGIN=1 to sign in again.',
      );
      return;
    }
  }

  const email = process.env['E2E_EMAIL'];
  const password = process.env['E2E_PASSWORD'];

  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL and E2E_PASSWORD must be set to run the authenticated suite.\n' +
        "Example: E2E_EMAIL='admin@chefer.dev' E2E_PASSWORD='...' pnpm test:e2e\n" +
        'Seeded local accounts are listed in CLAUDE.md.',
    );
  }

  // Fail fast on documentation placeholders rather than burning a browser
  // launch and a round trip to the API to be told the credentials are wrong.
  const PLACEHOLDERS = ['you@example.com', 'your-email', 'your-password', 'your_password'];
  if (PLACEHOLDERS.includes(email) || PLACEHOLDERS.includes(password)) {
    throw new Error(
      'E2E_EMAIL / E2E_PASSWORD still hold the example placeholder values.\n' +
        'Substitute a real account before running — the seeded local accounts are in CLAUDE.md.',
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
  // Scope the alert to the form. A bare getByRole('alert') also matches the
  // Next.js dev-tools live region, which is present and empty from page load —
  // racing against that made the failure branch win instantly on every run,
  // including successful logins. Inside the form, an alert is either the
  // server error or a field validation message; both mean we did not get in.
  const formAlert = page.locator('form [role="alert"]').first();

  await Promise.race([
    page.waitForURL('**/dashboard', { timeout: 20_000 }),
    formAlert.waitFor({ timeout: 20_000 }).then(async () => {
      // Give React a beat to fill the alert — it mounts before its text lands.
      await page.waitForTimeout(250);
      const message = (await formAlert.textContent())?.trim();
      throw new Error(
        `Login failed for ${email}: ${message || 'the form rejected the credentials'}`,
      );
    }),
  ]);

  await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeAttached();

  await page.context().storageState({ path: AUTH_FILE });
});
