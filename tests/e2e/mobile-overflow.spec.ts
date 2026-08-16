import { expect, test } from '@playwright/test';
import {
  APP_ROUTES,
  findOverflowingElements,
  gotoAndSettle,
  hasHorizontalScroll,
  MOBILE_WIDTHS,
} from './helpers/layout';

// ─── Horizontal overflow ──────────────────────────────────────────────────────
// The single highest-value regression guard for mobile: nothing in the app may
// push the page sideways, at any supported width, on any route.

test.describe('mobile layout has no horizontal overflow', () => {
  for (const width of MOBILE_WIDTHS) {
    test.describe(`at ${width}px`, () => {
      for (const route of APP_ROUTES) {
        test(`${route}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 844 });
          await gotoAndSettle(page, route);

          expect(
            await hasHorizontalScroll(page),
            `${route} scrolls horizontally at ${width}px`,
          ).toBe(false);

          const overflowing = await findOverflowingElements(page);
          expect(
            overflowing,
            `${route} has elements past the right edge at ${width}px:\n` +
              overflowing
                .map((o) => `  ${o.selector} right=${o.right} limit=${o.limit}`)
                .join('\n'),
          ).toEqual([]);
        });
      }
    });
  }
});
