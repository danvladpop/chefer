import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// T-BUG-O1 (O-18): the client used to do `new Error(data.error)` where
// `error` is `{ code, message }` from Express's global handler
// (apps/api/src/index.ts L204-211), which rendered as the literal string
// "[object Object]". `uploadImage` now reads both shapes the API answers
// with and always maps to one of UX-40's four sentences instead.

type UploadImageModule = typeof import('./upload-image');
let uploadImage: UploadImageModule['uploadImage'];

const TOO_BIG = 'That photo is too big. Choose another, or use a screenshot of it.';
const NO_CONNECTION = 'No connection. Try again when you’re back online.';
const SIGNED_OUT = 'Sign in again to add photos.';
const SOMETHING_WRONG = 'Something went wrong on our side. Try again in a moment.';

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test');
  ({ uploadImage } = await import('./upload-image'));
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
  return new File([new Uint8Array(bytes)], 'photo.jpg', { type });
}

describe('T-BUG-O1 uploadImage error sentences', () => {
  it('rejects with the too-big sentence before any network call when over 10 MB', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadImage(fileOfSize(10 * 1024 * 1024 + 1))).rejects.toThrow(TOO_BIG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads a 10 MB file (the new limit) without the pre-check firing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { url: 'https://api.test/uploads/x.jpg' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadImage(fileOfSize(10 * 1024 * 1024))).resolves.toBe(
      'https://api.test/uploads/x.jpg',
    );
  });

  it('maps a 413 with the { code, message } object body to the too-big sentence, never [object Object]', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(413, {
        success: false,
        error: { code: 'entity.too.large', message: 'Payload too large' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const err = await uploadImage(fileOfSize(1024)).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(TOO_BIG);
    expect((err as Error).message).not.toContain('[object Object]');
  });

  it('maps a 413 with the plain { error: string } body to the same sentence', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(413, { error: 'That photo is too big.' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadImage(fileOfSize(1024))).rejects.toThrow(TOO_BIG);
  });

  it('maps a 401 to the signed-out sentence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadImage(fileOfSize(1024))).rejects.toThrow(SIGNED_OUT);
  });

  it('maps a network failure to the no-connection sentence', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadImage(fileOfSize(1024))).rejects.toThrow(NO_CONNECTION);
  });

  it('maps a 500 with the global handler’s object shape to the generic sentence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(500, {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadImage(fileOfSize(1024))).rejects.toThrow(SOMETHING_WRONG);
  });
});
