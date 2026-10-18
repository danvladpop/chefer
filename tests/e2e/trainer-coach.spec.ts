import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  completeGymSetup,
  createInvite,
  newPersona,
  registerAccount,
  registerFromInvite,
} from './helpers/coaching';

// ─── Trainer mode M3: coach this session (docs/prd-2026-10/trainer-mode.md §6.7) ─
// A fresh trainer links a client, books them for a slot starting in a few
// minutes (created through the API with the trainer's own session), opens the
// booking, Starts it, logs one set and finishes. The client's history then
// says "Logged by …" and the booking shows the client as Attended. Registers its
// own throwaway accounts. Needs the API with
// FEATURE_FLAGS=coaching,trainerMode and TRAINER_ALLOWLIST=*.

async function turnOnTrainerMode(page: Page, displayName: string): Promise<void> {
  await page.goto('/trainer');
  await page.getByLabel('Your name as clients see it').fill(displayName);
  await page.getByRole('button', { name: 'Turn on' }).click();
  await page.waitForURL('**/trainer/today', { timeout: 15_000 });
}

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

/** The trainer's device-local slot a few minutes from now (5-minute grid), and its zone. */
async function slotSoon(page: Page): Promise<{ date: string; time: string; timeZone: string }> {
  return page.evaluate(() => {
    const at = new Date(Date.now() + 5 * 60_000);
    at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
      time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  });
}

test.describe('Coach this session (desktop)', () => {
  test('start a booking, log a set, finish: client history and attendance', async ({ browser }) => {
    test.setTimeout(240_000);

    const trainer = await newPersona(browser);
    const page = trainer.page;
    await registerAccount(page, 'Tina');
    await turnOnTrainerMode(page, 'Coach Tina');

    await page.goto('/trainer/clients');
    const invite = await createInvite(page, 'Ada');
    const ada = await joinAsClient(browser, invite, 'Ada');

    // The client's id, from client detail's address.
    await page.goto('/trainer/clients');
    await page.getByTestId('trainer-client-row').filter({ hasText: 'Ada Tester' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ada Tester' })).toBeVisible({
      timeout: 15_000,
    });
    const clientId = decodeURIComponent(new URL(page.url()).pathname.split('/')[2] ?? '');
    expect(clientId).not.toBe('');
    // Client detail offers a coached workout with no booking too.
    await expect(page.getByTestId('trainer-log-workout')).toHaveText(/Log a workout for Ada/);

    // A booking starting within minutes, made with the trainer's own session.
    const slot = await slotSoon(page);
    const created = await page.request.post('/trpc/trainer.bookings.create', {
      headers: { 'x-trpc-source': 'nextjs-react', 'x-chefer-api-level': '8' },
      data: {
        json: { kind: 'BOOKING', ...slot, durationMin: 60, clients: [{ clientId }] },
      },
    });
    expect(created.ok()).toBe(true);
    const body = (await created.json()) as { result: { data: { json: { id: string } } } };
    const bookingId = body.result.data.json.id;

    // Booking detail → Start → the coached logger for Ada.
    await page.goto(`/trainer/bookings/${encodeURIComponent(bookingId)}`);
    await page.getByTestId('booking-start').first().click();
    await page.waitForURL(`**/trainer/coach/${bookingId}**`);
    await expect(page.getByRole('heading', { level: 1, name: 'Coaching Ada' })).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole('button', { name: /^Log set/ })
      .first()
      .click();
    await expect(page.getByLabel(/^1 of \d+ sets done$/)).toBeVisible();
    await page.getByTestId('coach-finish').click();
    await page.getByTestId('coach-finish-this').click();

    // Saved: back on the booking, Ada attended.
    await page.waitForURL(`**/trainer/bookings/${bookingId}`, { timeout: 20_000 });
    await expect(page.getByText('Attended').first()).toBeVisible({ timeout: 15_000 });

    // Ada's own history: the workout, logged by her trainer.
    await ada.page.goto('/gym/history');
    await expect(ada.page.getByText(/Logged by (Coach )?Tina/).first()).toBeVisible({
      timeout: 15_000,
    });

    // The trainer's Workouts tab for Ada: "Logged by you".
    await page.goto(`/trainer/${encodeURIComponent(clientId)}`);
    await expect(page.getByTestId('trainer-workout-logged-by').first()).toHaveText(
      'Logged by you',
      { timeout: 15_000 },
    );

    await ada.context.close();
    await trainer.context.close();
  });
});
