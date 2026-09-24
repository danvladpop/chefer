import { expect, test } from '@playwright/test';
import { AUTH_FILE } from './auth.setup';

// gym_plan.md §7 G5-B. Runs against the "desktop" project's authenticated
// storage state — this file's name doesn't yet match a project's `testMatch`
// pattern (mobile-*.spec.ts / desktop-*.spec.ts / home.spec.ts), so the
// orchestrator needs to add a matching project or rename this file before it
// is picked up by `pnpm test:e2e`. See the G5-B handoff for details; adding a
// project entry is out of this agent's file ownership (tests/playwright.config.ts).
test.describe('Gym: routine editor', () => {
  test.use({ storageState: AUTH_FILE });

  test('create from a template, edit sets, save, and the value persists', async ({ page }) => {
    await page.goto('/gym/routine/all');

    await page.getByRole('button', { name: /new routine/i }).click();

    const dialog = page.getByRole('dialog', { name: 'New routine' });
    await expect(dialog).toBeVisible();
    // Pick whichever template renders first — deterministic content isn't
    // needed, just a routine with at least one exercise to edit.
    await dialog.locator('[data-testid^="template-option-"]').first().click();

    // createFromTemplate navigates straight to the editor for the new routine.
    await page.waitForURL(/\/gym\/routine\/edit\?id=/);

    const setsInput = page.getByTestId('exercise-sets-input').first();
    await expect(setsInput).toBeVisible();
    const original = await setsInput.inputValue();
    const updated = original === '5' ? '4' : '5';
    await setsInput.fill(updated);
    // Commit the number input's change before reading dirty state.
    await setsInput.blur();

    const saveButton = page.getByRole('button', { name: 'Save changes' });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(saveButton).toBeDisabled();

    // Reload from the server (not just the client cache) to prove the save
    // round-tripped through gym.routine.save rather than only updating state.
    await page.reload();
    await expect(page.getByTestId('exercise-sets-input').first()).toHaveValue(updated);

    // Clean up — archive the throwaway routine created for this run so
    // repeated runs don't pile up routines on the shared E2E account.
    const url = new URL(page.url());
    const routineId = url.searchParams.get('id');
    await page.goto('/gym/routine/all');
    if (routineId) {
      const card = page.getByTestId(`routine-card-${routineId}`);
      page.once('dialog', (d) => d.accept());
      await card.getByRole('button', { name: /archive/i }).click();
    }
  });
});
