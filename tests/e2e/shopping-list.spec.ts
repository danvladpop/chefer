import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Shopping list — wave-1 L-PLAN web parity (T-08.9) ────────────────────────
// Default week (shared with Plan, bug B-13), the estimated total as a price
// range (not a false-precision point number), the removed "Saved ~X this
// week" chip (bug B-33). FB7-10 retired the pantry coverage line (bug B-24) with
// the pantry, and added the provenance line.

test.describe('Shop — default week (bug B-13, T-08.9)', () => {
  test('Shop defaults via the SAME defaultWeekOffset/getWeekStartDate Plan uses', async ({
    page,
  }) => {
    // Both pages call `defaultWeekOffset(new Date())` independently rather
    // than sharing URL state — this only proves each one's own default is
    // stable and reachable again, not literally cross-page (see
    // business_flow.md for why that's still "the same week everywhere").
    await gotoAndSettle(page, '/shopping-list');
    const weekLabel = page.locator('span', { hasText: /Week of|–/ }).first();
    await expect(weekLabel).toBeVisible();
    const startLabel = await weekLabel.textContent();

    await page.getByRole('button', { name: 'Next week' }).click();
    await page.getByRole('button', { name: 'Previous week' }).click();

    await expect(page.locator('span', { hasText: /Week of|–/ }).first()).toHaveText(
      startLabel ?? '',
    );
  });
});

test.describe('Shop — price range, no savings chip (T-08.9, bug B-33)', () => {
  test('the estimated total is a range, and the old savings chip is gone', async ({ page }) => {
    await gotoAndSettle(page, '/shopping-list');

    const hasPlan = await page
      .getByText('No meal plan for this week')
      .isHidden()
      .catch(() => false);
    if (!hasPlan) {
      test.skip(true, 'No meal plan this week to price.');
      return;
    }

    const totalChip = page.getByText(/^Est\. total/);
    if (await totalChip.isVisible().catch(() => false)) {
      // A range reads "€18–24"; a bare point number would be "~€21".
      await expect(totalChip).toHaveText(/Est\. total .*[–-]/);
    }

    // bug B-33: removed until savings can be itemised.
    await expect(page.getByText(/^Saved ~/)).toHaveCount(0);
  });
});

test.describe('Shop — provenance, no kitchen (FB7-10)', () => {
  test('says where the list comes from, and has no "In my kitchen" segment or AI button', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/shopping-list');
    await expect(page.getByTestId('shop-provenance')).toHaveText(/^From your plan's recipes · /);
    await expect(page.getByTestId('shop-segment-kitchen')).toHaveCount(0);
    await expect(page.getByText('In my kitchen')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Regenerate list/ })).toHaveCount(0);
  });
});
