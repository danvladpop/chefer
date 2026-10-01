import { expect, test, type Page } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

/**
 * Every recipe line is picked from the ingredient catalog
 * (plan-ingredient-catalog §10): the row's ingredient control opens the
 * picker sheet, and a search result is linked to the line. Returns the
 * picked catalog row's display name.
 */
async function pickCatalogIngredient(page: Page, row: number, query: string): Promise<string> {
  await page.getByRole('button', { name: new RegExp(`^Ingredient ${row}:`) }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose an ingredient' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Search ingredients').fill(query);
  const first = dialog
    .getByRole('list', { name: 'Matching ingredients' })
    .getByRole('button')
    .first();
  await expect(first).toBeVisible();
  const displayName = (await first.locator('span span').first().innerText()).trim();
  await first.click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: `Ingredient ${row}: ${displayName}` }),
  ).toBeVisible();
  return displayName;
}

async function fillMinimumRecipe(page: Page, name: string, query: string): Promise<string> {
  await gotoAndSettle(page, '/recipes/new');
  await page.getByLabel(/^Recipe Name/).fill(name);
  const picked = await pickCatalogIngredient(page, 1, query);
  await page.getByLabel('Amount for ingredient 1').fill('200');
  return picked;
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
    await fillMinimumRecipe(page, name, 'flour');

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
    // There is no typed-nutrition path any more: the server computes it.
    await expect(page.getByRole('button', { name: /enter manually/i })).toHaveCount(0);
    await expect(page.getByTestId('nutrition-preview')).toBeVisible();
  });
});

test.describe('Recipe form — edit round trip (AC9, T-BUG-O3 C1)', () => {
  test('editing and saving with no changes leaves the recipe exactly as it was', async ({
    page,
  }) => {
    const name = `E2E edit-unchanged ${Date.now()}`;
    const ingredientName = await fillMinimumRecipe(page, name, 'salt');
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
    await expect(
      page.getByRole('button', { name: `Ingredient 1: ${ingredientName}` }),
    ).toBeVisible();
    await expect(page.getByLabel('Amount for ingredient 1')).toHaveValue('200');
  });

  test('editing and saving a changed name shows the new value on reopen', async ({ page }) => {
    const original = `E2E edit-original ${Date.now()}`;
    const updated = `E2E edit-updated ${Date.now()}`;
    await fillMinimumRecipe(page, original, 'pepper');
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
