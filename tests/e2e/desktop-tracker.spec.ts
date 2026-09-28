import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Tracker: search-first Log sheet, edit/undo, one-save (UX-19) ──────────────
// T-19.1/T-19.2/T-19.4. A unique name per run keeps repeated CI runs from
// colliding with a previous run's leftover custom entries.

const ITEM_NAME = `Playwright snack ${Date.now()}`;

test.describe('Tracker — search-first Log sheet + edit/undo (T-19.1, T-19.2)', () => {
  test('logs from the manual fallback, then re-logs it from Recent in one tap (AC1)', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/tracker');

    // Open the Log sheet and use "Enter calories yourself" to seed Recent.
    await page.getByTestId('tracker-quick-add').click();
    await expect(page.getByRole('heading', { name: 'Log something' })).toBeVisible();
    await page.getByTestId('log-sheet-manual').click();
    await page.getByTestId('quick-add-name').fill(ITEM_NAME);
    await page.getByTestId('quick-add-kcal').fill('280');
    await page.getByTestId('quick-add-submit').click();
    await expect(page.getByRole('heading', { name: 'Log something' })).toBeHidden();
    await expect(page.getByText(ITEM_NAME).first()).toBeVisible();

    // AC1: reopening the sheet (tap 1) shows it under Recent; its "+" (tap 2)
    // logs it again with no search, no form.
    await page.getByTestId('tracker-quick-add').click();
    await expect(page.getByText('Recent', { exact: true })).toBeVisible();
    await page.getByTestId(`log-sheet-recent-add-custom:${ITEM_NAME.toLowerCase()}`).click();
    await expect(page.getByRole('heading', { name: 'Log something' })).toBeHidden();

    // Two rows now exist under "Also eaten".
    await expect(page.getByText(ITEM_NAME)).toHaveCount(2);
  });

  test('editing a custom entry, deleting and undoing restores it exactly (bug B-34, AC2)', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/tracker');
    await page.getByTestId('tracker-quick-add').click();
    await page.getByTestId('log-sheet-manual').click();
    await page.getByTestId('quick-add-name').fill(ITEM_NAME);
    await page.getByTestId('quick-add-kcal').fill('280');
    await page.getByTestId('quick-add-submit').click();
    await expect(page.getByRole('heading', { name: 'Log something' })).toBeHidden();

    // Tap the row to open Edit entry.
    await page.getByText(ITEM_NAME).first().click();
    await expect(page.getByRole('heading', { name: 'Edit entry' })).toBeVisible();
    const nameInput = page.getByTestId('edit-entry-name');
    await expect(nameInput).toHaveValue(ITEM_NAME);

    // Delete — immediate, with an Undo toast (no confirm dialog).
    await page.getByTestId('edit-entry-delete').click();
    await expect(page.getByText(`Deleted ${ITEM_NAME}`)).toBeVisible();
    await expect(page.getByText(ITEM_NAME)).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(ITEM_NAME).first()).toBeVisible();

    // Clean up: delete it again so the run doesn't leave data behind.
    await page.getByText(ITEM_NAME).first().click();
    await page.getByTestId('edit-entry-delete').click();
  });

  // Bug B-39, T-19.5: the macro sanity check, advisory only.
  test('bug B-39: mismatched macros show the sanity line; Log anyway still logs it', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/tracker');
    await page.getByTestId('tracker-quick-add').click();
    await page.getByTestId('log-sheet-manual').click();
    await page.getByTestId('quick-add-name').fill(`${ITEM_NAME} sanity`);
    await page.getByTestId('quick-add-kcal').fill('100');
    await page.getByTestId('quick-add-protein').fill('500');
    await expect(page.getByTestId('quick-add-sanity')).toContainText("don't add up");

    await page.getByTestId('quick-add-sanity-log-anyway').click();
    await page.getByTestId('quick-add-submit').click();
    await expect(page.getByRole('heading', { name: 'Log something' })).toBeHidden();
    await expect(page.getByText(`${ITEM_NAME} sanity`).first()).toBeVisible();

    // Clean up.
    await page.getByText(`${ITEM_NAME} sanity`).first().click();
    await page.getByTestId('edit-entry-delete').click();
  });
});

test.describe('Tracker — one-save model (bug B-23, T-19.4)', () => {
  test('there is no "Save Day" / "Log N meals" button on the page', async ({ page }) => {
    await gotoAndSettle(page, '/tracker');
    await expect(page.getByRole('button', { name: /Log \d+ meals?/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear logged meals' })).toHaveCount(0);
  });
});
