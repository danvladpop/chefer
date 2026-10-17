import { expect, test } from '@playwright/test';
import {
  completeGymSetup,
  newPersona,
  registerAccount,
  turnOnTrainerTools,
} from './helpers/coaching';

// ─── PRD 2026-10 §4.1–4.2: a client finds a trainer and asks ──────────────────
// Find a trainer → trainer profile → "Ask to coach me" → consent → request sent
// → the trainer accepts from Requests → the client sees their trainer → the
// trainer edits the routine → the client's Today shows the "updated your
// routine" card with the change list, and View dismisses it.

test.describe('Coaching: Find a trainer and coaching requests', () => {
  test('client asks, trainer accepts, client sees the routine update', async ({ browser }) => {
    test.setTimeout(240_000);

    // A unique display name, so the name search finds exactly this trainer.
    const trainerName = `Coach ${Date.now().toString(36)}`;
    const trainer = await newPersona(browser);
    await registerAccount(trainer.page, 'Tess');
    await turnOnTrainerTools(trainer.page, trainerName);

    // Client: a plain account with gym setup done (asking needs it, like an invite).
    const client = await newPersona(browser);
    await registerAccount(client.page, 'Ada');
    await client.page.goto('/gym/setup');
    await completeGymSetup(client.page);

    // Profile → Your trainer → Find a trainer.
    await client.page.goto('/profile');
    await client.page.getByTestId('find-trainer-entry').click();
    await client.page.waitForURL('**/coaching/find');
    await client.page.getByLabel('Search trainers by name').fill(trainerName);
    const result = client.page.getByTestId('find-trainer-result').filter({ hasText: trainerName });
    await expect(result).toHaveCount(1, { timeout: 15_000 });
    await expect(result).toContainText('Trainer');
    await result.click();

    // Trainer profile → Ask → consent → sent.
    await expect(client.page.getByRole('heading', { level: 1, name: trainerName })).toBeVisible();
    await expect(
      client.page.getByText('Chefer does not verify trainers’ credentials.'),
    ).toBeVisible();
    await client.page.getByRole('button', { name: 'Ask to coach me' }).click();
    await expect(
      client.page.getByRole('heading', { level: 1, name: `Ask ${trainerName} to coach you?` }),
    ).toBeVisible();
    await client.page.getByRole('button', { name: 'Allow and send request' }).click();
    await expect(client.page.getByTestId('coaching-request-sent')).toContainText(
      `Request sent to ${trainerName}`,
    );

    // The pending request shows on Your trainer.
    await client.page.goto('/profile');
    await expect(client.page.getByTestId('your-trainer-request')).toContainText(
      `Waiting for ${trainerName} to answer`,
    );

    // Trainer: Requests → Accept → the client is on the list.
    await trainer.page.goto('/trainer');
    const request = trainer.page
      .getByTestId('trainer-request-row')
      .filter({ hasText: 'Ada Tester asked you to coach them' });
    await expect(request).toBeVisible({ timeout: 15_000 });
    await request.getByRole('button', { name: 'Accept: Ada Tester' }).click();
    await expect(trainer.page.getByTestId('trainer-request-row')).toHaveCount(0);
    const row = trainer.page.getByTestId('trainer-client-row');
    await expect(row).toContainText('Ada Tester');

    // Client: coached now, and told so on Today.
    await client.page.goto('/profile');
    await expect(client.page.getByTestId('your-trainer-card')).toContainText(
      `Coached by ${trainerName} since`,
    );
    await client.page.goto('/gym');
    const notices = client.page.getByTestId('coaching-notice');
    await expect(notices.filter({ hasText: `${trainerName} is now your trainer` })).toBeVisible();
    await notices
      .filter({ hasText: `${trainerName} is now your trainer` })
      .getByRole('button', { name: 'Dismiss' })
      .click();
    await expect(notices.filter({ hasText: `${trainerName} is now your trainer` })).toHaveCount(0);

    // Trainer edits the client's routine: a note on the first exercise.
    await row.click();
    await expect(trainer.page.getByRole('heading', { level: 1, name: 'Ada Tester' })).toBeVisible();
    await trainer.page.getByRole('link', { name: 'Routine' }).click();
    const note = trainer.page.getByLabel('Note for Ada').filter({ visible: true }).first();
    await note.fill('brace before each rep');
    const save = trainer.page.getByRole('button', { name: 'Save changes' });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();

    // Client: the "updated your routine" card lists the change; View opens the routine.
    await client.page.goto('/gym');
    const updated = client.page.getByTestId('coaching-routine-updated');
    await expect(updated).toContainText(`${trainerName} updated your routine`, {
      timeout: 15_000,
    });
    await expect(updated).toContainText('note on');
    await updated.getByRole('link', { name: 'View' }).click();
    await client.page.waitForURL('**/gym/routine');
    await expect(client.page.getByTestId('trainer-note')).toContainText('brace before each rep');
    await client.page.goto('/gym');
    await expect(client.page.getByTestId('coaching-routine-updated')).toHaveCount(0);

    await Promise.all([trainer.context.close(), client.context.close()]);
  });
});
