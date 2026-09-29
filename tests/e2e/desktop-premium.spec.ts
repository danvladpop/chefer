import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── /premium — a paywall that names the job (UX-10, T-10.5) ──────────────────
// The hero is headlined by the job that linked here, the free-for-now terms
// are plain text, and no page says "beta" (App Review 2.2) or the retired
// generic pitch (B-32). Read-only: this never turns Premium on — the E2E
// account is shared, and nothing here needs it to change tier.

const TERMS =
  "Premium costs nothing for now, and we won't ask for a card. Before it has a price, we'll tell you in the app at least 30 days ahead and you choose whether to keep it. Nothing changes automatically.";

test.describe('/premium', () => {
  test('the hero names the job that linked here, and carries the free-for-now terms', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/premium?source=recipe-import');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Turn your saved links and videos into recipes',
    );
    const bullets = page.getByTestId('premium-hero-bullets').getByRole('listitem');
    await expect(bullets.first()).toContainText(
      'Import from a link, pasted text or a cooking video',
    );

    const terms = page.getByTestId('premium-terms');
    await expect(terms).toContainText('FREE FOR NOW');
    await expect(terms).toContainText(TERMS);
  });

  test('a household source is headlined by the table', async ({ page }) => {
    await gotoAndSettle(page, '/premium?source=household');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Keep portions');
  });

  test('no beta wording, no retired generic pitch', async ({ page }) => {
    for (const path of ['/premium', '/premium?source=chat-locked', '/premium?source=pantry']) {
      await gotoAndSettle(page, path);
      const text = await page.locator('main').innerText();
      expect(text).not.toMatch(/\bbeta\b/i);
      expect(text).not.toMatch(/AI meal plans tailored|nutrition profile/i);
    }
  });

  test('the FAQ promises notice, a choice and no automatic change', async ({ page }) => {
    await gotoAndSettle(page, '/premium');
    await expect(page.getByText('at least 30 days ahead')).toBeVisible();
    await expect(page.getByText('nothing changes automatically')).toBeVisible();
  });
});
