import { expect, test, type Page } from '@playwright/test';
import { newPersona, registerAccount } from './helpers/coaching';

// ─── Trainer mode M1 (docs/prd-2026-10/trainer-mode.md §5, §6.1, §6.4, §6.8) ───
// A fresh trainer switches to Trainer from the ModeSwitch, lands on Trainer
// Today, walks Clients and Trainer settings, and switches back to Food.
// Registers its own throwaway account (no seed data). Needs the API with
// FEATURE_FLAGS=coaching,trainerMode and TRAINER_ALLOWLIST=*; with trainerMode
// off the Trainer segment never appears and this spec fails at the first step.

/** Trainer tools on from /trainer; with trainer mode on, /trainer hands over to Today. */
async function turnOnTrainerMode(page: Page, displayName: string): Promise<void> {
  await page.goto('/trainer');
  await page.getByLabel('Your name as clients see it').fill(displayName);
  await page.getByRole('button', { name: 'Turn on' }).click();
  await page.waitForURL('**/trainer/today', { timeout: 15_000 });
}

async function expectOneH1(page: Page, name: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
}

test.describe('Trainer mode (desktop)', () => {
  test('switch to Trainer, walk Today · Clients · Settings, switch back to Food', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { context, page } = await newPersona(browser);
    await registerAccount(page, 'Tara');
    await turnOnTrainerMode(page, 'Coach Tara');

    // Start from a neutral page in Food mode.
    await page.goto('/profile');
    const sidebar = page.locator('aside');
    const foodSegment = sidebar.getByTestId('mode-switch-food');
    await foodSegment.click();
    await expect(foodSegment).toHaveAttribute('aria-pressed', 'true');
    // "Clients" left the Food lists: the Trainer segment replaces it.
    await expect(sidebar.getByRole('link', { name: 'Clients' })).toHaveCount(0);

    // Switch: lands on Trainer Today, one h1, the trainer nav, announced.
    await sidebar.getByTestId('mode-switch-trainer').click();
    await page.waitForURL('**/trainer/today');
    await expectOneH1(page, 'Today');
    await expect(sidebar.getByTestId('mode-switch-trainer')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('mode-announcement')).toHaveText('Trainer mode');
    const primary = sidebar.getByRole('navigation', { name: 'Primary' });
    for (const label of ['Today', 'Schedule', 'Clients', 'Workouts', 'Trainer settings']) {
      await expect(primary.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    // A brand-new trainer: the three first steps.
    const empty = page.getByTestId('trainer-today-empty');
    await expect(empty.getByRole('button', { name: 'Invite a client' })).toBeVisible();
    await expect(empty.getByRole('link', { name: 'Build a template' })).toBeVisible();
    await expect(empty.getByRole('link', { name: 'Add a booking' })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'chefer_mode')?.value).toBe('trainer');

    // Clients.
    await primary.getByRole('link', { name: 'Clients', exact: true }).click();
    await page.waitForURL('**/trainer/clients');
    await expectOneH1(page, 'Clients');
    await expect(page.getByTestId('trainer-clients-capacity')).toHaveText('0 of 50 clients');
    await expect(page.getByRole('button', { name: 'Invite a client' })).toBeVisible();

    // Trainer settings.
    await primary.getByRole('link', { name: 'Trainer settings', exact: true }).click();
    await page.waitForURL('**/trainer/settings');
    await expectOneH1(page, 'Trainer settings');
    await expect(page.getByTestId('trainer-settings-availability')).toContainText(
      'Accepting new clients',
    );
    await expect(page.getByLabel('Your name as clients see it')).toHaveValue('Coach Tara');

    // The old entry point hands over to trainer mode.
    await page.goto('/trainer');
    await page.waitForURL('**/trainer/today');

    // Back to Food.
    await sidebar.getByTestId('mode-switch-food').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/trainer'));
    await expect(page.getByTestId('mode-announcement')).toHaveText('Personal mode');
    expect((await context.cookies()).find((c) => c.name === 'chefer_mode')?.value).toBe('food');

    await context.close();
  });
});

test.describe('Trainer mode (phone)', () => {
  test('the tab bar reads Schedule · Clients · Today · Workouts · More', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await newPersona(browser);
    await page.setViewportSize({ width: 390, height: 844 });
    await registerAccount(page, 'Tom');
    await turnOnTrainerMode(page, 'Coach Tom');

    await page.goto('/profile');
    const header = page.getByRole('banner');
    await header.getByTestId('mode-switch-food').click();
    await header.getByTestId('mode-switch-trainer').click();
    await page.waitForURL('**/trainer/today');
    await expectOneH1(page, 'Today');

    const tabBar = page.locator('nav[aria-label="Primary"]').filter({ hasText: 'More' });
    await expect(tabBar.getByRole('listitem')).toHaveText([
      'Schedule',
      'Clients',
      'Today',
      'Workouts',
      'More',
    ]);
    await tabBar.getByRole('link', { name: 'Schedule' }).click();
    await page.waitForURL('**/trainer/schedule');
    await expectOneH1(page, 'Schedule');
    await expect(page.getByTestId('trainer-coming-soon')).toBeVisible();

    // No horizontal scroll with three segments in the header.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await context.close();
  });
});
