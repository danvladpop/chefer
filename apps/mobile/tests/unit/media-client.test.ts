import { onAiConsentRequired, SCAN_REQUEST_TIMEOUT_MS, SCAN_TIMEOUT_MESSAGE } from '@chefer/utils';
import { setUnauthorizedHandler } from '../../src/features/auth/session-expired';
import {
  PHOTO_TOO_BIG_MESSAGE,
  SCAN_MAX_BYTES,
  scanMealPhoto,
  ScanUpgradeRequiredError,
  UPLOAD_MAX_BYTES,
  uploadErrorFrom,
  uploadImage,
} from '../../src/lib/media-client';

// T-BUG-O1 (O-18): the client used to do `new Error(data.error)` where
// `error` is `{ code, message }` from Express's global handler
// (apps/api/src/index.ts L204-211), which rendered as the literal string
// "[object Object]". `uploadErrorFrom` reads both shapes the API answers
// with — `{ error: string }` from the uploads/scan routers' own checks,
// `{ error: { code, message } }` from the global handler — and always maps
// to one of the four UX-40 sentences instead of surfacing the raw field.

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('T-BUG-O1 uploadErrorFrom', () => {
  it('maps a plain string error body to the matching sentence via status', () => {
    expect(uploadErrorFrom(413, { error: 'Payload too large' }, 0).message).toBe(
      PHOTO_TOO_BIG_MESSAGE,
    );
    expect(uploadErrorFrom(401, { error: 'Unauthorized' }, 0).message).toBe(
      'Sign in again to add photos.',
    );
    expect(uploadErrorFrom(400, { error: 'Empty upload body' }, 0).message).toBe(
      'Something went wrong on our side. Try again in a moment.',
    );
  });

  it('maps an { code, message } object error body without stringifying it', () => {
    const err = uploadErrorFrom(
      500,
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' } },
      0,
    );
    expect(err.message).toBe('Something went wrong on our side. Try again in a moment.');
    expect(err.message).not.toContain('[object Object]');
    expect(err.message).not.toMatch(/\d{3}/); // never a bare status code
  });

  it('maps a 413 status regardless of body shape', () => {
    expect(uploadErrorFrom(413, null, 0).message).toBe(PHOTO_TOO_BIG_MESSAGE);
    expect(
      uploadErrorFrom(413, { error: { code: 'entity.too.large', message: 'too big' } }, 0).message,
    ).toBe(PHOTO_TOO_BIG_MESSAGE);
  });

  it('maps a 401 status to the signed-out sentence', () => {
    expect(uploadErrorFrom(401, null, 0).message).toBe('Sign in again to add photos.');
  });

  // UX-ACC-10: the same 401 also ends the session, like a tRPC 401 does.
  it('reports a 401 to the shared session-expired handler', () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    try {
      uploadErrorFrom(401, null, 0);
      expect(handler).toHaveBeenCalledTimes(1);
      uploadErrorFrom(500, null, 0);
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      setUnauthorizedHandler(null);
    }
  });

  it('maps a null status (network failure) to the no-connection sentence', () => {
    expect(uploadErrorFrom(null, null, 0).message).toBe(
      'No connection. Try again when you’re back online.',
    );
  });

  it('maps an oversize body to the too-big sentence even without a clean 413 (dropped connection)', () => {
    expect(uploadErrorFrom(null, null, UPLOAD_MAX_BYTES + 1).message).toBe(PHOTO_TOO_BIG_MESSAGE);
  });

  it('keeps a server-written sentence (daily cap, scan quota, AI outage)', () => {
    expect(uploadErrorFrom(429, { error: 'Daily upload limit reached' }, 0).message).toBe(
      'Daily upload limit reached',
    );
    expect(uploadErrorFrom(503, { error: 'Photo scanning is busy right now.' }, 0).message).toBe(
      'Photo scanning is busy right now.',
    );
  });

  it('falls back to the generic sentence for transport checks and bodiless errors', () => {
    expect(uploadErrorFrom(415, { error: 'Unsupported image type' }, 0).message).toBe(
      'Something went wrong on our side. Try again in a moment.',
    );
    expect(uploadErrorFrom(502, null, 0).message).toBe(
      'Something went wrong on our side. Try again in a moment.',
    );
  });
});

describe('T-BUG-O1 uploadImage — client-side size pre-check', () => {
  it('rejects with the too-big sentence before making a network call when oversize', async () => {
    const fetchImpl = jest.fn();
    const bytes = new Uint8Array(UPLOAD_MAX_BYTES + 1);

    await expect(
      uploadImage(
        { fetchImpl, apiBaseUrl: 'https://api.test', getToken: () => 'token' },
        bytes,
        'image/jpeg',
      ),
    ).rejects.toThrow(PHOTO_TOO_BIG_MESSAGE);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uploads a body at or under the limit', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(201, { url: 'https://api.test/uploads/x.jpg' }));
    const bytes = new Uint8Array(UPLOAD_MAX_BYTES);

    await expect(
      uploadImage(
        { fetchImpl, apiBaseUrl: 'https://api.test', getToken: () => 'token' },
        bytes,
        'image/jpeg',
      ),
    ).resolves.toBe('https://api.test/uploads/x.jpg');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps a network failure (fetch rejects) to the no-connection sentence', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      uploadImage(
        { fetchImpl, apiBaseUrl: 'https://api.test', getToken: () => 'token' },
        new Uint8Array(10),
        'image/jpeg',
      ),
    ).rejects.toThrow('No connection. Try again when you’re back online.');
  });

  it('maps a 413 response to the too-big sentence, never the raw body', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(413, { error: { code: 'entity.too.large', message: 'Payload too large' } }),
      );

    await expect(
      uploadImage(
        { fetchImpl, apiBaseUrl: 'https://api.test', getToken: () => 'token' },
        new Uint8Array(10),
        'image/jpeg',
      ),
    ).rejects.toThrow(PHOTO_TOO_BIG_MESSAGE);
  });

  it('maps a 401 response to the signed-out sentence', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));

    await expect(
      uploadImage(
        { fetchImpl, apiBaseUrl: 'https://api.test', getToken: () => null },
        new Uint8Array(10),
        'image/jpeg',
      ),
    ).rejects.toThrow('Sign in again to add photos.');
  });
});

describe('T-BUG-O1 scanMealPhoto — client-side size pre-check and error mapping', () => {
  it('rejects with the too-big sentence before making a network call when over the scan limit', async () => {
    const fetchImpl = jest.fn();
    const bytes = new Uint8Array(SCAN_MAX_BYTES + 1);

    await expect(
      scanMealPhoto(
        { fetchImpl, apiBaseUrl: 'https://api.test', getToken: () => 'token' },
        bytes,
        'image/jpeg',
      ),
    ).rejects.toThrow(PHOTO_TOO_BIG_MESSAGE);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('still surfaces the premium-gate upgrade error distinctly from the four generic sentences', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(403, { error: 'Photo scanning is a premium feature.', upgradeRequired: true }),
      );

    await expect(
      scanMealPhoto(
        { fetchImpl, apiBaseUrl: 'https://api.test', getToken: () => 'token' },
        new Uint8Array(10),
        'image/jpeg',
      ),
    ).rejects.toBeInstanceOf(ScanUpgradeRequiredError);
  });

  it('maps a 500 with the object error shape to the generic sentence, never [object Object]', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(500, {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
      }),
    );

    await expect(
      scanMealPhoto(
        { fetchImpl, apiBaseUrl: 'https://api.test', getToken: () => 'token' },
        new Uint8Array(10),
        'image/jpeg',
      ),
    ).rejects.toThrow('Something went wrong on our side. Try again in a moment.');
  });
});

describe('R-10 scanMealPhoto — server-side AI consent rejection', () => {
  it('reopens the consent sheet and still throws the server sentence', async () => {
    const listener = jest.fn();
    const off = onAiConsentRequired(listener);
    const message = 'Allow AI features in Profile → AI & your data to use this.';
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(403, { error: message, reason: 'AI_CONSENT_REQUIRED' }));

    await expect(
      scanMealPhoto(
        { fetchImpl, apiBaseUrl: 'https://api.test', getToken: () => 'token' },
        new Uint8Array(10),
        'image/jpeg',
      ),
    ).rejects.toThrow(message);
    expect(listener).toHaveBeenCalledWith('meal-scan');
    off();
  });

  it('a plain 403 without the reason does not touch the consent sheet', async () => {
    const listener = jest.fn();
    const off = onAiConsentRequired(listener);
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(403, { error: 'Nope' }));
    await expect(
      scanMealPhoto(
        { fetchImpl, apiBaseUrl: 'https://api.test', getToken: () => 'token' },
        new Uint8Array(10),
        'image/jpeg',
      ),
    ).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});

// UX-FOOD-26: the scan request used to have no timeout.
describe('scanMealPhoto timeout (UX-FOOD-26)', () => {
  afterEach(() => jest.useRealTimers());

  it('gives up after the timeout with a plain sentence and aborts the request', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const hangingFetch = ((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as unknown as typeof fetch;

    const scan = scanMealPhoto(
      { fetchImpl: hangingFetch, apiBaseUrl: 'http://api.test', getToken: () => 't' },
      new Uint8Array([1, 2, 3]),
      'image/jpeg',
    );
    const assertion = expect(scan).rejects.toThrow(SCAN_TIMEOUT_MESSAGE);
    await jest.advanceTimersByTimeAsync(SCAN_REQUEST_TIMEOUT_MS + 10);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });

  it('still returns the estimate when the server answers in time', async () => {
    const estimate = {
      dishName: 'Soup',
      confidence: 'med',
      kcal: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
      portionNote: 'a bowl',
    };
    const fetchImpl = (() =>
      Promise.resolve(jsonResponse(200, { estimate }))) as unknown as typeof fetch;
    await expect(
      scanMealPhoto(
        { fetchImpl, apiBaseUrl: 'http://api.test', getToken: () => 't' },
        new Uint8Array([1]),
        'image/jpeg',
      ),
    ).resolves.toEqual(estimate);
  });
});
