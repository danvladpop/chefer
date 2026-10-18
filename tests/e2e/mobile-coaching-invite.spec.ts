import { expect, test } from '@playwright/test';
import {
  findOverflowingElements,
  findUndersizedTargets,
  hasHorizontalScroll,
  MOBILE_WIDTHS,
} from './helpers/layout';

// ─── A coaching invite opened signed out on a phone ───────────────────────────
// The middleware shows "Open in the Chefer app" + the stores before any sign-in
// (the address stays the invite link); "Continue on the web" is the login + next
// flow. Signed out on purpose: this project's default storage state is signed in.

const INVITE = '/coaching/join/ZZZZZZZZZZ';

test.use({ storageState: { cookies: [], origins: [] } });

test('offers the app first, then the stores, then the web', async ({ page }) => {
  await page.goto(INVITE);
  await expect(page).toHaveURL(INVITE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join your trainer on Chefer');
  await expect(page.getByRole('link', { name: 'Open in the Chefer app' })).toHaveAttribute(
    'href',
    'chefer://coaching/join/ZZZZZZZZZZ',
  );
  await expect(page.getByRole('link', { name: 'Get it on Google Play' })).toBeVisible();

  await page.getByRole('link', { name: 'Continue on the web' }).click();
  await expect(page).toHaveURL('/login?next=%2Fcoaching%2Fjoin%2FZZZZZZZZZZ');
});

for (const width of MOBILE_WIDTHS) {
  test(`fits and keeps 44px targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(INVITE);
    await expect(page.getByTestId('coaching-invite-signed-out')).toBeVisible();

    expect(await hasHorizontalScroll(page)).toBe(false);
    expect(await findOverflowingElements(page)).toEqual([]);
    expect(await findUndersizedTargets(page)).toEqual([]);
  });
}
