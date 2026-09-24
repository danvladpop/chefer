import { expect, test, type Page } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Gym core loop (gym_plan.md G5 acceptance) ────────────────────────────────
// setup (only if the account has no gym profile) → start the next workout →
// tick sets (surviving a reload) → finish → summary → back to Today. Runs at
// phone width (the primary target) and on desktop (navigator + active card).
//
// NOTE: this logs a real workout on the E2E account every run, which advances
// its routine rotation. Use a throwaway account (gym_plan.md §9.2).

const SETUP_OR_TODAY = /\/gym(\/setup)?$/;

// One account: the two loops must not race each other through setup.
test.describe.configure({ mode: 'serial' });

/** Walks the setup wizard with its defaults if /gym redirected there. */
async function ensureSetUp(page: Page): Promise<void> {
  await page.waitForURL(SETUP_OR_TODAY);
  const setup = page.getByTestId('gym-setup');
  const today = page.getByTestId('gym-next-up').or(page.getByTestId('gym-freestyle'));
  await expect(setup.or(today).first()).toBeVisible({ timeout: 15_000 });
  if (!(await setup.isVisible())) return;

  // Days, experience, equipment + units, weekdays (skipped).
  for (let step = 0; step < 4; step++) {
    await page.getByTestId('setup-next').click();
  }
  await expect(page.getByTestId('setup-program')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('setup-start-calibrate').click();
  await page.getByTestId('setup-finish').click();
  await expect(page.getByTestId('setup-done')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('setup-go-today').click();
  await page.waitForURL(/\/gym$/);
}

/** The ✓ of the first working set that is not ticked yet. */
function nextOpenCheck(page: Page) {
  return page
    .locator('[data-testid="gym-set-row"][data-done="false"]')
    .filter({ visible: true })
    .first()
    .getByTestId('gym-set-check');
}

function doneRows(page: Page) {
  return page.locator('[data-testid="gym-set-row"][data-done="true"]').filter({ visible: true });
}

for (const layout of [
  { name: 'phone', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
] as const) {
  test.describe(`gym loop (${layout.name})`, () => {
    test.use({ viewport: layout.viewport });

    test('setup → workout → finish → summary', async ({ page }) => {
      test.setTimeout(90_000);
      await gotoAndSettle(page, '/gym');
      await ensureSetUp(page);

      // Today: start the next workout.
      const start = page.getByTestId('gym-start-workout');
      await expect(start).toBeVisible({ timeout: 15_000 });
      await start.click();
      await page.waitForURL(/\/gym\/workout$/);
      await expect(page.getByTestId('gym-exercise-card').first()).toBeVisible();
      if (layout.name === 'desktop') {
        await expect(page.getByTestId('gym-exercise-navigator')).toBeVisible();
      }

      // One click logs the prefilled set and starts the rest timer.
      await nextOpenCheck(page).click();
      await expect(doneRows(page)).toHaveCount(1);
      await expect(page.getByTestId('gym-rest-timer')).toBeVisible();

      // Crash-safety: a reload resumes the same session with the tick intact.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(doneRows(page)).toHaveCount(1, { timeout: 15_000 });

      await nextOpenCheck(page).click();
      await expect(doneRows(page)).toHaveCount(2);

      // Finish with sets left → confirmation → summary.
      await page.getByTestId('gym-finish').click();
      await page.getByTestId('gym-finish-anyway').click();
      await page.waitForURL(/\/gym\/summary\/[0-9a-f-]{36}$/);
      await expect(page.getByTestId('gym-summary-stats')).toContainText('2');
      await expect(page.getByTestId('gym-next-time')).toBeVisible();
      await expect(page.getByTestId('gym-next-time-row').first()).toBeVisible({ timeout: 15_000 });

      // The workout reaches the server (the outbox drains).
      await expect(page.getByTestId('gym-sync-indicator')).toContainText('synced', {
        timeout: 20_000,
      });

      await page.getByTestId('gym-summary-done').click();
      await page.waitForURL(/\/gym$/);
      await expect(page.getByTestId('gym-resume-banner')).toHaveCount(0);
    });
  });
}

test.describe('mode switch', () => {
  test('phone: Food ↔ Gym swaps the tab bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAndSettle(page, '/dashboard');
    const bottomNav = page.locator('nav[aria-label="Primary"]').filter({ hasText: 'More' });
    await expect(bottomNav.getByRole('link', { name: 'Plan' })).toBeVisible();

    await page.getByTestId('mode-switch-gym').filter({ visible: true }).first().click();
    await page.waitForURL(SETUP_OR_TODAY);
    await expect(bottomNav.getByRole('link', { name: 'Today' })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: 'Stats' })).toBeVisible();

    // The cookie keeps Gym on neutral pages after a full reload (SSR, no flash).
    await gotoAndSettle(page, '/profile');
    await expect(bottomNav.getByRole('link', { name: 'Today' })).toBeVisible();

    await page.getByTestId('mode-switch-food').filter({ visible: true }).first().click();
    await page.waitForURL(/\/dashboard$/);
    await expect(bottomNav.getByRole('link', { name: 'Plan' })).toBeVisible();
  });

  test('desktop: the sidebar carries the switch', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(page, '/gym/settings');
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('link', { name: 'Today' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Gym settings' })).toBeVisible();
    await expect(sidebar.getByTestId('mode-switch-gym')).toHaveAttribute('aria-pressed', 'true');
  });

  test("dashboard: Today's workout card opens Gym", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAndSettle(page, '/dashboard');
    await page.getByTestId('todays-workout-card').click();
    await page.waitForURL(SETUP_OR_TODAY);
  });
});
