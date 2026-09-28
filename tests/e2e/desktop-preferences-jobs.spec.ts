import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Preferences: home-display toggle + "What you use Chefer for" (T-03.5,
// T-04.5, T-04.7 web parity) ─────────────────────────────────────────────────
// Web equivalents of mobile's HomeDisplayToggle (apps/mobile/src/features/
// preferences/home-display-toggle.tsx) and Settings › jobs screen (apps/
// mobile/app/settings/jobs.tsx). Same account for both tests, so serial
// avoids two workers racing the same preferences.setHomeDisplay/setJobs
// writes (same reasoning as desktop-tracker.spec.ts's "one account" note).
test.describe.configure({ mode: 'serial' });

test.describe('Preferences — home-display toggle (T-04.5)', () => {
  test('flips, persists the request, and survives a reload', async ({ page }) => {
    await gotoAndSettle(page, '/preferences');

    const toggle = page.getByTestId('prefs-home-display-switch');
    await expect(toggle).toBeVisible();
    const before = await toggle.getAttribute('aria-checked');

    const saved = page.waitForResponse(
      (r) => r.url().includes('preferences.setHomeDisplay') && r.status() === 200,
    );
    await toggle.click();
    await saved;
    await expect(toggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');

    // Persisted server-side, not just optimistic local state.
    await gotoAndSettle(page, '/preferences');
    await expect(page.getByTestId('prefs-home-display-switch')).toHaveAttribute(
      'aria-checked',
      before === 'true' ? 'false' : 'true',
    );

    // Restore the original value so this test is idempotent across runs.
    const restored = page.waitForResponse(
      (r) => r.url().includes('preferences.setHomeDisplay') && r.status() === 200,
    );
    await page.getByTestId('prefs-home-display-switch').click();
    await restored;
  });
});

test.describe('Preferences — "What you use Chefer for" (T-03.5, UX-03)', () => {
  test('shows the job cards and saves a selection change', async ({ page }) => {
    await gotoAndSettle(page, '/preferences');

    await expect(page.getByRole('heading', { name: 'What you use Chefer for' })).toBeVisible();
    const trackCard = page.getByTestId('onboarding-job-TRACK');
    await expect(trackCard).toBeVisible();

    const wasSelected = (await trackCard.getAttribute('aria-checked')) === 'true';
    await trackCard.click();
    await expect(trackCard).toHaveAttribute('aria-checked', wasSelected ? 'false' : 'true');

    const saveResponse = page.waitForResponse(
      (r) => r.url().includes('preferences.setJobs') && r.status() === 200,
    );
    await page.getByTestId('jobs-section-save').click();
    await saveResponse;

    // Persisted — a reload shows the same selection, not the pre-save one.
    await gotoAndSettle(page, '/preferences');
    await expect(page.getByTestId('onboarding-job-TRACK')).toHaveAttribute(
      'aria-checked',
      wasSelected ? 'false' : 'true',
    );

    // Restore the original selection.
    await page.getByTestId('onboarding-job-TRACK').click();
    const restoreResponse = page.waitForResponse(
      (r) => r.url().includes('preferences.setJobs') && r.status() === 200,
    );
    await page.getByTestId('jobs-section-save').click();
    await restoreResponse;
  });

  test('Save is disabled at zero jobs selected', async ({ page }) => {
    await gotoAndSettle(page, '/preferences');

    // Deselect every currently-selected job card.
    const jobIds = [
      'TRAIN',
      'PLAN_MEALS',
      'HOUSEHOLD',
      'USE_WHAT_I_HAVE',
      'SAVED_RECIPES',
      'TRACK',
    ] as const;
    for (const job of jobIds) {
      const card = page.getByTestId(`onboarding-job-${job}`);
      if ((await card.getAttribute('aria-checked')) === 'true') {
        await card.click();
      }
    }

    await expect(page.getByTestId('jobs-section-save')).toBeDisabled();

    // Leave the page without saving — the deselect-all above never hit Save,
    // so the account's real jobs are untouched.
    await page.goto('/dashboard');
  });
});
