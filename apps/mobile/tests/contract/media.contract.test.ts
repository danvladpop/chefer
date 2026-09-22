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

describe('image upload contract (M3-3)', () => {
  it('uploads bytes and serves them back at the returned URL', async () => {
    const url = await uploadImage(media, base64ToBytes(TINY_PNG_BASE64), 'image/png');
    expect(url).toMatch(/\/uploads\/.+\.png$/);

    const served = await fetch(url);
    expect(served.ok).toBe(true);
    expect(served.headers.get('content-type')).toContain('image/png');
  });

  it('rejects without a token', async () => {
    await expect(
      uploadImage({ ...media, getToken: () => null }, base64ToBytes(TINY_PNG_BASE64), 'image/png'),
    ).rejects.toThrow(/Unauthorized|401/);
  });
});

describe.skipIf(process.env.CHEFER_CONTRACT_AI !== '1')('meal scan contract (M3-2)', () => {
  it('returns a vision estimate for a photo', async () => {
    const estimate = await scanMealPhoto(media, base64ToBytes(TINY_PNG_BASE64), 'image/png');
    expect(estimate.dishName).toBeTruthy();
    expect(estimate.kcal).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
