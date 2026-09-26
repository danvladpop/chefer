import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Mobile shell ─────────────────────────────────────────────────────────────
// Locks in the behaviour of the bottom tab bar and the More drawer, including
// the body scroll-lock round trip — the piece most likely to break silently.

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** The bottom bar is the fixed one; the sidebar's nav shares its label. */
function bottomNav(page: import('@playwright/test').Page) {
  return page.locator('nav[aria-label="Primary"]').filter({ hasText: 'More' });
}

test.describe('bottom tab bar', () => {
  test('is visible on mobile and hidden on desktop', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoAndSettle(page, '/dashboard');
    await expect(bottomNav(page)).toBeVisible();

    await page.setViewportSize(DESKTOP);
    await expect(bottomNav(page)).toBeHidden();
    await expect(page.locator('aside')).toBeVisible();
  });

  test('sits flush against the bottom of the viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoAndSettle(page, '/dashboard');

    const box = await bottomNav(page).boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.y + box!.height)).toBe(MOBILE.height);
  });

  test('reserves space so page content is never hidden behind it', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoAndSettle(page, '/dashboard');

    const navHeight = (await bottomNav(page).boundingBox())!.height;
    const padding = await page
      .locator('main')
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));

    // Padding covers the bar itself; the safe-area inset adds more on real iOS.
    expect(padding).toBeGreaterThanOrEqual(navHeight - 1);
  });

  test('marks the current route and meets the touch minimum', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoAndSettle(page, '/recipes');

    const items = bottomNav(page).locator('a, button');
    await expect(items).toHaveCount(5);

    for (const item of await items.all()) {
      const box = (await item.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }

    await expect(bottomNav(page).locator('[aria-current="page"]')).toHaveAttribute(
      'href',
      '/recipes',
    );
  });
});

test.describe('food IA (P2-2 / P2-8)', () => {
  test.use({ viewport: MOBILE });

  test('tab bar reads Today · Plan · Shop · Cookbook · More', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');
    await expect(bottomNav(page).locator('a, button')).toHaveText([
      'Today',
      'Plan',
      'Shop',
      'Cookbook',
      'More',
    ]);
    await expect(bottomNav(page).locator('[aria-current="page"]')).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  test('the full tracker lights Today and is one tap from it', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');
    await page.getByTestId('today-full-day').click();
    await expect(page).toHaveURL(/\/tracker$/);
    await expect(bottomNav(page).locator('[aria-current="page"]')).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  test('old routes land on their new homes', async ({ page }) => {
    await gotoAndSettle(page, '/history');
    await expect(page).toHaveURL(/\/my-weeks$/);
    await expect(page.getByRole('heading', { name: 'My weeks', level: 1 })).toBeVisible();

    await gotoAndSettle(page, '/pantry');
    await expect(page).toHaveURL(/\/shopping-list\?view=kitchen$/);
    await expect(page.getByTestId('shop-segment-kitchen')).toHaveAttribute('aria-current', 'page');
    await expect(bottomNav(page).locator('[aria-current="page"]')).toHaveAttribute(
      'href',
      '/shopping-list',
    );
  });
});

test.describe('more drawer', () => {
  test.use({ viewport: MOBILE });

  test('opens, traps focus, and closes on Escape', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');
    await bottomNav(page).getByRole('button', { name: 'More' }).click();

    const drawer = page.getByRole('dialog', { name: 'More navigation' });
    await expect(drawer).toBeVisible();
    // 8 destinations − 4 tab-bar slots = 4 drawer links (P2-8: Tracker is
    // Today, Pantry is in Shop, History is My weeks, Ingredients left the nav).
    await expect(drawer.getByRole('link')).toHaveCount(4);

    // Focus must have moved inside the panel.
    expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('locks the page behind it and restores scroll on close', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');

    // Read back the real offset rather than assuming the requested one: a short
    // page clamps the scroll, and the lock must capture wherever we landed.
    await page.evaluate(() => window.scrollTo(0, 400));
    const scrolled = await page.evaluate(() => Math.round(window.scrollY));
    expect(scrolled, 'dashboard must be scrollable for this test to mean anything').toBeGreaterThan(
      0,
    );

    await bottomNav(page).getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('dialog', { name: 'More navigation' })).toBeVisible();

    // While locked the body is pinned with a negative offset, not scrolled.
    expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
    expect(await page.evaluate(() => document.body.style.top)).toBe(`-${scrolled}px`);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'More navigation' })).toBeHidden();

    expect(await page.evaluate(() => document.body.style.position)).toBe('');
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(scrolled);
  });

  test('closes after navigating from it', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');
    await bottomNav(page).getByRole('button', { name: 'More' }).click();

    const drawer = page.getByRole('dialog', { name: 'More navigation' });
    await drawer.getByRole('link', { name: 'Profile' }).click();

    await expect(page).toHaveURL(/\/profile$/);
    await expect(drawer).toBeHidden();
    // A drawer left mounted would keep the page scroll-locked.
    expect(await page.evaluate(() => document.body.style.position)).toBe('');
  });
});
