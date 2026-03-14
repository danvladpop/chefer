import { expect, test } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the hero section with correct heading', async ({ page }) => {
    // Check the main heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('confidence');
  });

  test('renders the tech stack section', async ({ page }) => {
    await expect(page.getByText('Built with industry-standard tools')).toBeVisible();
    await expect(page.getByText('Next.js 15')).toBeVisible();
    await expect(page.getByText('TypeScript 5')).toBeVisible();
    await expect(page.getByText('tRPC v11')).toBeVisible();
  });

  test('renders all feature cards', async ({ page }) => {
    await expect(page.getByText('Type-Safe API')).toBeVisible();
    await expect(page.getByText('Modern Stack')).toBeVisible();
    await expect(page.getByText('Database Ready')).toBeVisible();
    await expect(page.getByText('Testing Suite')).toBeVisible();
    await expect(page.getByText('DX First')).toBeVisible();
    await expect(page.getByText('Production Ready')).toBeVisible();
  });

  test('Get Started button links to dashboard', async ({ page }) => {
    const getStartedLink = page.getByRole('link', { name: 'Get Started' });
    await expect(getStartedLink).toBeVisible();
    await expect(getStartedLink).toHaveAttribute('href', '/dashboard');
  });

  test('has the correct page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Chefer/);
  });

  test('has proper meta description', async ({ page }) => {
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', /monorepo/i);
  });

  test('footer contains license text', async ({ page }) => {
    await expect(page.getByText('MIT License')).toBeVisible();
  });

  test('CTA section has setup command', async ({ page }) => {
    await expect(page.getByText(/setup\.sh/)).toBeVisible();
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
});

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders login form with all required fields', async ({ page }) => {
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows validation errors for empty form submission', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('shows error for invalid email format', async ({ page }) => {
    await page.getByLabel(/email address/i).fill('not-an-email');
    await page.getByLabel(/password/i).fill('password123');
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
    const passwordInput = page.getByLabel(/password/i);
    const toggleButton = page.getByRole('button', { name: /show password/i });

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

    // Check for proper heading hierarchy
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();

    // Check that all images have alt text
    const images = page.getByRole('img');
    const imageCount = await images.count();
    for (let i = 0; i < imageCount; i++) {
      await expect(images.nth(i)).toHaveAttribute('alt');
    }
  });

  test('login form has proper ARIA labels', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('keyboard navigation works on home page', async ({ page }) => {
    await page.goto('/');

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });
});
