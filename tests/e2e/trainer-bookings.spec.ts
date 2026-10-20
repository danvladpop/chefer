import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  completeGymSetup,
  createInvite,
  newPersona,
  registerAccount,
  registerFromInvite,
} from './helpers/coaching';

// ─── Trainer mode M3: bookings (docs/prd-2026-10/trainer-mode.md §6.2–§6.3, §6.9) ─
// A fresh trainer links two clients, adds a weekly booking with both from the
// Schedule, finds it in the week, opens it, marks one client attended, and
// cancels "this and following" (the booking stays, greyed). The first client
// sees the upcoming-booking card on Today before the cancel. Registers its own
// throwaway accounts. Needs the API with FEATURE_FLAGS=coaching,trainerMode and
// TRAINER_ALLOWLIST=*.
//
// The booking starts 11–15 minutes from now: attendance opens 15 minutes
// before the start, and cancelling needs a booking that has not started yet.

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

/** A start 11–15 minutes ahead in the browser's zone, on the 5-minute grid. */
async function soonSlot(page: Page): Promise<{ date: string; time: string }> {
  return page.evaluate(() => {
    const step = 5 * 60_000;
    const t = new Date(Math.ceil((Date.now() + 11 * 60_000) / step) * step);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`,
      time: `${pad(t.getHours())}:${pad(t.getMinutes())}`,
    };
  });
}

test.describe('Trainer bookings (desktop)', () => {
  test('weekly booking with two clients: week, detail, attendance, client card, cancel following', async ({
    browser,
  }) => {
    test.setTimeout(300_000);

    const trainer = await newPersona(browser);
    const page = trainer.page;
    await registerAccount(page, 'Tina');
    await turnOnTrainerMode(page, 'Coach Tina');

    await page.goto('/trainer/clients');
    const inviteAda = await createInvite(page, 'Ada');
    const inviteBea = await createInvite(page, 'Bea');
    const ada = await joinAsClient(browser, inviteAda, 'Ada');
    const bea = await joinAsClient(browser, inviteBea, 'Bea');

    // Schedule: Week view on desktop.
    await page.goto('/trainer/schedule');
    await expect(page.getByRole('heading', { level: 1, name: 'Schedule' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Add a weekly booking with both clients.
    const slot = await soonSlot(page);
    await page.getByRole('button', { name: 'Add a booking' }).click();
    const editor = page.getByRole('dialog', { name: 'New booking' });
    await editor.getByRole('checkbox', { name: 'Ada Tester' }).check();
    await editor.getByRole('checkbox', { name: 'Bea Tester' }).check();
    await editor.getByLabel('Date', { exact: true }).fill(slot.date);
    await editor.getByLabel('Start', { exact: true }).fill(slot.time);
    await editor.getByRole('radio', { name: 'Every week' }).check();
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(editor).toHaveCount(0, { timeout: 15_000 });

    // It appears in the week (the next week when "soon" crosses Sunday midnight).
    const block = page.getByRole('button', {
      name: new RegExp(`^\\w+day ${slot.time} to \\d{2}:\\d{2}, Ada \\+ 1`),
    });
    if ((await block.count()) === 0) await page.getByRole('button', { name: 'Next week' }).click();
    await expect(block).toBeVisible({ timeout: 15_000 });

    // Detail: mark Ada attended.
    await block.click();
    await page.waitForURL('**/trainer/bookings/**');
    await expect(page.getByRole('heading', { level: 1, name: 'Ada + 1' })).toBeVisible();
    const adaAttendance = page.getByRole('group', { name: 'Attendance: Ada Tester' });
    await adaAttendance.getByRole('button', { name: 'Attended' }).click();
    await expect(adaAttendance.getByRole('button', { name: 'Attended' })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 15_000 },
    );

    // Ada sees the upcoming-booking card on Today (no other client's name).
    await ada.page.goto('/dashboard');
    const card = ada.page.getByTestId('client-booking-card');
    await expect(card).toContainText('Session with Coach Tina', { timeout: 15_000 });
    await expect(card).toContainText('with 1 other');
    await expect(card).not.toContainText('Bea');

    // Cancel this and following, with a reason: the booking stays, greyed.
    await page.getByRole('button', { name: 'Cancel booking' }).click();
    const cancel = page.getByRole('dialog', { name: 'Cancel this booking?' });
    await cancel.getByRole('radio', { name: 'This and following' }).check();
    await cancel.getByLabel('Reason (optional, clients see it)').fill('Gym closed');
    await cancel.getByRole('button', { name: 'Cancel booking' }).click();
    await expect(cancel).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('booking-cancelled')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('booking-cancel-reason')).toHaveText('Gym closed');
    await expect(page.getByTestId('booking-detail')).toHaveAttribute('data-cancelled', 'true');

    await page.getByRole('link', { name: 'Schedule' }).first().click();
    await page.waitForURL('**/trainer/schedule');
    if ((await block.count()) === 0) await page.getByRole('button', { name: 'Next week' }).click();
    await expect(block).toHaveAccessibleName(/, Cancelled$/, { timeout: 15_000 });

    await ada.context.close();
    await bea.context.close();
    await trainer.context.close();
  });
});
