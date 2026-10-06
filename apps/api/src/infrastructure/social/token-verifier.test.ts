import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestKeys, type TestKeys } from './testing.js';
import { SocialTokenError, SocialTokenVerifier } from './token-verifier.js';

const GOOGLE_AUD = 'google-web.apps.googleusercontent.com';
const APPLE_AUD = 'com.popdan.chefer';

let keys: TestKeys;
let verifier: SocialTokenVerifier;

beforeAll(async () => {
  keys = await createTestKeys();
  verifier = new SocialTokenVerifier(keys.resolvers, () => ({
    GOOGLE: [GOOGLE_AUD, 'google-ios.apps.googleusercontent.com'],
    APPLE: [APPLE_AUD, 'dev.chefer.web'],
  }));
});

const sha256Hex = (v: string) => createHash('sha256').update(v).digest('hex');

async function rejection(promise: Promise<unknown>): Promise<SocialTokenError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(SocialTokenError);
  return err as SocialTokenError;
}

describe('SocialTokenVerifier', () => {
  it('accepts a valid Google token and normalises the identity', async () => {
    const idToken = await keys.sign('GOOGLE', {
      sub: 'g-1',
      aud: GOOGLE_AUD,
      email: 'Alice@Gmail.com ',
      email_verified: true,
      given_name: 'Alice',
      family_name: 'Doe',
    });
    await expect(verifier.verify({ provider: 'GOOGLE', idToken })).resolves.toEqual({
      provider: 'GOOGLE',
      subject: 'g-1',
      email: 'alice@gmail.com',
      emailVerified: true,
      audience: GOOGLE_AUD,
      givenName: 'Alice',
      familyName: 'Doe',
    });
  });

  it('accepts any configured audience (iOS Google client)', async () => {
    const idToken = await keys.sign('GOOGLE', {
      sub: 'g-1',
      aud: 'google-ios.apps.googleusercontent.com',
    });
    const v = await verifier.verify({ provider: 'GOOGLE', idToken });
    expect(v.audience).toBe('google-ios.apps.googleusercontent.com');
  });

  it('rejects a token for another client id (audience)', async () => {
    const idToken = await keys.sign('GOOGLE', { sub: 'g-1', aud: 'someone-elses-app' });
    expect((await rejection(verifier.verify({ provider: 'GOOGLE', idToken }))).reason).toBe(
      'audience',
    );
  });

  it('rejects a token with the wrong issuer for the provider', async () => {
    // An Apple-issued token presented as a Google one.
    const idToken = await keys.sign('APPLE', { sub: 'a-1', aud: GOOGLE_AUD });
    expect((await rejection(verifier.verify({ provider: 'GOOGLE', idToken }))).reason).toBe(
      'issuer',
    );
  });

  it('rejects an expired token', async () => {
    const idToken = await keys.sign(
      'GOOGLE',
      { sub: 'g-1', aud: GOOGLE_AUD },
      { iat: -7200, exp: -3600 },
    );
    expect((await rejection(verifier.verify({ provider: 'GOOGLE', idToken }))).reason).toBe(
      'expired',
    );
  });

  it('rejects a token signed by a different key', async () => {
    const idToken = await keys.signWithForeignKey('GOOGLE', { sub: 'g-1', aud: GOOGLE_AUD });
    expect((await rejection(verifier.verify({ provider: 'GOOGLE', idToken }))).reason).toBe(
      'invalid',
    );
  });

  it('rejects HS256 / unsigned tokens (algorithm confusion)', async () => {
    const hs = await new SignJWT({ sub: 'g-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience(GOOGLE_AUD)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('x'.repeat(32)));
    await rejection(verifier.verify({ provider: 'GOOGLE', idToken: hs }));
    await rejection(verifier.verify({ provider: 'GOOGLE', idToken: 'not-a-jwt-at-all-xxxxxxxx' }));
  });

  it('rejects a token older than maxTokenAgeSeconds (re-authentication freshness)', async () => {
    const idToken = await keys.sign('GOOGLE', { sub: 'g-1', aud: GOOGLE_AUD }, { iat: -1800 });
    await expect(verifier.verify({ provider: 'GOOGLE', idToken })).resolves.toBeDefined();
    await rejection(verifier.verify({ provider: 'GOOGLE', idToken }, { maxTokenAgeSeconds: 600 }));
  });

  describe('nonce', () => {
    it('Apple: accepts the SHA-256 of the raw nonce, or the raw nonce itself', async () => {
      const raw = 'raw-nonce-1234567890';
      const hashed = await keys.sign('APPLE', {
        sub: 'a-1',
        aud: APPLE_AUD,
        nonce: sha256Hex(raw),
      });
      const plain = await keys.sign('APPLE', { sub: 'a-1', aud: APPLE_AUD, nonce: raw });
      await expect(
        verifier.verify({ provider: 'APPLE', idToken: hashed, nonce: raw }),
      ).resolves.toBeDefined();
      await expect(
        verifier.verify({ provider: 'APPLE', idToken: plain, nonce: raw }),
      ).resolves.toBeDefined();
    });

    it('Apple: rejects a wrong nonce, a missing client nonce and a token without a nonce', async () => {
      const raw = 'raw-nonce-1234567890';
      const withNonce = await keys.sign('APPLE', {
        sub: 'a-1',
        aud: APPLE_AUD,
        nonce: sha256Hex(raw),
      });
      const without = await keys.sign('APPLE', { sub: 'a-1', aud: APPLE_AUD });
      expect(
        (
          await rejection(
            verifier.verify({ provider: 'APPLE', idToken: withNonce, nonce: 'another-nonce-123' }),
          )
        ).reason,
      ).toBe('nonce');
      expect(
        (await rejection(verifier.verify({ provider: 'APPLE', idToken: withNonce }))).reason,
      ).toBe('nonce');
      expect(
        (await rejection(verifier.verify({ provider: 'APPLE', idToken: without, nonce: raw })))
          .reason,
      ).toBe('nonce');
      expect(
        (await rejection(verifier.verify({ provider: 'APPLE', idToken: without }))).reason,
      ).toBe('nonce');
    });

    it('Google: nonce is optional unless the token carries one', async () => {
      const plain = await keys.sign('GOOGLE', { sub: 'g-1', aud: GOOGLE_AUD });
      await expect(verifier.verify({ provider: 'GOOGLE', idToken: plain })).resolves.toBeDefined();
      const withNonce = await keys.sign('GOOGLE', {
        sub: 'g-1',
        aud: GOOGLE_AUD,
        nonce: 'n-0123456789',
      });
      await rejection(verifier.verify({ provider: 'GOOGLE', idToken: withNonce }));
      await expect(
        verifier.verify({ provider: 'GOOGLE', idToken: withNonce, nonce: 'n-0123456789' }),
      ).resolves.toBeDefined();
    });
  });

  it('treats Apple\'s string "true" email_verified as verified and a missing email as unverified', async () => {
    const raw = 'raw-nonce-1234567890';
    const nonce = sha256Hex(raw);
    const ok = await keys.sign('APPLE', {
      sub: 'a-1',
      aud: APPLE_AUD,
      nonce,
      email: 'x@privaterelay.appleid.com',
      email_verified: 'true',
    });
    const noEmail = await keys.sign('APPLE', {
      sub: 'a-1',
      aud: APPLE_AUD,
      nonce,
      email_verified: 'true',
    });
    expect(await verifier.verify({ provider: 'APPLE', idToken: ok, nonce: raw })).toMatchObject({
      email: 'x@privaterelay.appleid.com',
      emailVerified: true,
    });
    expect(
      await verifier.verify({ provider: 'APPLE', idToken: noEmail, nonce: raw }),
    ).toMatchObject({
      email: null,
      emailVerified: false,
    });
  });

  it('fails closed when the provider has no configured audience', async () => {
    const none = new SocialTokenVerifier(keys.resolvers, () => ({ GOOGLE: [], APPLE: [] }));
    const idToken = await keys.sign('GOOGLE', { sub: 'g-1', aud: GOOGLE_AUD });
    await rejection(none.verify({ provider: 'GOOGLE', idToken }));
  });
});
