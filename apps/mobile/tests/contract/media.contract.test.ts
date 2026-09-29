import { beforeAll, describe, expect, it } from 'vitest';
import { base64ToBytes, scanMealPhoto, uploadImage } from '../../src/lib/media-client';
import { API_URL, makeContractClient, SEED_EMAIL, SEED_PASSWORD } from './client';

// Raw-body image endpoints through the app's own media client (M3-2/M3-3).
// The upload round-trip is free and always runs; the meal scan hits real
// vision AI and is gated behind CHEFER_CONTRACT_AI=1.

// 1×1 red PNG.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const { client, setToken, getToken } = makeContractClient();
const media = { fetchImpl: fetch, apiBaseUrl: API_URL, getToken };

beforeAll(async () => {
  const user = await client.auth.login.mutate({ email: SEED_EMAIL, password: SEED_PASSWORD });
  if (!user.session) {
    throw new Error('mobile login response is missing the session credential');
  }
  setToken(user.session.token);
});

// T-BUG-O1 (O-18): the real, non-mocked round trip through the raw-body
// endpoint — proves the wire contract the mobile client's error mapping
// (uploadErrorFrom) relies on: a plain-string `{ error }` body and, since
// Q-22 raised the limit, 10 MB uploads succeeding where 5 MB used to reject.
function pngBytesOfSize(totalBytes: number): Uint8Array {
  const header = base64ToBytes(TINY_PNG_BASE64);
  const bytes = new Uint8Array(totalBytes);
  bytes.set(header.subarray(0, Math.min(8, header.length)));
  return bytes;
}

describe('image upload contract (M3-3)', () => {
  it('uploads bytes and serves them back at the returned URL', async () => {
    const url = await uploadImage(media, base64ToBytes(TINY_PNG_BASE64), 'image/png');
    expect(url).toMatch(/\/uploads\/.+\.png$/);

    const served = await fetch(url);
    expect(served.ok).toBe(true);
    expect(served.headers.get('content-type')).toContain('image/png');
  });

  it('rejects without a token with the signed-out sentence (T-BUG-O1), never a bare status code', async () => {
    await expect(
      uploadImage({ ...media, getToken: () => null }, base64ToBytes(TINY_PNG_BASE64), 'image/png'),
    ).rejects.toThrow('Sign in again to add photos.');
  });

  it('T-BUG-O1: a ~6 MB body uploads OK (the raised 10 MB limit)', async () => {
    const bytes = pngBytesOfSize(6 * 1024 * 1024);
    const url = await uploadImage(media, bytes, 'image/png');
    expect(url).toMatch(/\/uploads\/.+\.png$/);

    const served = await fetch(url);
    expect(served.ok).toBe(true);
    expect(served.headers.get('content-length')).toBe(String(bytes.length));
  });

  it('T-BUG-O1: an oversize body gets a real 413 with a plain string error over the wire', async () => {
    // Bypasses the mobile client's own pre-send size check on purpose — this
    // proves the *server's* wire contract (uploadErrorFrom's 413 branch and
    // apps/web's clients both depend on the API answering exactly this
    // shape), independent of the client-side gating already covered by
    // tests/unit/media-client.test.ts.
    const res = await fetch(`${API_URL}/api/uploads/image`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', authorization: `Bearer ${getToken()}` },
      body: pngBytesOfSize(11 * 1024 * 1024) as unknown as BodyInit,
    });
    expect(res.status).toBe(413);
    const data = (await res.json()) as { error?: unknown };
    expect(typeof data.error).toBe('string');
    expect(data.error).toBe('That photo is too big. Choose another, or use a screenshot of it.');
  });
});

describe.skipIf(process.env.CHEFER_CONTRACT_AI !== '1')('meal scan contract (M3-2)', () => {
  it('returns a vision estimate for a photo', async () => {
    const estimate = await scanMealPhoto(media, base64ToBytes(TINY_PNG_BASE64), 'image/png');
    expect(estimate.dishName).toBeTruthy();
    expect(estimate.kcal).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
