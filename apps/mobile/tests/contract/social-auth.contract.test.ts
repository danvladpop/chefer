import { describe, expect, it } from 'vitest';
import { SOCIAL_AUTH_MESSAGES } from '@chefer/types';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// WP-22 (Sign in with Google / Apple). The API ships with both providers
// DISABLED unless the owner configures credentials, so this suite pins the
// no-credentials path (what CI and a fresh deploy see) and the shapes the
// mobile client codes against. A full sign-in needs a real provider token and
// is covered by the unit tests of the verifier (locally generated keys).
// Spends 1 auth.register from the per-IP budget; auth.social has its own bucket.

const FAKE_TOKEN = 'x'.repeat(40);

describe('social sign-in contract', () => {
  it('auth.socialAvailability is public and returns the documented shape', async () => {
    const { client } = makeContractClient();
    const a = await client.auth.socialAvailability.query();

    expect(typeof a.google.enabled).toBe('boolean');
    expect(typeof a.apple.enabled).toBe('boolean');
    for (const id of [a.google.webClientId, a.google.iosClientId, a.google.androidClientId]) {
      expect(id === null || typeof id === 'string').toBe(true);
    }
    for (const v of [a.apple.servicesId, a.apple.bundleId, a.apple.redirectUri]) {
      expect(v === null || typeof v === 'string').toBe(true);
    }
    // A disabled provider exposes nothing the client could try to use.
    if (!a.google.enabled) {
      expect([a.google.webClientId, a.google.iosClientId, a.google.androidClientId]).toEqual([
        null,
        null,
        null,
      ]);
    }
    if (!a.apple.enabled) {
      expect([a.apple.servicesId, a.apple.bundleId, a.apple.redirectUri]).toEqual([
        null,
        null,
        null,
      ]);
    }
  });

  it('auth.socialSignIn refuses an invalid token and never issues a session', async () => {
    const { client } = makeContractClient();
    for (const provider of ['GOOGLE', 'APPLE'] as const) {
      const attempt = client.auth.socialSignIn.mutate({
        provider,
        idToken: FAKE_TOKEN,
        nonce: 'contract-nonce-123',
        acceptLegal: true,
      });
      // Disabled provider → PRECONDITION_FAILED; configured provider → UNAUTHORIZED.
      await expect(attempt).rejects.toMatchObject({
        data: { code: expect.stringMatching(/^(PRECONDITION_FAILED|UNAUTHORIZED)$/) as string },
      });
    }
  });

  it('auth.socialSignIn validates its input (unknown provider, short token)', async () => {
    const { client } = makeContractClient();
    await expect(
      client.auth.socialSignIn.mutate({ provider: 'GOOGLE', idToken: 'short' }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
  });

  it('linkedIdentities / linkIdentity / unlinkIdentity need a session', async () => {
    const { client } = makeContractClient();
    await expect(client.auth.linkedIdentities.query()).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    });
    await expect(client.auth.unlinkIdentity.mutate({ provider: 'GOOGLE' })).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    });
  });

  it('a password account: no identities, hasPassword; unlink is NOT_FOUND; deleteSelf needs password or re-auth', async () => {
    const { client, setToken } = makeContractClient();
    const registered = await client.auth.register.mutate({
      email: uniqueEmail('social'),
      password: 'Contract@123!',
      firstName: 'Social',
      ...CONTRACT_CONSENT,
    });
    if (!registered.session) throw new Error('missing session');
    setToken(registered.session.token);

    expect(await client.auth.linkedIdentities.query()).toEqual({
      hasPassword: true,
      identities: [],
    });
    await expect(client.auth.unlinkIdentity.mutate({ provider: 'APPLE' })).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    });

    // deleteSelf without any proof: FORBIDDEN with the re-auth hint…
    await expect(client.user.deleteSelf.mutate({ confirm: 'DELETE' })).rejects.toMatchObject({
      data: { code: 'FORBIDDEN' },
      message: SOCIAL_AUTH_MESSAGES.deleteNeedsReauth,
    });
    // …a wrong password keeps its old message (old clients rely on it)…
    await expect(
      client.user.deleteSelf.mutate({ password: 'Wrong@123!', confirm: 'DELETE' }),
    ).rejects.toMatchObject({ message: 'That password is not correct' });
    // …and a garbage re-auth token is refused.
    await expect(
      client.user.deleteSelf.mutate({
        reauth: { provider: 'GOOGLE', idToken: FAKE_TOKEN },
        confirm: 'DELETE',
      }),
    ).rejects.toMatchObject({
      data: { code: expect.stringMatching(/^(FORBIDDEN|PRECONDITION_FAILED)$/) as string },
    });

    // The legacy {password, confirm} payload still deletes the account.
    await expect(
      client.user.deleteSelf.mutate({ password: 'Contract@123!', confirm: 'DELETE' }),
    ).resolves.toEqual({ success: true });
  });
});
