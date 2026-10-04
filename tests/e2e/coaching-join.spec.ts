import { expect, test } from '@playwright/test';
import {
  completeGymSetup,
  createInvite,
  newPersona,
  registerAccount,
  registerFromInvite,
  turnOnTrainerTools,
} from './helpers/coaching';

// ─── WP-18: the invite link's states (spec §2.3) ──────────────────────────────
// Self, used and unknown links show their own copy and no consent screen. (An
// expired link needs the clock; the same copy path is unit-tested in JoinFlow.test.tsx.)
// Also proves the signed-out hand-off: invite → sign up → back on the same page.

test.describe('Coaching: join page states', () => {
  test('self, unknown and used invite links', async ({ browser }) => {
    test.setTimeout(150_000);

    const trainer = await newPersona(browser);
    await registerAccount(trainer.page, 'Tess');
    await turnOnTrainerTools(trainer.page, 'Coach Tess');
    const invitePath = await createInvite(trainer.page, 'E2E client');

    // Self: the trainer opening their own link.
    await trainer.page.goto(invitePath);
    await expect(trainer.page.getByTestId('coaching-invite-message')).toContainText(
      'This is your own invite link',
    );
    await expect(trainer.page.getByRole('button', { name: 'Allow and join' })).toHaveCount(0);

    // Unknown: a code that never existed.
    await trainer.page.goto('/coaching/join/ZZZZZZZZZZ');
    await expect(trainer.page.getByTestId('coaching-invite-message')).toContainText(
      'This invite link isn’t valid',
    );

    // A client signs up from the link, sets up training, and joins.
    const client = await newPersona(browser);
    await registerFromInvite(client.page, invitePath, 'Ada');
    await expect(client.page.getByText('Set up your training first')).toBeVisible();
    await client.page.getByRole('link', { name: 'Set up training' }).click();
    await completeGymSetup(client.page);
    await client.page.getByRole('link', { name: 'Carry on joining your trainer' }).click();
    await expect(
      client.page.getByRole('heading', {
        level: 1,
        name: 'Coach Tess wants to coach you in Chefer.',
      }),
    ).toBeVisible();
    await client.page.getByRole('button', { name: 'Allow and join' }).click();
    await expect(client.page.getByTestId('coaching-joined')).toContainText(
      'You’re coached by Coach Tess',
    );

    // Used: a third person opens the same single-use link.
    const third = await newPersona(browser);
    await registerAccount(third.page, 'Bob');
    await third.page.goto(invitePath);
    await expect(third.page.getByTestId('coaching-invite-message')).toContainText(
      'This invite link was already used',
    );

    await Promise.all([trainer.context.close(), client.context.close(), third.context.close()]);
  });
});
