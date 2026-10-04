import { expect, test } from '@playwright/test';
import {
  completeGymSetup,
  createInvite,
  newPersona,
  registerAccount,
  registerFromInvite,
  turnOnTrainerTools,
} from './helpers/coaching';

// ─── WP-18: trainer coaching on the web (global acceptance 1–7 and 10) ────────
// activate → invite → a second browser context registers and joins → the trainer
// edits the routine (note) and sets a next-session target → the client sees the
// stamps, the note and "Set by" → the private note saves → the client leaves.

test.describe('Trainer coaching (desktop)', () => {
  test('trainer coaches a client end to end', async ({ browser }) => {
    test.setTimeout(240_000);

    const trainer = await newPersona(browser);
    await registerAccount(trainer.page, 'Tess');
    await turnOnTrainerTools(trainer.page, 'Coach Tess');
    const invitePath = await createInvite(trainer.page, 'Ada, Tue/Thu');

    // Client: sign up from the link, gym setup, consent, joined.
    const client = await newPersona(browser);
    await registerFromInvite(client.page, invitePath, 'Ada');
    await client.page.getByRole('link', { name: 'Set up training' }).click();
    await completeGymSetup(client.page);
    await client.page.getByRole('link', { name: 'Carry on joining your trainer' }).click();
    await client.page.getByRole('button', { name: 'Allow and join' }).click();
    await expect(client.page.getByTestId('coaching-joined')).toBeVisible();

    // Trainer: the client is on the list; open the routine tab.
    await trainer.page.goto('/trainer');
    const row = trainer.page.getByTestId('trainer-client-row');
    await expect(row).toContainText('Ada Tester');
    await expect(row).toContainText('Ada, Tue/Thu');
    await row.click();
    await expect(trainer.page.getByRole('heading', { level: 1, name: 'Ada Tester' })).toBeVisible();
    await trainer.page.getByRole('link', { name: 'Routine' }).click();

    // Note on the first exercise, saved with a version check.
    const note = trainer.page.getByLabel('Note for Ada').filter({ visible: true }).first();
    await note.fill('knees out, slow eccentric');
    const save = trainer.page.getByRole('button', { name: 'Save changes' });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();

    // Next-session target on the first strength exercise.
    await trainer.page
      .getByTestId('trainer-next-session')
      .getByRole('button', { name: /^Adjust: / })
      .first()
      .click();
    await trainer.page.getByLabel(/Weight \(/).fill('62.5');
    await trainer.page.getByLabel('Reps per set').fill('6');
    await trainer.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(trainer.page.getByTestId('trainer-next-row').first()).toContainText('set by you');

    // Private note: autosaves and survives a reload.
    const privateNote = trainer.page.getByLabel('Private notes');
    await privateNote.fill('Left knee clicks, goal: June');
    await expect(
      trainer.page.getByTestId('trainer-private-notes').getByRole('status'),
    ).toContainText('Saved');
    await trainer.page.reload();
    await expect(trainer.page.getByLabel('Private notes')).toHaveValue(
      'Left knee clicks, goal: June',
    );

    // Client: stamps, the note, and the Today line.
    await client.page.goto('/gym');
    await expect(client.page.getByTestId('coaching-routine-updated')).toContainText(
      'Coach Tess updated your routine',
    );
    await client.page.goto('/gym/routine');
    await expect(client.page.getByTestId('routine-changed-by')).toContainText(
      'Coach Tess changed your routine',
    );
    await expect(client.page.getByTestId('changed-by')).toHaveCount(1);
    await expect(client.page.getByTestId('trainer-note')).toContainText(
      'Coach Tess: knees out, slow eccentric',
    );
    // Opening the routine cleared the Today line.
    await client.page.goto('/gym');
    await expect(client.page.getByTestId('coaching-routine-updated')).toHaveCount(0);

    // The private note never reaches the client.
    await expect(client.page.getByText('Left knee clicks')).toHaveCount(0);

    // Client leaves: the trainer loses access at once.
    await client.page.goto('/profile');
    await client.page.getByRole('button', { name: 'Leave', exact: true }).click();
    await client.page.getByRole('button', { name: 'Leave trainer' }).click();
    await expect(client.page.getByTestId('your-trainer-card')).toContainText(
      'You don’t have a trainer in Chefer.',
    );
    await trainer.page.goto('/trainer');
    await expect(trainer.page.getByTestId('trainer-client-row')).toHaveCount(0);

    await Promise.all([trainer.context.close(), client.context.close()]);
  });
});
