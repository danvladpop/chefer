import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Desktop regression ───────────────────────────────────────────────────────
// The mobile work must not disturb the desktop shell. The one deliberate
// change is the dashboard nutrition rail moving from lg to xl: at 1024px,
// sidebar (224) + rail (288) left under 512px for content, so between lg and
// xl the panel renders inline in the main column instead.

test.describe('desktop shell is intact', () => {
  test('at 1440px: sidebar and nutrition rail, no bottom bar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(page, '/dashboard');

    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    expect(Math.round((await sidebar.boundingBox())!.width)).toBe(224);

    await expect(
      page.locator('nav[aria-label="Primary"]').filter({ hasText: 'More' }),
    ).toBeHidden();

    // Exactly one nutrition panel — the rail. A second would mean the inline
    // copy failed to hide and the user sees the ring twice.
    await expect(page.getByText('Planned Today')).toHaveCount(1);
    await expect(page.getByText('Planned Today')).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      ),
    ).toBe(false);
  });

  test('at 1100px: sidebar stays, rail gives way to the inline panel', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await gotoAndSettle(page, '/dashboard');

    await expect(page.locator('aside')).toBeVisible();

    // Still exactly one visible panel, just relocated into the main column.
    await expect(page.getByText('Planned Today')).toHaveCount(1);
    await expect(page.getByText('Planned Today')).toBeVisible();

    const railHidden = await page.evaluate(() => {
      const rail = document.querySelector('.xl\\:flex.w-72');
      return rail ? getComputedStyle(rail).display === 'none' : true;
    });
    expect(railHidden).toBe(true);
  });

  test('macro label and value never collide in the rail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(page, '/dashboard');

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
});
