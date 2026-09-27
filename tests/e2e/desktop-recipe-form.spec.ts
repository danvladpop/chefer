import { expect, test, type Page } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── UX-40 slice 1 web parity (T-40.6) ─────────────────────────────────────────
// D-19: a recipe saves with just a name and one ingredient line — cuisine,
// description, steps, times and nutrition are all optional. D-18: no fiber
// field anywhere. Matches apps/mobile/tests/unit/recipe-form.test.tsx's
// coverage of the same acceptance criteria on the other platform.
//
// Runs against the desktop project (real signed-in session, real API) — see
// playwright.config.ts's `desktop` project (testMatch: /desktop-.*\.spec\.ts/).

/**
 * The ingredient name field is a search-and-pick combobox
 * (IngredientPicker): typing free text alone never commits it to the form —
 * only picking a search result or creating a custom ingredient does. A
 * freshly seeded database has no catalog rows to search, so "create a
 * custom ingredient" is the only reliable way to commit a brand-new
 * ingredient name through the real UI.
 */
async function addCustomIngredient(page: Page, row: number, name: string, kcal: number) {
  const nameField = page.getByLabel(`Name for ingredient ${row}`);
  await nameField.fill(name);
  // The button reads `Create "{name}" as a custom ingredient` with curly
  // quotes (&ldquo;/&rdquo;) — match on the surrounding words instead.
  await page
    .getByRole('button', { name: new RegExp(`Create.*${escapeRegExp(name)}.*custom ingredient`) })
    .click();

  const dialog = page.getByRole('dialog', { name: 'Custom ingredient' });
  await expect(dialog).toBeVisible();
  // Nutrition per 100 g: kcal is the first of the five number inputs.
  await dialog.getByRole('spinbutton').first().fill(String(kcal));
  await dialog.getByRole('button', { name: 'Create ingredient' }).click();
  await expect(dialog).toBeHidden();

  // The row now shows the created ingredient as its name.
  await expect(nameField).toHaveValue(name);
}

async function fillMinimumRecipe(page: Page, name: string, ingredientName: string) {
  await gotoAndSettle(page, '/recipes/new');
  await page.getByLabel(/^Recipe Name/).fill(name);
  await addCustomIngredient(page, 1, ingredientName, 50);
  await page.getByLabel('Quantity for ingredient 1').fill('200');
}

function recipeCard(page: Page, name: string) {
  // `.last()`: every ANCESTOR div of the h3 also "contains" it and matches
  // the filter, in DOM (pre-order) order from outermost to innermost — the
  // card's own wrapper div (`group relative overflow-hidden …`) is the
  // innermost match, i.e. the last one in that list.
  return page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name, level: 3, exact: true }) })
    .last();
}

test.describe('Recipe form — D-19 minimum (UX-40 slice 1)', () => {
  test('a name and one ingredient line saves; cuisine/description/steps/nutrition stay optional', async ({
    page,
  }) => {
    const name = `E2E minimum recipe ${Date.now()}`;
    await fillMinimumRecipe(page, name, `E2E flour ${Date.now()}`);

    await page.getByRole('button', { name: 'Save Recipe' }).click();
    await page.waitForURL('**/recipes?tab=my**');
    await expect(recipeCard(page, name)).toBeVisible();
  });

  test('an empty submit reports only the name as missing, never cuisine or steps', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/recipes/new');
    await page.getByRole('button', { name: 'Save Recipe' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /recipe not saved/i })).toBeVisible();
    const name = page.getByLabel(/^Recipe Name/);
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    // Neither is required any more (D-19) — no error text for either.
    await expect(page.getByText(/pick a cuisine/i)).toHaveCount(0);
    await expect(page.getByText(/instruction step/i)).toHaveCount(0);
  });

  test('shows the "* Required" legend and no fiber field anywhere on the form', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/recipes/new');
    await expect(page.getByText('* Required')).toBeVisible();
    await expect(page.getByText('Ingredients *')).toBeVisible();

    const form = page.locator('form');
    await expect(form.getByText(/fiber/i)).toHaveCount(0);

    // Manual nutrition entry also has no fiber input.
    await page.getByRole('button', { name: /enter manually instead/i }).click();
    await expect(form.getByLabel(/fiber/i)).toHaveCount(0);
  });
});

test.describe('Recipe form — edit round trip (AC9, T-BUG-O3 C1)', () => {
  test('editing and saving with no changes leaves the recipe exactly as it was', async ({
    page,
  }) => {
    const name = `E2E edit-unchanged ${Date.now()}`;
    await fillMinimumRecipe(page, name, `E2E salt ${Date.now()}`);
    await page.getByRole('button', { name: 'Save Recipe' }).click();
    await page.waitForURL('**/recipes?tab=my**');

    await recipeCard(page, name).getByRole('link', { name: 'Edit recipe' }).click();
    await page.waitForURL('**/edit');
    await expect(page.getByLabel(/^Recipe Name/)).toHaveValue(name);

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForURL('**/recipes?tab=my**');

    // Reopen and confirm nothing was lost.
    await recipeCard(page, name).getByRole('link', { name: 'Edit recipe' }).click();
    await page.waitForURL('**/edit');
    await expect(page.getByLabel(/^Recipe Name/)).toHaveValue(name);
    await expect(page.getByLabel('Name for ingredient 1')).toHaveValue(/E2E salt/);
    await expect(page.getByLabel('Quantity for ingredient 1')).toHaveValue('200');
  });

  test('editing and saving a changed name shows the new value on reopen', async ({ page }) => {
    const original = `E2E edit-original ${Date.now()}`;
    const updated = `E2E edit-updated ${Date.now()}`;
    await fillMinimumRecipe(page, original, `E2E pepper ${Date.now()}`);
    await page.getByRole('button', { name: 'Save Recipe' }).click();
    await page.waitForURL('**/recipes?tab=my**');

    await recipeCard(page, original).getByRole('link', { name: 'Edit recipe' }).click();
    await page.waitForURL('**/edit');
    await page.getByLabel(/^Recipe Name/).fill(updated);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForURL('**/recipes?tab=my**');

    await expect(recipeCard(page, updated)).toBeVisible();
    await recipeCard(page, updated).getByRole('link', { name: 'Edit recipe' }).click();
    await page.waitForURL('**/edit');
    await expect(page.getByLabel(/^Recipe Name/)).toHaveValue(updated);
  });
});
