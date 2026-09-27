import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// T-BUG-O1 (O-18): scanMealPhoto used to do `new Error(data.error)` where
// `error` can be `{ code, message }` from Express's global handler, which
// rendered as the literal string "[object Object]". It now reads both
// shapes and always maps to one of UX-40's four sentences (the 403
// premium-gate case is handled separately, unaffected by this fix).

type ScanClientModule = typeof import('./scan-client');
let scanMealPhoto: ScanClientModule['scanMealPhoto'];
let ScanUpgradeRequiredError: ScanClientModule['ScanUpgradeRequiredError'];

const TOO_BIG = 'That photo is too big. Choose another, or use a screenshot of it.';
const NO_CONNECTION = 'No connection. Try again when you’re back online.';
const SIGNED_OUT = 'Sign in again to add photos.';
const SOMETHING_WRONG = 'Something went wrong on our side. Try again in a moment.';

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test');
  ({ scanMealPhoto, ScanUpgradeRequiredError } = await import('./scan-client'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function fileOfSize(bytes: number, type = 'image/jpeg'): File {
  return new File([new Uint8Array(bytes)], 'meal.jpg', { type });
}

describe('T-BUG-O1 scanMealPhoto error sentences', () => {
  it('rejects with the too-big sentence before any network call when over the 5 MB scan limit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(scanMealPhoto(fileOfSize(5 * 1024 * 1024 + 1))).rejects.toThrow(TOO_BIG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still throws ScanUpgradeRequiredError on the premium gate, unaffected by the sentence mapping', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(403, {
        error: 'Photo scanning is a premium feature.',
        upgradeRequired: true,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(scanMealPhoto(fileOfSize(1024))).rejects.toBeInstanceOf(ScanUpgradeRequiredError);
  });

  it('maps a 413 with the { code, message } object body to the too-big sentence, never [object Object]', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(413, {
        success: false,
        error: { code: 'entity.too.large', message: 'Payload too large' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const err = await scanMealPhoto(fileOfSize(1024)).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(TOO_BIG);
    expect((err as Error).message).not.toContain('[object Object]');
  });

  it('maps a 401 to the signed-out sentence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(scanMealPhoto(fileOfSize(1024))).rejects.toThrow(SIGNED_OUT);
  });

  it('maps a network failure to the no-connection sentence', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(scanMealPhoto(fileOfSize(1024))).rejects.toThrow(NO_CONNECTION);
  });

  it('maps a 500 with the global handler’s object shape to the generic sentence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(500, {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(scanMealPhoto(fileOfSize(1024))).rejects.toThrow(SOMETHING_WRONG);
  });
});
