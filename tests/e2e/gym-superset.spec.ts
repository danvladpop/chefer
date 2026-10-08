import { expect, test, type Page } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Easy supersets (plan-library-supersets S3) ───────────────────────────────
// Routine editor: "Superset" on the next-up day → tick 3 exercises → "Group as
// superset" → heading + A1–A3 → Save. Workout: ticking A1 set 1 moves focus to
// A2 with no rest timer; "Ungroup" on the heading breaks it up for this
// session. Clean-up discards the workout and ungroups the routine again.
// Runs at phone width and on desktop (DnD board + navigator).
//
// Shares the E2E account with gym.spec.ts, whose loop finishes workouts and so
// moves "Next up" on: run the gym project with --workers=1 locally (CI does).

const SETUP_OR_TODAY = /\/gym(\/setup)?$/;

test.describe.configure({ mode: 'serial' });

/** Walks the setup wizard with its defaults if /gym redirected there. */
async function ensureSetUp(page: Page): Promise<void> {
  await page.waitForURL(SETUP_OR_TODAY);
  const setup = page.getByTestId('gym-setup');
  const today = page.getByTestId('gym-next-up').or(page.getByTestId('gym-freestyle'));
  await expect(setup.or(today).first()).toBeVisible({ timeout: 15_000 });
  if (!(await setup.isVisible())) return;
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

/** Discards a workout left running by an earlier (failed) run. */
async function discardRunningWorkout(page: Page): Promise<void> {
  await gotoAndSettle(page, '/gym/workout');
  const discard = page.getByRole('button', { name: 'Discard workout' });
  if (await discard.isVisible().catch(() => false)) {
    await discard.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
    await page.waitForURL(/\/gym$/);
  }
}

/** Opens the active routine in the editor. */
async function openActiveRoutineEditor(page: Page): Promise<void> {
  await gotoAndSettle(page, '/gym/routine/all');
  const active = page.locator('[data-testid^="routine-card-"]').filter({ hasText: 'Active' });
  await active.first().getByRole('link', { name: 'Edit' }).click();
  await page.waitForURL(/\/gym\/routine\/edit\?id=/);
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible({
    timeout: 15_000,
  });
}

function visible(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

/** The workout card whose superset chip reads `chip` (e.g. "A2"). */
function cardWithChip(page: Page, chip: string) {
  return page
    .getByTestId('gym-exercise-card')
    .filter({ visible: true })
    .filter({ has: page.getByTestId('gym-superset-chip').filter({ hasText: chip }) });
}

for (const layout of [
  { name: 'phone', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
] as const) {
  test.describe(`supersets (${layout.name})`, () => {
    test.use({ viewport: layout.viewport });

    test('group 3 in the editor → workout advances A1 → A2 with no rest → Ungroup', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await gotoAndSettle(page, '/gym');
      await ensureSetUp(page);
      await discardRunningWorkout(page);

      // The day Today will start.
      await gotoAndSettle(page, '/gym');
      const nextUp = page.getByTestId('gym-next-up');
      await expect(nextUp).toBeVisible({ timeout: 15_000 });
      const dayName = (await nextUp.locator('h2').textContent())?.trim() ?? '';
      expect(dayName).not.toBe('');

      // ── Routine editor: group the day's first 3 exercises ──
      await openActiveRoutineEditor(page);
      const supersetButton = page.getByRole('button', {
        name: `Superset: ${dayName}`,
        exact: true,
      });
      const day = page
        .getByTestId('routine-editor-day')
        .filter({ visible: true })
        .filter({ has: supersetButton });
      const save = page.getByRole('button', { name: 'Save changes' });
      // A run that failed half-way may have left a superset on this day.
      const leftovers = day.getByRole('button', { name: /^Ungroup superset/ });
      if ((await leftovers.count()) > 0) {
        while ((await leftovers.count()) > 0) await leftovers.first().click();
        await save.click();
        await expect(save).toBeDisabled({ timeout: 15_000 });
      }
      await day.getByRole('button', { name: `Superset: ${dayName}`, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Superset' });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(
        'Pick 2 to 4 exercises to do back to back. You rest after the round.',
      );
      const group = sheet.getByRole('button', { name: 'Group as superset' });
      const boxes = sheet.getByRole('checkbox');
      expect(await boxes.count()).toBeGreaterThanOrEqual(3);
      await boxes.nth(0).check();
      await expect(group).toBeDisabled();
      await boxes.nth(1).check();
      await boxes.nth(2).check();
      if (layout.name === 'phone') {
        await page.screenshot({ path: 'test-results/superset-sheet-phone.png' });
      }
      await group.click();
      await expect(page.getByTestId('superset-sheet')).toHaveCount(0); // exit animation done
      await expect(day.getByTestId('routine-superset-A')).toBeVisible();
      await expect(day.getByTestId('routine-superset-chip')).toHaveText(['A1', 'A2', 'A3']);
      await day.getByTestId('routine-superset-A').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/superset-editor-${layout.name}.png` });

      await save.click();
      await expect(save).toBeDisabled({ timeout: 15_000 });

      // ── Today shows it; start the workout ──
      await gotoAndSettle(page, '/gym');
      await expect(page.getByTestId('gym-next-up-superset-chip')).toHaveCount(3, {
        timeout: 15_000,
      });
      await page.getByTestId('gym-start-workout').click();
      await page.waitForURL(/\/gym\/workout$/);
      await expect(visible(page, 'gym-superset-heading')).toBeVisible();

      // Tick A1 set 1 → no rest, focus moves to A2's set 1.
      const a1 = cardWithChip(page, 'A1');
      await expect(a1.locator('[data-testid="gym-set-row"][data-focused="true"]')).toBeVisible();
      await a1
        .locator('[data-testid="gym-set-row"][data-focused="true"]')
        .getByTestId('gym-set-check')
        .click();
      const a2Focus = cardWithChip(page, 'A2').locator(
        '[data-testid="gym-set-row"][data-focused="true"]',
      );
      await expect(a2Focus).toBeVisible();
      await expect(a2Focus).toBeInViewport(); // phones scroll to it
      await expect(page.getByTestId('gym-rest-timer')).toHaveCount(0);
      await page.screenshot({ path: `test-results/superset-workout-${layout.name}.png` });

      // The workout's own "Superset" sheet offers "Also change my routine"
      // for routine slots of this day.
      await visible(page, 'gym-superset-open').click();
      const workoutSheet = page.getByRole('dialog', { name: 'Superset' });
      await workoutSheet.getByRole('checkbox').nth(0).check();
      await workoutSheet.getByRole('checkbox').nth(1).check();
      await expect(
        workoutSheet.getByRole('checkbox', { name: 'Also change my routine' }),
      ).not.toBeChecked();
      await workoutSheet.getByRole('button', { name: 'Cancel' }).click();
      await expect(workoutSheet).toBeHidden();

      // Ungroup for this session only (the routine keeps its superset).
      await visible(page, 'gym-superset-ungroup').click();
      const confirm = page.getByRole('dialog', { name: 'Ungroup superset A' });
      await expect(confirm).toBeVisible();
      await expect(
        confirm.getByRole('checkbox', { name: 'Also change my routine' }),
      ).not.toBeChecked();
      await confirm.getByRole('button', { name: 'Ungroup' }).click();
      await expect(page.getByTestId('gym-superset-heading')).toHaveCount(0);
      await expect(page.getByTestId('gym-superset-chip')).toHaveCount(0);

      // ── Clean up: discard the workout, ungroup the routine ──
      await page.getByRole('button', { name: 'Discard workout' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
      await page.waitForURL(/\/gym$/);
      await openActiveRoutineEditor(page);
      await day.getByTestId('routine-superset-ungroup-A').click();
      await expect(day.getByTestId('routine-superset-A')).toHaveCount(0);
      await save.click();
      await expect(save).toBeDisabled({ timeout: 15_000 });
    });
  });
}
