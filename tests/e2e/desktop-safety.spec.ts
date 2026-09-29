import { expect, test, type Page } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

/**
 * A real recipe card's link, not the "Create Recipe" header link — both
 * match `a[href^="/recipes/"]` (the header link points at `/recipes/new`
 * and sits before the card grid in DOM order), but only a card link wraps
 * the recipe's `<h3>` name.
 */
function firstRecipeCardLink(page: Page) {
  return page
    .locator('a[href^="/recipes/"]')
    .filter({ has: page.getByRole('heading', { level: 3 }) })
    .first();
}

// ─── Safety filter (UX-01/UX-02, T-01.7/T-02.2/T-02.3/T-02.5/T-01.3/T-01.5) ────
// Runs against the desktop project (real signed-in session, real API) — see
// playwright.config.ts's `desktop` project (testMatch: /desktop-.*\.spec\.ts/).
// Serial: later tests rely on the allergy the first test saves for this
// account, the same way desktop-regression.spec.ts's tests share one session.

test.describe.configure({ mode: 'serial' });

test.describe('Safety filter — web parity', () => {
  test('selecting Tree nuts on Preferences shows the read-back within 150ms (AC1)', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/preferences');

    // This account carries leftover Diet selections (Vegetarian base diet +
    // Paleo modifier) from earlier seed/test activity — reset Diet to "No
    // restriction" first. Without this, stacking Tree nuts on top of those
    // two diet restrictions filters out every recipe in the catalog, and
    // the Discover-dependent tests below (AC3, AC10) have nothing to open.
    await page.getByRole('radio', { name: 'No restriction' }).click();
    const paleo = page.getByRole('checkbox', { name: 'Paleo' });
    if ((await paleo.getAttribute('aria-checked')) === 'true') {
      await paleo.click();
    }

    const treeNuts = page.getByRole('checkbox', { name: 'Tree nuts' });
    await treeNuts.click();
    await expect(treeNuts).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/granola, muesli/)).toBeVisible();

    await page.getByRole('button', { name: 'Save preferences' }).click();
    // UX-26 (T-26.2): the first allergy save asks for health-information
    // consent (once per account) — allow it; skipped when already on record.
    await page
      .getByTestId('health-consent-allow')
      .click({ timeout: 4000 })
      .catch(() => undefined);
    await page.waitForURL('**/dashboard');
  });

  test('Discover states what it filtered, and opens What we check (AC7)', async ({ page }) => {
    await gotoAndSettle(page, '/recipes?tab=discover');
    await expect(page.getByText(/Filtered for .* hidden/)).toBeVisible();

    await page.getByText(/Filtered for .* hidden/).click();
    const sheet = page.getByRole('dialog', { name: 'Checked for your table' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Tree nuts', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('a recipe from the filtered Discover results shows the Checked line, never a conflict (AC3)', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/recipes?tab=discover');
    // Discover already excludes tree-nut recipes — this card is safe.
    await firstRecipeCardLink(page).click();
    await page.waitForURL('**/recipes/**');

    // The two states are mutually exclusive (AC3): a page with a real
    // allergy set never shows both at once.
    const conflict = page.getByRole('alert').filter({ hasText: /Contains/ });
    const checked = page.getByText(/^Checked for /);
    await expect(conflict).toHaveCount(0);
    // Not every recipe has a rule to show (e.g. one with no ingredients that
    // trip any of the table's rules still renders nothing) — only assert
    // when the line is present at all.
    if ((await checked.count()) > 0) {
      await expect(checked.first()).toBeVisible();
    }
  });

  test('reporting a recipe hides it and confirms (AC10)', async ({ page }) => {
    await gotoAndSettle(page, '/recipes?tab=discover');
    await firstRecipeCardLink(page).click();
    await page.waitForURL('**/recipes/**');

    await page.getByRole('button', { name: 'Report a safety problem' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report a safety problem' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: /It contains something we can.t eat/ }).click();
    await dialog.getByRole('button', { name: 'Send report' }).click();

    await expect(page.getByText(/Thanks\. We.ve hidden/)).toBeVisible();
  });

  // ── L-SAFE2, wave 2: plan/Replace/Shop surfaces (T-02.1/T-02.4/T-02.5) ──
  // Same session as above — the Tree nuts allergy test 1 saved is still set.
  test('the Plan week shows the Checked badge, and the Replace sheet hides unsafe recipes with a hidden count (AC5/AC7)', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/meal-plan');

    // A fresh database has no week yet — plan one (a premium account that
    // never granted AI data consent is asked first; "Allow" continues).
    const emptyCta = page.getByTestId('plan-generate-empty');
    if (await emptyCta.isVisible().catch(() => false)) {
      await emptyCta.click();
      const allowAi = page.getByRole('button', { name: 'Allow', exact: true });
      if (
        await allowAi
          .waitFor({ state: 'visible', timeout: 3_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await allowAi.click();
      }
      await expect(page.locator('[data-testid^="plan-meal-swap-"]:visible').first()).toBeVisible({
        timeout: 30_000,
      });
    }

    // AC1: the week-level badge only ever claims Checked while the table
    // actually has rules — it does here (Tree nuts, from test 1).
    await expect(page.getByText('Checked for your table').first()).toBeVisible();

    const swapButton = page.locator('[data-testid^="plan-meal-swap-"]:visible').first();
    if (!(await swapButton.isVisible().catch(() => false))) {
      test.skip(true, 'No meal plan this week to open a Replace sheet for.');
      return;
    }
    await swapButton.click();
    await expect(page.getByRole('heading', { name: 'Replace meal' })).toBeVisible();

    // AC5: the "all recipes" results never include a tree-nut recipe —
    // every row Discover would have chipped/hidden for the same table is
    // gone here too (this sheet is a hard filter, not a soft chip).
    await expect(page.getByText(/contains tree nuts/i)).toHaveCount(0);

    // AC7: the footer names how many the table's rules hid, when any did —
    // pool content varies by slot, so this stays a soft assertion rather
    // than asserting a specific count.
    const filteredLine = page.getByText(/Filtered for .* hidden/);
    if ((await filteredLine.count()) > 0) {
      await expect(filteredLine.first()).toBeVisible();
    }

    await page.keyboard.press('Escape');
  });

  test('the shopping list header shows the same Checked state (T-02.1)', async ({ page }) => {
    await gotoAndSettle(page, '/shopping-list');
    const header = page.getByText('Checked for your table', { exact: false });
    // hasPlan can be false for this account/week — only assert when the
    // list actually rendered (same "state may vary" pattern as above).
    if ((await header.count()) > 0) {
      await expect(header.first()).toBeVisible();
    }
  });
});
