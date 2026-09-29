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

const ALL_JOB_IDS = [
  'TRAIN',
  'PLAN_MEALS',
  'HOUSEHOLD',
  'USE_WHAT_I_HAVE',
  'SAVED_RECIPES',
  'TRACK',
] as const;

test.describe('Preferences — "What you use Chefer for" (T-03.5, UX-03)', () => {
  test('shows the job cards and saves a selection change', async ({ page }) => {
    await gotoAndSettle(page, '/preferences');

    await expect(page.getByRole('heading', { name: 'What you use Chefer for' })).toBeVisible();
    const trackCard = page.getByTestId('onboarding-job-TRACK');
    await expect(trackCard).toBeVisible();

    // Every existing account (prod accounts included — bug found via the
    // integration Playwright run, 2026-09-29) can legitimately have zero
    // saved jobs, so this test cannot assume the starting selection is
    // non-empty. Capture the FULL original selection, not just TRACK's own
    // state, since restoring it afterwards needs to know whether that
    // selection was empty.
    const originallySelected: string[] = [];
    for (const job of ALL_JOB_IDS) {
      if (
        (await page.getByTestId(`onboarding-job-${job}`).getAttribute('aria-checked')) === 'true'
      ) {
        originallySelected.push(job);
      }
    }

    // Toggle TRACK — unless it is the only selected job, where deselecting it
    // would leave zero jobs (Save is disabled at zero): toggle another job on.
    const targetJob =
      originallySelected.length === 1 && originallySelected[0] === 'TRACK'
        ? ALL_JOB_IDS.find((j) => j !== 'TRACK')!
        : 'TRACK';
    const target = page.getByTestId(`onboarding-job-${targetJob}`);
    const wasSelected = originallySelected.includes(targetJob);
    await target.click();
    await expect(target).toHaveAttribute('aria-checked', wasSelected ? 'false' : 'true');

    const saveResponse = page.waitForResponse(
      (r) => r.url().includes('preferences.setJobs') && r.status() === 200,
    );
    await page.getByTestId('jobs-section-save').click();
    await saveResponse;

    // Persisted — a reload shows the same selection, not the pre-save one.
    await gotoAndSettle(page, '/preferences');
    await expect(page.getByTestId(`onboarding-job-${targetJob}`)).toHaveAttribute(
      'aria-checked',
      wasSelected ? 'false' : 'true',
    );

    // Restore the original selection — but only when it had at least one
    // job. Toggling TRACK back to its original (unselected) state when the
    // account started with ZERO jobs selected would leave zero jobs
    // selected again, and Save is intentionally disabled at zero (see the
    // sibling test below) — there is no UI path back to "no jobs" once a
    // real selection has been saved, on web or mobile, so this is not
    // something the test can or should restore.
    if (originallySelected.length > 0) {
      await page.getByTestId(`onboarding-job-${targetJob}`).click();
      const restoreResponse = page.waitForResponse(
        (r) => r.url().includes('preferences.setJobs') && r.status() === 200,
      );
      await page.getByTestId('jobs-section-save').click();
      await restoreResponse;
    }
  });

  test('Save is disabled at zero jobs selected', async ({ page }) => {
    await gotoAndSettle(page, '/preferences');

    // Deselect every currently-selected job card.
    for (const job of ALL_JOB_IDS) {
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
