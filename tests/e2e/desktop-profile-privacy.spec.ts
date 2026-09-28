import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Profile › privacy & analytics (T-12.3, T-39.2, T-39.4) ───────────────────
// The "Usage analytics" card ships two switches (anonymous default on,
// linking default off and disabled while anonymous is off), and Profile
// hosts a consent log / AI-consent / your-data section. This sweeps the
// visible surface only — the actual consent-write contract is covered by
// the API's own tests (privacy.service.test.ts, analytics.test.ts).

test.describe('Profile: usage analytics consent card', () => {
  test('shows anonymous on, linked off by default, with a working link toggle', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/profile');

    const card = page.getByTestId('analytics-consent-card');
    await expect(card).toBeVisible();

    const switches = card.getByRole('switch');
    await expect(switches).toHaveCount(2);
    const anonymous = switches.nth(0);
    const linked = switches.nth(1);

    await expect(anonymous).toHaveAttribute('aria-checked', 'true');
    await expect(linked).toHaveAttribute('aria-checked', 'false');

    await linked.click();
    await expect(linked).toHaveAttribute('aria-checked', 'true');

    // Reset so the E2E account starts clean for the next run.
    await linked.click();
    await expect(linked).toHaveAttribute('aria-checked', 'false');
  });

  test('turning anonymous off disables and turns off linking', async ({ page }) => {
    await gotoAndSettle(page, '/profile');
    const card = page.getByTestId('analytics-consent-card');
    const switches = card.getByRole('switch');
    const anonymous = switches.nth(0);
    const linked = switches.nth(1);

    await linked.click();
    await expect(linked).toHaveAttribute('aria-checked', 'true');

    await anonymous.click();
    await expect(anonymous).toHaveAttribute('aria-checked', 'false');
    await expect(linked).toHaveAttribute('aria-checked', 'false');
    await expect(linked).toBeDisabled();

    // Reset so the E2E account starts clean for the next run.
    await anonymous.click();
  });

  test('Privacy policy link opens the analytics section', async ({ page }) => {
    await gotoAndSettle(page, '/profile');
    const card = page.getByTestId('analytics-consent-card');
    await card.getByRole('link', { name: 'Privacy policy' }).click();
    await expect(page).toHaveURL(/\/privacy#analytics$/);
  });
});
