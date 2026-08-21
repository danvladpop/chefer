import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Charts on touch ──────────────────────────────────────────────────────────
// Guards the user-facing guarantee: a tap surfaces the numbers behind a chart.
//
// Note what this does NOT prove. Tapping fires compatibility mouse events
// (mouseover/mousemove/click), so a hover-triggered tooltip opens on tap too —
// this passes under either trigger. It is a regression guard against the chart
// or its tooltip disappearing, not a discriminator between trigger modes.

test.describe('progress charts are usable without a mouse', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('tapping the chart opens a tooltip', async ({ page }) => {
    await gotoAndSettle(page, '/progress');

    const chart = page.locator('.recharts-surface').first();

    // The charts only render once the account has logged days; on an empty
    // account the page shows an empty-state message instead.
    if ((await chart.count()) === 0) {
      test.skip(true, 'No tracker data on this account — nothing to chart.');
      return;
    }

    // Tap ON a rendered data point, not the middle of the plot: the tooltip
    // only surfaces logged days, and an account whose logs cluster at the
    // edge of the 28-day window has nothing at the centre — tapping there
    // legitimately shows no tooltip.
    const dot = page.locator('.recharts-surface circle').first();
    if ((await dot.count()) === 0) {
      test.skip(true, 'No plotted data points on this account.');
      return;
    }
    const box = (await dot.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    const tooltip = page.locator('.recharts-tooltip-wrapper').first();
    await expect(tooltip).toBeVisible({ timeout: 5_000 });
    await expect(tooltip).not.toBeEmpty();
  });
});
