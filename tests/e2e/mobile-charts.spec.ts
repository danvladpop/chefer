import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Charts on touch ──────────────────────────────────────────────────────────
// Recharts tooltips default to a hover trigger. Touch screens have no hover, so
// every number behind the progress charts used to be unreachable on a phone.
// The page switches to a click trigger on coarse pointers; this guards that.

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

    const box = (await chart.boundingBox())!;

    // Tap in the middle of the plot area, where a data point should sit.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    const tooltip = page.locator('.recharts-tooltip-wrapper').first();
    await expect(tooltip).toBeVisible({ timeout: 5_000 });
    await expect(tooltip).not.toBeEmpty();
  });
});
