import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  completeGymSetup,
  createInvite,
  newPersona,
  registerAccount,
  registerFromInvite,
} from './helpers/coaching';

// ─── Trainer mode M2: workout templates (docs/prd-2026-10/trainer-mode.md §6.6) ─
// A fresh trainer links two clients (invite → join), builds a template in
// Workouts (name, one exercise, a starting weight), assigns it to both as a new
// day, edits it, and updates both clients' copies. Registers its own throwaway
// accounts (no seed data). Needs the API with FEATURE_FLAGS=coaching,trainerMode
// and TRAINER_ALLOWLIST=*.

/** Trainer tools on from /trainer; with trainer mode on, /trainer hands over to Today. */
async function turnOnTrainerMode(page: Page, displayName: string): Promise<void> {
  await page.goto('/trainer');
  await page.getByLabel('Your name as clients see it').fill(displayName);
  await page.getByRole('button', { name: 'Turn on' }).click();
  await page.waitForURL('**/trainer/today', { timeout: 15_000 });
}

/** A client signs up from the invite, sets up training (a routine) and joins. */
async function joinAsClient(browser: Browser, invitePath: string, firstName: string) {
  const client = await newPersona(browser);
  await registerFromInvite(client.page, invitePath, firstName);
  await client.page.getByRole('link', { name: 'Set up training' }).click();
  await completeGymSetup(client.page);
  await client.page.getByRole('link', { name: 'Carry on joining your trainer' }).click();
  await client.page.getByRole('button', { name: 'Allow and join' }).click();
  await expect(client.page.getByTestId('coaching-joined')).toBeVisible();
  return client;
}

async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('template-save-status')).toHaveText('Saved', { timeout: 15_000 });
}

test.describe('Trainer templates (desktop)', () => {
  test('build a template, assign it to two clients, edit it, update both', async ({ browser }) => {
    test.setTimeout(300_000);

    const trainer = await newPersona(browser);
    const page = trainer.page;
    await registerAccount(page, 'Tina');
    await turnOnTrainerMode(page, 'Coach Tina');

    // Two clients, each from their own invite.
    await page.goto('/trainer/clients');
    const inviteAda = await createInvite(page, 'Ada');
    const inviteBea = await createInvite(page, 'Bea');
    const ada = await joinAsClient(browser, inviteAda, 'Ada');
    const bea = await joinAsClient(browser, inviteBea, 'Bea');

    // Workouts: empty library → New template.
    await page.goto('/trainer/workouts');
    await expect(page.getByRole('heading', { level: 1, name: 'Workouts' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('template-library-empty')).toBeVisible();
    await page
      .getByTestId('template-library-empty')
      .getByRole('link', { name: 'New template' })
      .click();
    await page.waitForURL('**/trainer/workouts/new');
    await expect(page.getByRole('heading', { level: 1, name: 'New template' })).toBeVisible();

    // Name + one exercise: the template is created on its first save, the address follows.
    await page.getByLabel('Name', { exact: true }).fill('Lower body A');
    await page
      .getByRole('button', { name: 'Add exercise' })
      .filter({ visible: true })
      .first()
      .click();
    const picker = page.getByRole('dialog', { name: 'Add exercise' });
    await picker.getByLabel('Search exercises').fill('Back Squat');
    await picker
      .getByRole('button', { name: /Back Squat/ })
      .first()
      .click();
    await expectSaved(page);
    await page.waitForURL((url) => /\/trainer\/workouts\/(?!new)[^/]+$/.test(url.pathname));
    const templatePath = new URL(page.url()).pathname;

    // Starting weight on the strength row.
    await page
      .getByLabel(/Starting weight/)
      .filter({ visible: true })
      .first()
      .fill('60');
    await expectSaved(page);

    // Library: the template, not assigned yet.
    await page.goto('/trainer/workouts');
    const row = page.getByTestId('template-row').filter({ hasText: 'Lower body A' });
    await expect(row).toContainText('1 exercise');
    await expect(row).toContainText('Not assigned yet');
    await row.click();
    await page.waitForURL(`**${templatePath}`);

    // Assign to both clients as a new day.
    await page.getByRole('button', { name: 'Assign to clients' }).click();
    const assign = page.getByRole('dialog', { name: 'Assign Lower body A' });
    await assign.getByRole('checkbox', { name: 'Ada Tester' }).check();
    await assign.getByRole('checkbox', { name: 'Bea Tester' }).check();
    await expect(assign.getByTestId('assign-client-target')).toHaveCount(2);
    await assign.getByRole('button', { name: 'Assign to 2 clients' }).click();
    await expect(assign.getByTestId('assign-results')).toContainText('Assigned to 2 clients', {
      timeout: 15_000,
    });
    await assign.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('template-assignment')).toHaveCount(2);

    await page.goto('/trainer/workouts');
    await expect(
      page.getByTestId('template-row').filter({ hasText: 'Lower body A' }),
    ).toContainText('Assigned to 2 clients');

    // Edit the template: both copies are now an older version.
    await page.goto(templatePath);
    const load = page
      .getByLabel(/Starting weight/)
      .filter({ visible: true })
      .first();
    await expect(load).toHaveValue('60');
    await load.fill('65');
    await expectSaved(page);
    const banner = page.getByTestId('template-outdated-banner');
    await expect(banner).toContainText('2 clients have an older version', { timeout: 15_000 });

    // Update for clients: both ticked (neither edited since).
    await banner.getByRole('button', { name: 'Update for clients' }).click();
    const update = page.getByRole('dialog', { name: 'Update for clients' });
    await expect(update.getByRole('checkbox', { checked: true })).toHaveCount(2);
    await update.getByRole('button', { name: 'Update 2 clients' }).click();
    await expect(update).toHaveCount(0, { timeout: 15_000 });
    await expect(banner).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('template-assignment')).toHaveCount(2);
    for (const assigned of await page.getByTestId('template-assignment').all()) {
      await expect(assigned).toContainText('Up to date');
    }

    await ada.context.close();
    await bea.context.close();
    await trainer.context.close();
  });
});
