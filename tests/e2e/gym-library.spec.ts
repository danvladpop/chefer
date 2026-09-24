import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Gym exercise library + stats (gym_plan.md §7 G5-C) ───────────────────────
// Smoke-tests the exercises list → detail → stats path. Runs against the
// seeded curated library, which ships "Barbell Bench Press" with cues, so
// "Focus on" is guaranteed to render without any gym setup or logged history.

test.describe('Gym exercise library', () => {
  test('search finds a curated exercise, detail shows cues, stats renders', async ({ page }) => {
    await gotoAndSettle(page, '/gym/exercises');
    await expect(page.getByRole('heading', { name: 'Exercises', level: 1 })).toBeVisible();

    await page.getByPlaceholder('Search exercises').fill('bench');
    const result = page.getByRole('link', { name: /Barbell Bench Press/i }).first();
    await expect(result).toBeVisible();

    await result.click();
    await expect(page).toHaveURL(/\/gym\/exercises\/barbell-bench-press$/);
    await expect(
      page.getByRole('heading', { name: 'Barbell Bench Press', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Focus on')).toBeVisible();

    await gotoAndSettle(page, '/gym/stats');
    await expect(page.getByRole('heading', { name: 'Stats', level: 1 })).toBeVisible();
  });

  test('"Mine" filter and equipment chips narrow the list', async ({ page }) => {
    await gotoAndSettle(page, '/gym/exercises');

    await page.getByRole('button', { name: 'Barbell' }).click();
    await expect(page.getByRole('link', { name: /Barbell Bench Press/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^Goblet Squat/i })).toHaveCount(0);

    await page.getByRole('button', { name: 'Barbell' }).click(); // toggle off
    await page.getByRole('button', { name: 'Mine' }).click();
    // A fresh test account has no custom exercises yet.
    await expect(page.getByText(/No exercises match/i)).toBeVisible();
  });

  test('create-custom-exercise link is reachable', async ({ page }) => {
    await gotoAndSettle(page, '/gym/exercises');
    await page
      .getByRole('link', { name: /create custom exercise|new/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/gym\/exercises\/new$/);
    await expect(page.getByRole('heading', { name: 'Create custom exercise' })).toBeVisible();
  });
});
