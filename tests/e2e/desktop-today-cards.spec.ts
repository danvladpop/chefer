import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Today: Tonight/Tomorrow/Shop-due card stack + ring label (T-04.7) ─────────
// Web parity of mobile's Food Today card stack. Which hero card renders
// (Tonight / its done row / Nothing tonight / Tomorrow / the older "next
// up" card) depends on the moment band (time of day) and the signed-in
// account's actual meal plan for today — neither of which this suite
// controls — so these checks are structural/conditional rather than
// asserting one specific card is always present. Exactly one of the
// mutually-exclusive hero states must show, though, and whichever one does
// is exercised for real.

const HERO_TESTIDS = [
  'tonight-card',
  'tonight-card-done',
  'nothing-tonight-card',
  'tomorrow-card',
] as const;

test.describe('Today — page shell (T-04.7)', () => {
  test('renders one <h1>, the quick-log row and the full-day link', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');

    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByTestId('today-quick-log')).toBeVisible();
    await expect(page.getByTestId('today-full-day')).toBeVisible();
    await expect(page.getByTestId('today-full-day')).toHaveAttribute('href', '/tracker');
  });

  // §2.11, T-35.5: "Your target" (OWN) vs "Suggested" (SUGGESTED) — the label
  // itself is conditional (nutrition-summary.test.tsx covers both values in
  // isolation), so here only the format is checked when it happens to show.
  test('the nutrition ring label, when shown, reads "Your target" or "Suggested"', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/dashboard');
    const label = page.getByTestId('target-mode-label').first();
    if (await label.isVisible().catch(() => false)) {
      await expect(label).toHaveText(/^(Your target|Suggested)$/);
    }
  });
});

test.describe('Today — hero card stack (Tonight/Tomorrow/Shop-due, T-04.7)', () => {
  test('shows at most one of the mutually-exclusive hero states', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');

    // 0 is valid too (daytime band with no dinner/tomorrow state, or an
    // account with no plan at all) — the "next up"/empty-state fallback
    // chain covers that case and is out of this lane's scope. Each test
    // below checks its own testid's visibility and skips itself otherwise.
    let visibleCount = 0;
    for (const id of HERO_TESTIDS) {
      if (
        await page
          .getByTestId(id)
          .isVisible()
          .catch(() => false)
      )
        visibleCount++;
    }
    expect(visibleCount).toBeLessThanOrEqual(1);
  });

  test('Tonight card: safety chip, Cook it, and logging it collapses to the done row', async ({
    page,
  }) => {
    await gotoAndSettle(page, '/dashboard');
    const card = page.getByTestId('tonight-card');
    test.skip(!(await card.isVisible().catch(() => false)), 'Tonight card not showing right now');

    await expect(page.getByTestId('tonight-cook-it')).toHaveAttribute(
      'href',
      /\/recipes\/.+\/cook/,
    );

    const ateThis = page.getByTestId('tonight-ate-this');
    if (await ateThis.isVisible().catch(() => false)) {
      const logged = page.waitForResponse(
        (r) => r.url().includes('tracker.logRecipe') && r.status() === 200,
      );
      await ateThis.click();
      await logged;
      await expect(page.getByTestId('tonight-card-done')).toBeVisible();
    }
  });

  // T-04.7 delta: Swap opens the existing ReplaceMealSheet inline (L-SAFE2's)
  // instead of navigating to the full Plan.
  test('Tonight card: Swap opens the inline recipe picker, not a navigation', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');
    const swap = page.getByTestId('tonight-swap');
    test.skip(!(await swap.isVisible().catch(() => false)), 'Tonight card not showing right now');

    await expect(swap).toHaveAttribute('type', 'button');
    await swap.click();

    await expect(page.getByRole('dialog', { name: 'Replace meal' })).toBeVisible();
    await expect(page.getByTestId('picker-search')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Nothing-tonight card links to Recipes', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');
    const card = page.getByTestId('nothing-tonight-card');
    test.skip(
      !(await card.isVisible().catch(() => false)),
      '"Nothing tonight" not showing right now',
    );

    await expect(page.getByTestId('nothing-tonight-find-recipe')).toHaveAttribute(
      'href',
      '/recipes',
    );
  });

  test('Tomorrow card is a read-only preview linking to the recipe', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');
    const card = page.getByTestId('tomorrow-card');
    test.skip(!(await card.isVisible().catch(() => false)), 'Tomorrow card not showing right now');

    await expect(page.getByTestId('tomorrow-view-recipe')).toHaveAttribute('href', /\/recipes\/.+/);
  });

  test('Shop-due card, when shown, links to the shopping list', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard');
    const card = page.getByTestId('shop-due-card');
    test.skip(!(await card.isVisible().catch(() => false)), 'Shop-due card not showing right now');

    // The card itself is the <Link> (T-04.2/T-04.7), not a wrapper around one.
    await expect(card).toHaveAttribute('href', '/shopping-list');
  });
});
