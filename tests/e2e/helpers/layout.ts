import type { Page } from '@playwright/test';

// ─── Shared layout assertions ─────────────────────────────────────────────────

/** Authenticated routes worth sweeping. Mirrors NAV_ITEMS in apps/web. */
export const APP_ROUTES = [
  '/dashboard',
  '/meal-plan',
  '/recipes',
  '/ingredients',
  '/shopping-list',
  '/tracker',
  '/progress',
  '/history',
  '/profile',
  '/preferences',
] as const;

/** Widths from the plan's device matrix. 320 is the narrowest realistic phone. */
export const MOBILE_WIDTHS = [320, 375, 390, 430] as const;

export interface Overflower {
  selector: string;
  right: number;
  limit: number;
}

/**
 * Finds elements extending past the right edge of the viewport.
 *
 * A plain `scrollWidth > clientWidth` check is not enough here: the app sets
 * `overflow-x: clip` on <body>, which suppresses the document scroll and hides
 * real overflow from that assertion. So walk the tree instead.
 *
 * Descendants of intentional horizontal scrollers (the day rail, the meal-plan
 * week grid) are skipped — content wider than its own scroll container is the
 * whole point of those.
 */
export async function findOverflowingElements(page: Page): Promise<Overflower[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;

    const insideScroller = (el: Element): boolean => {
      let node: Element | null = el.parentElement;
      while (node && node !== document.body) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
        node = node.parentElement;
      }
      return false;
    };

    const describe = (el: Element): string => {
      const cls =
        typeof el.className === 'string' && el.className
          ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
          : '';
      return `${el.tagName.toLowerCase()}${cls}`;
    };

    return [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        // 1px of tolerance absorbs sub-pixel rounding.
        if (rect.right <= limit + 1) return false;
        const style = getComputedStyle(el);
        if (style.position === 'fixed') return false;
        return !insideScroller(el);
      })
      .slice(0, 10)
      .map((el) => ({
        selector: describe(el),
        right: Math.round(el.getBoundingClientRect().right),
        limit,
      }));
  });
}

/** True when the document itself scrolls sideways — always a bug. */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollWidth > de.clientWidth + 1;
  });
}

export interface UndersizedTarget {
  label: string;
  width: number;
  height: number;
}

/**
 * Interactive elements smaller than the 44x44 minimum touch target.
 *
 * Inline links inside prose are excluded — a link in a sentence is legitimately
 * text-sized, and padding it to 44px would wreck the paragraph.
 */
export async function findUndersizedTargets(page: Page, minimum = 44): Promise<UndersizedTarget[]> {
  return page.evaluate((min) => {
    const selector = 'button, a[href], [role="button"], input[type="checkbox"], select';

    const isInlineProse = (el: Element): boolean =>
      el.closest('p') !== null || el.closest('li')?.querySelector('p') !== null;

    const label = (el: Element): string => {
      const text =
        el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40) ?? '';
      const cls =
        typeof el.className === 'string' && el.className
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '';
      return `${el.tagName.toLowerCase()}${cls} "${text}"`;
    };

    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        if (isInlineProse(el)) return false;
        return rect.width < min || rect.height < min;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          label: label(el),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
  }, minimum);
}

/**
 * Navigates and waits for real content, not just a document.
 *
 * Deliberately does NOT use `networkidle`: the meal planner holds an SSE
 * connection open for recipe-image progress, so the network never goes idle
 * and the wait would time out. Waiting for the loading skeletons to clear is
 * both faster and a truer signal that the page has rendered its data.
 */
export async function gotoAndSettle(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Primary' }).first().waitFor({ state: 'attached' });

  // Resolves immediately when the page never showed a skeleton.
  await page
    .locator('.animate-pulse')
    .first()
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => {
      /* Some pages keep a pulsing element (e.g. image placeholders) — proceed. */
    });

  // Lets late layout shifts (image loads, font swap) land before measuring.
  await page.waitForTimeout(400);
}
