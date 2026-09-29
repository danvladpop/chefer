import { expect, test, type Page } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Desktop regression ───────────────────────────────────────────────────────
// The mobile work must not disturb the desktop shell. The one deliberate
// change is the dashboard nutrition rail moving from lg to xl: at 1024px,
// sidebar (224) + rail (288) left under 512px for content, so between lg and
// xl the panel renders inline in the main column instead.
//
// B-31 interim (T-00.12, UX-04 AC4): the nutrition panel — and with it the
// rail — only renders once the account has a goal or tracks (logged on ≥ 3 of
// the last 7 days). Which branch runs depends on the E2E account, so each test
// states its precondition and skips the other branch.

/** Opens the dashboard and reports whether the nutrition panel is shown. */
async function openDashboard(page: Page, width: number): Promise<boolean> {
  await page.setViewportSize({ width, height: 900 });
  await gotoAndSettle(page, '/dashboard');
  // Quick log renders for every account once the summary has loaded.
  await page.getByTestId('today-quick-log').waitFor();
  return (await page.getByTestId('nutrition-summary').count()) > 0;
}

const NO_GOAL = 'E2E account has no goal and does not track — B-31 hides the nutrition panel';

test.describe('desktop shell is intact', () => {
  test('at 1440px: sidebar and nutrition rail, no bottom bar', async ({ page }) => {
    test.skip(!(await openDashboard(page, 1440)), NO_GOAL);

    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    expect(Math.round((await sidebar.boundingBox())!.width)).toBe(224);

    await expect(
      page.locator('nav[aria-label="Primary"]').filter({ hasText: 'More' }),
    ).toBeHidden();

    // Exactly one *visible* nutrition panel — the rail. Both copies always
    // exist in the DOM; only CSS decides which one shows, so filter on
    // visibility rather than counting matches.
    await expect(page.getByTestId('nutrition-summary').filter({ visible: true })).toHaveCount(1);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      ),
    ).toBe(false);
  });

  test('at 1100px: sidebar stays, rail gives way to the inline panel', async ({ page }) => {
    test.skip(!(await openDashboard(page, 1100)), NO_GOAL);

    await expect(page.locator('aside')).toBeVisible();

    // Still exactly one visible panel, just relocated into the main column.
    await expect(page.getByTestId('nutrition-summary').filter({ visible: true })).toHaveCount(1);

    const railHidden = await page.evaluate(() => {
      const rail = document.querySelector('.xl\\:flex.w-72');
      return rail ? getComputedStyle(rail).display === 'none' : true;
    });
    expect(railHidden).toBe(true);
  });

  test('macro label and value never collide in the rail', async ({ page }) => {
    test.skip(!(await openDashboard(page, 1440)), NO_GOAL);

    // Regression guard: the 288px rail once rendered "Protein135g / 140g".
    const gaps = await page.evaluate(() =>
      [...document.querySelectorAll('span')]
        .filter((s) => /^(Protein|Carbs|Fat)$/.test(s.textContent?.trim() ?? ''))
        .filter((s) => s.getBoundingClientRect().width > 0)
        .map((s) => {
          const label = s.getBoundingClientRect();
          const value = s.nextElementSibling!.getBoundingClientRect();
          return { macro: s.textContent!.trim(), gap: Math.round(value.left - label.right) };
        }),
    );

    expect(gaps.length).toBeGreaterThan(0);
    for (const { macro, gap } of gaps) {
      expect(gap, `${macro} label and value are touching`).toBeGreaterThanOrEqual(4);
    }
  });

  test('goal-less account at 1440px: no nutrition panel and no empty rail (B-31)', async ({
    page,
  }) => {
    test.skip(await openDashboard(page, 1440), 'E2E account has a goal or tracks');

    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByTestId('nutrition-summary')).toHaveCount(0);
    // The rail column is omitted entirely, not left as a blank 288px gutter.
    expect(await page.locator('.xl\\:flex.w-72').count()).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      ),
    ).toBe(false);
  });
});
