import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Tracker: search-first Log sheet, edit/undo, one-save (UX-19) ──────────────
// T-19.1/T-19.2/T-19.4. A unique name per run keeps repeated CI runs from
// colliding with a previous run's leftover custom entries.

const ITEM_NAME = `Playwright snack ${Date.now()}`;

/**
 * `getByText` does a substring match by default, and the delete flow's own
 * "Deleted {name}" toast contains the row's name as a substring — right
 * after asserting that toast is visible, a non-exact `getByText(ITEM_NAME)`
 * would count the toast itself as a match and never see the row count drop,
 * even once the row is truly gone. `exact` scopes every check here to an
 * element whose full text is the name alone (the row), never the toast.
 */
function byItemName(page: import('@playwright/test').Page, name: string) {
  return page.getByText(name, { exact: true });
}

// One account, one day (fullyParallel would otherwise run these workers
// concurrently against the same signed-in user's "today" tracker entries,
// racing the shared ITEM_NAME just like gym.spec.ts's "one account" note).
test.describe.configure({ mode: 'serial' });

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
    await expect(byItemName(page, ITEM_NAME).first()).toBeVisible();

    // AC1: reopening the sheet (tap 1) shows it under Recent; its "+" (tap 2)
    // logs it again with no search, no form.
    await page.getByTestId('tracker-quick-add').click();
    await expect(page.getByText('Recent', { exact: true })).toBeVisible();
    await page.getByTestId(`log-sheet-recent-add-custom:${ITEM_NAME.toLowerCase()}`).click();
    await expect(page.getByRole('heading', { name: 'Log something' })).toBeHidden();

    // Two rows now exist under "Also eaten".
    await expect(byItemName(page, ITEM_NAME)).toHaveCount(2);

    // Clean up both rows — every other test in this file shares ITEM_NAME and
    // assumes a clean slate (e.g. the B-34/AC2 test below counts on exactly
    // one entry named ITEM_NAME existing before it deletes it). Wait for the
    // Edit entry sheet itself before each delete click — clicking the row
    // text while the previous sheet's close transition is still tearing down
    // can hit a "edit-entry-delete" button that's about to detach. The row
    // itself now disappears optimistically (instantly), but deleteCustomMeal
    // addresses entries by array position — firing a second delete before the
    // first's request has actually reached the server can race the entryIndex
    // it computed, so wait for that response before clicking the next row.
    await byItemName(page, ITEM_NAME).first().click();
    await expect(page.getByRole('heading', { name: 'Edit entry' })).toBeVisible();
    const firstDelete = page.waitForResponse(
      (r) => r.url().includes('tracker.deleteCustomMeal') && r.status() === 200,
    );
    await page.getByTestId('edit-entry-delete').click();
    await expect(byItemName(page, ITEM_NAME)).toHaveCount(1);
    await firstDelete;
    await byItemName(page, ITEM_NAME).first().click();
    await expect(page.getByRole('heading', { name: 'Edit entry' })).toBeVisible();
    await page.getByTestId('edit-entry-delete').click();
    await expect(byItemName(page, ITEM_NAME)).toHaveCount(0);
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
    await byItemName(page, ITEM_NAME).first().click();
    await expect(page.getByRole('heading', { name: 'Edit entry' })).toBeVisible();
    const nameInput = page.getByTestId('edit-entry-name');
    await expect(nameInput).toHaveValue(ITEM_NAME);

    // Delete — immediate (spliced out of the cached day, not just marked for
    // the next refetch), with an Undo toast (no confirm dialog).
    await page.getByTestId('edit-entry-delete').click();
    await expect(page.getByText(`Deleted ${ITEM_NAME}`)).toBeVisible();
    await expect(byItemName(page, ITEM_NAME)).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(byItemName(page, ITEM_NAME).first()).toBeVisible();

    // Clean up: delete it again so the run doesn't leave data behind. Wait
    // for the Edit entry sheet itself before clicking delete — clicking the
    // row text right after Undo's own sheet-close transition can hit a
    // "edit-entry-delete" button that's about to detach.
    await byItemName(page, ITEM_NAME).first().click();
    await expect(page.getByRole('heading', { name: 'Edit entry' })).toBeVisible();
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
    await expect(byItemName(page, `${ITEM_NAME} sanity`).first()).toBeVisible();

    // Clean up.
    await byItemName(page, `${ITEM_NAME} sanity`).first().click();
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
