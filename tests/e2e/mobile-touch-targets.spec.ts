import { expect, test } from '@playwright/test';
import { APP_ROUTES, findUndersizedTargets, gotoAndSettle } from './helpers/layout';

// ─── Touch targets ────────────────────────────────────────────────────────────
// 44x44 CSS px is the practical floor (Apple HIG; Material asks for 48dp).
// Controls may stay visually small as long as their hit area is padded out.

test.describe('interactive elements meet the 44px touch minimum', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const route of APP_ROUTES) {
    test(`${route}`, async ({ page }) => {
      await gotoAndSettle(page, route);

      const undersized = await findUndersizedTargets(page);

      expect(
        undersized,
        `${route} has targets below 44x44:\n` +
          undersized.map((t) => `  ${t.label} — ${t.width}x${t.height}`).join('\n'),
      ).toEqual([]);
    });
  }
});
