import { expect, test } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // UX-25 (T-25.2, "only what works on the free tier" rule): the hero used to
  // say only "personal chef" (meal planning) — CI-16/CI-25 evidence, "meal
  // planning? My friend said it does workouts." It now leads with the free
  // workout log too.
  test('renders the hero section with correct heading', async ({ page }) => {
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Train and eat');
  });

  test('renders all feature cards', async ({ page }) => {
    await expect(page.getByText('A workout log that tells you what to lift next')).toBeVisible();
    await expect(page.getByText('A week of meals in seconds')).toBeVisible();
    await expect(page.getByText('Allergies respected, always')).toBeVisible();
    await expect(page.getByText('Shopping list with prices')).toBeVisible();
  });

  test('hero CTAs link to register and login', async ({ page }) => {
    const getStarted = page.getByRole('link', { name: /get started free/i });
    await expect(getStarted).toBeVisible();
    await expect(getStarted).toHaveAttribute('href', '/register');

    // "Sign in" appears twice by design: top bar and hero. Both go to /login.
    const signIn = page.getByRole('link', { name: /^sign in$/i });
    await expect(signIn).toHaveCount(2);
    for (const link of await signIn.all()) {
      await expect(link).toHaveAttribute('href', '/login');
    }
  });

  test('has the correct page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Chefer/);
  });

  test('has proper meta description', async ({ page }) => {
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', /meal plan/i);
  });

  test('footer contains the copyright line', async ({ page }) => {
    await expect(page.getByText(/©\s*\d{4}\s*Chefer/)).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('navigates to login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('shows 404 for unknown routes', async ({ page }) => {
    await page.goto('/this-route-definitely-does-not-exist-xyz');
    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Return home' })).toBeVisible();
  });

  test('the deleted /user dev scaffold stays deleted', async ({ page }) => {
    // /user rendered a real account's name and email to anonymous visitors
    // before it was removed (roadmap P0-2). It must never resolve again.
    const response = await page.goto('/user');
    expect(response?.status()).toBe(404);
  });

  test('anonymous /ingredients redirects to login server-side', async ({ page }) => {
    await page.goto('/ingredients');
    await expect(page).toHaveURL(/\/login\?from=%2Fingredients/);
  });
});

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  // /^password/ avoids the strict-mode clash with the "Show password" toggle,
  // whose accessible name also matches a bare /password/i.
  const passwordField = (page: import('@playwright/test').Page) => page.getByLabel(/^password/i);

  test('renders login form with all required fields', async ({ page }) => {
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(passwordField(page)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows validation errors for empty form submission', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('shows error for invalid email format', async ({ page }) => {
    await page.getByLabel(/email address/i).fill('not-an-email');
    await passwordField(page).fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Please enter a valid email address')).toBeVisible();
  });

  test('forgot password link is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
  });

  test('sign up link is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible();
  });

  test('password visibility toggle works', async ({ page }) => {
    const passwordInput = passwordField(page);
    // The toggle's accessible name flips between "Show password" and
    // "Hide password" — match both so the second click still resolves.
    const toggleButton = page.getByRole('button', { name: /(show|hide) password/i });

    await expect(passwordInput).toHaveAttribute('type', 'password');
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });
});

test.describe('Register Page — explicit consent (T-39.1 / T-26.5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('both consent boxes are real, unchecked checkboxes', async ({ page }) => {
    const terms = page.getByRole('checkbox', { name: /terms/i });
    const age = page.getByRole('checkbox', { name: /16 or older/i });
    await expect(terms).toBeVisible();
    await expect(terms).not.toBeChecked();
    await expect(age).toBeVisible();
    await expect(age).not.toBeChecked();
  });

  test('submitting with either box unchecked shows an inline error, not a submission', async ({
    page,
  }) => {
    await page.getByLabel(/first name/i).fill('Ada');
    await page.getByLabel(/last name/i).fill('Lovelace');
    await page.getByLabel(/email address/i).fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('Sup3rSecret!');
    await page.getByLabel(/confirm password/i).fill('Sup3rSecret!');
    // Neither checkbox ticked — the button stays enabled (03 §UX-26 AC), the
    // inline error is what blocks it, not a disabled submit button.
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.locator('#acceptedTerms-error')).toContainText(/agree to the terms/i);
    await expect(page.locator('#ageConfirmed-error')).toContainText(/16 or older/i);
    // Still on the register page — no navigation happened.
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe('Accessibility', () => {
  test('home page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();

    // Scope to real <img> elements — inline SVGs also expose the img role but
    // take aria-label/<title> rather than alt.
    const images = page.locator('img');
    const imageCount = await images.count();
    for (let i = 0; i < imageCount; i++) {
      await expect(images.nth(i)).toHaveAttribute('alt');
    }
  });

  test('login form has proper ARIA labels', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/^password/i)).toBeVisible();
  });

  test('keyboard navigation works on home page', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });
});
