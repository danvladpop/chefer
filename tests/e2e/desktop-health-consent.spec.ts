import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Health-information consent, web (UX-26, T-26.2/T-26.4) ───────────────────
// Visible surface only: Profile › Privacy & data hosts the Health information
// card (status + Withdraw / Allow), separate from the AI consent card. The
// consent write contract and the withdraw-and-delete are covered by the API's
// tests and apps/mobile/tests/contract/privacy.contract.test.ts. This spec never
// withdraws: the shared E2E account's other specs rely on its saved allergies.

test.describe('Profile: health information card', () => {
  test('is shown next to (not merged with) the AI consent card', async ({ page }) => {
    await gotoAndSettle(page, '/profile');

    const health = page.getByTestId('health-consent-card');
    await expect(health).toBeVisible();
    await expect(health.getByRole('heading', { name: 'Health information' })).toBeVisible();
    await expect(page.getByTestId('ai-consent-card')).toBeVisible();

    // Either state is valid for the shared account: consented (Withdraw) or not (Allow).
    await expect(health.getByTestId('health-consent-status')).toHaveText(/Allowed on|Not allowed/);
    await expect(
      health.getByRole('button', { name: /Withdraw and delete|Allow health information/ }),
    ).toBeVisible();
  });

  test('Withdraw asks for confirmation first (and Keep leaves everything alone)', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/profile');
    const withdraw = page.getByTestId('health-withdraw');
    test.skip((await withdraw.count()) === 0, 'account has no health consent on record');

    await withdraw.click();
    await expect(page.getByText('Delete your health information?')).toBeVisible();
    await page.getByRole('button', { name: 'Keep' }).click();
    await expect(page.getByText('Delete your health information?')).toBeHidden();
    await expect(page.getByTestId('health-consent-status')).toHaveText(/Allowed on/);
  });
});
