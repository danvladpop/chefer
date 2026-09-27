import { expect, test, type Page } from '@playwright/test';
import { gotoAndSettle } from './helpers/layout';

// ─── Recipe photo upload errors (T-BUG-O1, O-18, UX-21 AC 11) ─────────────────
// A failed upload on the web recipe form is always a sentence — never
// "[object Object]" and never a status code. The API's global error handler
// answers `{ error: { code, message } }`; that object used to be passed
// straight into `new Error(...)`.

const TOO_BIG = 'That photo is too big. Choose another, or use a screenshot of it.';
const GENERIC = 'Something went wrong on our side. Try again in a moment.';

function jpeg(bytes: number) {
  return { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(bytes, 0xff) };
}

// The API is cross-origin with credentials, so a mocked answer needs the CORS
// headers (and a preflight answer) or the browser reports a network failure.
async function mockUpload(page: Page, status: number, body: unknown) {
  await page.route('**/api/uploads/image', (route) => {
    const headers = {
      'access-control-allow-origin': new URL(page.url()).origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'POST',
      'access-control-allow-headers': 'content-type',
    };
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers });
    }
    return route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function openForm(page: Page) {
  await gotoAndSettle(page, '/recipes/new');
  return page.locator('input[type="file"]').first();
}

async function expectNoRawError(page: Page) {
  await expect(page.getByText('[object Object]')).toHaveCount(0);
  await expect(page.getByText(/\b(413|500)\b/)).toHaveCount(0);
}

test.describe('T-BUG-O1: recipe photo upload errors are sentences', () => {
  test('a 500 in the global handler shape shows the generic sentence', async ({ page }) => {
    const input = await openForm(page);
    await mockUpload(page, 500, {
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
    });
    await input.setInputFiles(jpeg(2048));
    await expect(page.getByText(GENERIC)).toBeVisible();
    await expectNoRawError(page);
  });

  test('a 413 shows the too-big sentence', async ({ page }) => {
    const input = await openForm(page);
    await mockUpload(page, 413, { error: { code: 'entity.too.large', message: 'too large' } });
    await input.setInputFiles(jpeg(2048));
    await expect(page.getByText(TOO_BIG)).toBeVisible();
    await expectNoRawError(page);
  });

  test('a file over 10 MB is stopped before any request', async ({ page }) => {
    let requests = 0;
    await page.route('**/api/uploads/image', (route) => {
      requests += 1;
      return route.abort();
    });
    const input = await openForm(page);
    await input.setInputFiles(jpeg(11 * 1024 * 1024));
    await expect(page.getByText(TOO_BIG)).toBeVisible();
    expect(requests).toBe(0);
  });
});
