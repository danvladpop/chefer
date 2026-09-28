import { expect, test, type Page } from '@playwright/test';

// ─── Onboarding: jobs-based wizard v3 (§2.4, T-03.6) ───────────────────────────
// Mirrors apps/web/src/features/onboarding/components/onboarding-wizard.test.tsx
// (unit) and apps/mobile/tests/unit/onboarding-ai-consent.test.tsx (AC7), as a
// real end-to-end walk through a freshly registered account — the onboarding
// page redirects to /dashboard once a profile exists (see (dashboard)/
// onboarding/page.tsx), so every test here needs its own throwaway account
// rather than reusing the suite's seeded/authenticated session. New accounts
// default to the free tier (schema.prisma planTier @default(FREE)), which is
// also what AC7's "free users are never asked" case needs.

async function registerFreshAccount(page: Page): Promise<string> {
  const email = `e2e-onboarding-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
  await page.goto('/register');
  await page.getByLabel(/first name/i).fill('Ada');
  await page.getByLabel(/last name/i).fill('Lovelace');
  await page.getByLabel(/email address/i).fill(email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('Sup3rSecret!');
  await page.getByLabel(/confirm password/i).fill('Sup3rSecret!');
  await page.getByRole('checkbox', { name: /terms/i }).check();
  await page.getByRole('checkbox', { name: /16 or older/i }).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('**/onboarding', { timeout: 20_000 });
  await expect(page.getByTestId('onboarding-job-PLAN_MEALS')).toBeVisible();
  return email;
}

test.describe('Onboarding — jobs step (§2.4, T-03.6)', () => {
  test('asks "What should Chefer help with?" first; Continue is disabled at 0 (AC1)', async ({
    page,
  }) => {
    await registerFreshAccount(page);

    await expect(
      page.getByRole('heading', { name: 'What should Chefer help with?' }),
    ).toBeVisible();
    await expect(page.getByTestId('onboarding-continue')).toBeDisabled();

    const planMeals = page.getByTestId('onboarding-job-PLAN_MEALS');
    await planMeals.click();
    await expect(planMeals).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('onboarding-continue')).toBeEnabled();
    await expect(page.getByTestId('onboarding-continue')).toHaveText('Continue — 1 selected');

    // Deselecting drops it back to disabled.
    await planMeals.click();
    await expect(planMeals).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('onboarding-continue')).toBeDisabled();
  });

  test('Train only hands off straight to gym setup — no food wizard first (AC2)', async ({
    page,
  }) => {
    await registerFreshAccount(page);

    await page.getByTestId('onboarding-job-TRAIN').click();
    const saved = page.waitForResponse(
      (r) => r.url().includes('preferences.setJobs') && r.status() === 200,
    );
    await page.getByTestId('onboarding-continue').click();
    await saved;

    await page.waitForURL('**/gym/setup**', { timeout: 20_000 });
  });

  test('Feed my household adds "Who\'s at your table?" before the food steps (AC4)', async ({
    page,
  }) => {
    await registerFreshAccount(page);

    await page.getByTestId('onboarding-job-HOUSEHOLD').click();
    await page.getByTestId('onboarding-continue').click();

    await expect(page.getByRole('heading', { name: "Who's at your table?" })).toBeVisible();
  });

  test('"Just looking around" saves PLAN_MEALS and lands on the dashboard, free tier never asks for AI consent (AC7)', async ({
    page,
  }) => {
    await registerFreshAccount(page);

    const saved = page.waitForResponse(
      (r) => r.url().includes('preferences.setJobs') && r.status() === 200,
    );
    await page.getByRole('button', { name: 'Just looking around' }).click();
    await saved;

    await page.waitForURL('**/dashboard', { timeout: 20_000 });
    // AC7: a free account's first-week generate is curated, not AI — the
    // consent sheet must never appear.
    await expect(page.getByTestId('ai-consent-sheet')).toBeHidden();
  });
});
