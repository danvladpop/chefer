import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// ─── Shared steps for the trainer-coaching specs (WP-18) ──────────────────────
// Each spec registers its own throwaway accounts in separate browser contexts
// (a trainer and one or two clients), so nothing depends on the suite's saved
// session. Needs the API with FEATURE_FLAGS=coaching and TRAINER_ALLOWLIST=*.

export const PASSWORD = 'Sup3rSecret!';

export function throwawayEmail(tag: string): string {
  return `e2e-wp18-${tag}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
}

/** A fresh browser context (own cookies) with a desktop-sized page. */
export async function newPersona(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return { context, page: await context.newPage() };
}

/** Fills and submits the register form on the page it is already showing. */
export async function submitRegisterForm(
  page: Page,
  firstName: string,
  email: string,
): Promise<void> {
  await page.getByLabel(/first name/i).fill(firstName);
  await page.getByLabel(/last name/i).fill('Tester');
  await page.getByLabel(/email address/i).fill(email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD);
  await page.getByLabel(/confirm password/i).fill(PASSWORD);
  await page.getByRole('checkbox', { name: /terms/i }).check();
  await page.getByRole('checkbox', { name: /16 or older/i }).check();
  await page.getByRole('button', { name: /create account/i }).click();
}

/** Registers a new account from /register and waits for the onboarding landing. */
export async function registerAccount(page: Page, firstName: string): Promise<string> {
  const email = throwawayEmail(firstName.toLowerCase());
  await page.goto('/register');
  await submitRegisterForm(page, firstName, email);
  await page.waitForURL('**/onboarding', { timeout: 20_000 });
  return email;
}

/** Trainer tools on (Profile → Trainer tools → Turn on), landing on Clients. */
export async function turnOnTrainerTools(page: Page, displayName: string): Promise<void> {
  await page.goto('/trainer');
  await page.getByLabel('Your name as clients see it').fill(displayName);
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Clients' })).toBeVisible({
    timeout: 15_000,
  });
}

/** Clients → Invite a client → Create link; returns the join path (`/coaching/join/<code>`). */
export async function createInvite(page: Page, label: string): Promise<string> {
  await page.getByRole('button', { name: 'Invite a client' }).click();
  await page.getByLabel('Private label (optional)').fill(label);
  await page.getByRole('button', { name: 'Create link' }).click();
  const link = page.getByLabel('Invite link');
  await expect(link).toBeVisible({ timeout: 15_000 });
  const url = await link.inputValue();
  await page.getByRole('button', { name: 'Done' }).click();
  return new URL(url).pathname;
}

/** Walks the gym setup wizard with its defaults (the engine needs a gym profile before a join). */
export async function completeGymSetup(page: Page): Promise<void> {
  await page.waitForURL('**/gym/setup**', { timeout: 20_000 });
  await expect(page.getByTestId('gym-setup')).toBeVisible({ timeout: 15_000 });
  for (let step = 0; step < 4; step++) {
    await page.getByTestId('setup-next').click();
  }
  await expect(page.getByTestId('setup-program')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('setup-start-calibrate').click();
  await page.getByTestId('setup-finish').click();
  await expect(page.getByTestId('setup-done')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('setup-go-today').click();
  await page.waitForURL(/\/gym$/);
}

/**
 * A signed-out visitor opens an invite link, signs up from the login page and
 * lands back on the join page (the `?next=` hand-off).
 */
export async function registerFromInvite(
  page: Page,
  invitePath: string,
  firstName: string,
): Promise<void> {
  await page.goto(invitePath);
  await page.waitForURL(/\/login\?next=/);
  await page.getByRole('link', { name: 'Sign up' }).click();
  await page.waitForURL(/\/register\?next=/);
  await submitRegisterForm(page, firstName, throwawayEmail(firstName.toLowerCase()));
  await page.waitForURL(`**${invitePath}`, { timeout: 20_000 });
}
