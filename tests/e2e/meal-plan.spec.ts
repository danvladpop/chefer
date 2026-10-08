import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Meal plan — wave-1 L-PLAN web parity (T-07.6/T-08.9) ─────────────────────
// Default week persistence, Week options → new plan → confirm → Undo, and
// Replace → Undo. Desktop only for now (project "plan",
// playwright.config.ts) — the mobile-first single-day view is exercised by
// mobile-overflow.spec.ts's route sweep, not by these interaction flows.
//
// NOTE: Regenerate here exercises the FREE curated path (deterministic,
// zero AI calls, no quota risk) unless the E2E account happens to be
// premium, in which case a real AI generation is spent — the same
// tradeoff gym.spec.ts documents for its own account. Prefer a free-tier
// E2E account so this suite is free to re-run.

const WEEK_BADGE = /^(This Week|Next Week|Past)$/;

test.describe('Meal plan — default week (bug B-13, T-08.9)', () => {
  test('navigating away and back to the default week never reverts it', async ({ page }) => {
    await gotoAndSettle(page, '/meal-plan');

    const weekBadge = page.getByText(WEEK_BADGE).first();
    await expect(weekBadge).toBeVisible();
    const startLabel = await weekBadge.textContent();

    // Before this fix, `setWeekOffset` deleted `?week` from the URL when
    // navigating back to the default (0) — the NEXT render then recomputed
    // `defaultWeekOffset` from the current time instead of staying where
    // the arrows just put it (a Friday-afternoon test could jump forward
    // again instead of landing back on "this week").
    await page.getByRole('button', { name: 'Next week' }).click();
    await page.getByRole('button', { name: 'Previous week' }).click();

    await expect(page.getByText(WEEK_BADGE).first()).toHaveText(startLabel ?? '');
  });
});

test.describe('Meal plan — Regenerate confirm + Undo (UX-08 §3, T-08.3)', () => {
  test('Regenerate always asks first, and the resulting toast can Undo', async ({ page }) => {
    await gotoAndSettle(page, '/meal-plan');

    // An empty week generates directly (nothing to lose); Regenerate's own
    // confirm only applies once a plan exists.
    const emptyCta = page.getByTestId('plan-generate-empty');
    if (await emptyCta.isVisible().catch(() => false)) {
      await emptyCta.click();
      await expect(page.getByTestId('plan-week-options')).toBeEnabled({ timeout: 30_000 });
    }

    // FB7-11: Regenerate and Rebalance live behind one "Week options" button.
    await page.getByTestId('plan-week-options').click();
    await page.getByTestId('plan-week-options-regenerate').click();
    await expect(
      page.getByRole('heading', { name: /^Regenerate (this|next) week\?$/ }),
    ).toBeVisible();

    await page.getByTestId('regenerate-confirm-submit').click();
    // A premium account that never granted AI data consent is asked first
    // (App Store 5.1.2(i)); the local test API runs with AI_MOCK_ENABLED.
    const allowAi = page.getByRole('button', { name: 'Allow', exact: true });
    const askedForConsent = await allowAi
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (askedForConsent) {
      await allowAi.click();
    }
    await expect(page.getByText('New week planned.', { exact: false })).toBeVisible({
      timeout: 30_000,
    });

    // Undo is present only when this call replaced a real previous plan.
    const undo = page.getByRole('button', { name: 'Undo' });
    if (await undo.isVisible().catch(() => false)) {
      await undo.click();
      await expect(page.getByText('New week planned.', { exact: false })).not.toBeVisible();
    }
  });
});

test.describe('Meal plan — Replace + Undo (T-08.5, bug B-50 filter)', () => {
  test('replacing a meal offers Undo back to the original recipe', async ({ page }) => {
    await gotoAndSettle(page, '/meal-plan');

    const swapButton = page.locator('[data-testid^="plan-meal-swap-"]').first();
    if (!(await swapButton.isVisible().catch(() => false))) {
      test.skip(true, 'No meal plan this week to replace a slot in — generate one first.');
      return;
    }

    await swapButton.click();
    await expect(page.getByRole('heading', { name: 'Replace meal' })).toBeVisible();

    // T-08.10/B-50: the picker must never offer the slot's OWN recipe back
    // as a replacement option.
    const description = page.getByRole('dialog').locator('h2 + div').first();
    const originalName = (await description.textContent())?.trim();

    const firstOption = page.locator('[data-testid^="picker-recipe-"]').first();
    await expect(firstOption).toBeVisible();
    if (originalName) {
      await expect(
        page.locator('[data-testid^="picker-recipe-"]', { hasText: originalName }),
      ).toHaveCount(0);
    }

    await firstOption.click();
    await expect(page.getByText(/^Swapped to /)).toBeVisible({ timeout: 15_000 });

    const undo = page.getByRole('button', { name: 'Undo' });
    if (await undo.isVisible().catch(() => false)) {
      await undo.click();
    }
  });
});
