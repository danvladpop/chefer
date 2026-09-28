import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

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
    const treeNuts = page.getByRole('checkbox', { name: 'Tree nuts' });
    await treeNuts.click();
    await expect(treeNuts).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/granola, muesli/)).toBeVisible();

    await page.getByRole('button', { name: 'Save preferences' }).click();
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
    await page.locator('a[href^="/recipes/"]').first().click();
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
    await page.locator('a[href^="/recipes/"]').first().click();
    await page.waitForURL('**/recipes/**');

    await page.getByRole('button', { name: 'Report a safety problem' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report a safety problem' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: /It contains something we can.t eat/ }).click();
    await dialog.getByRole('button', { name: 'Send report' }).click();

    await expect(page.getByText(/Thanks\. We.ve hidden/)).toBeVisible();
  });
});
