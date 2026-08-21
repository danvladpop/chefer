import { expect, test } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the hero section with correct heading', async ({ page }) => {
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('personal chef');
  });

  test('renders all feature cards', async ({ page }) => {
    await expect(page.getByText('Weekly AI Meal Plans')).toBeVisible();
    await expect(page.getByText('Personalized Goals')).toBeVisible();
    await expect(page.getByText('Smart Shopping Lists')).toBeVisible();
  });

  test('hero CTAs link to register and login', async ({ page }) => {
    const getStarted = page.getByRole('link', { name: /get started for free/i });
    await expect(getStarted).toBeVisible();
    await expect(getStarted).toHaveAttribute('href', '/register');

    const signIn = page.getByRole('link', { name: /^sign in$/i });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute('href', '/login');
  });

  test('has the correct page title', async ({ page }) => {
    await expect(page).toHaveTitle(/PersonalChef/);
  });

  test('has proper meta description', async ({ page }) => {
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', /meal plan/i);
  });

  test('footer contains the copyright line', async ({ page }) => {
    await expect(page.getByText(/All rights reserved/)).toBeVisible();
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
