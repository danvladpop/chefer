// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SocialAvailability } from '@chefer/types';
import {
  createNonce,
  requestAppleCredential,
  sha256Hex,
  SocialCancelledError,
  SocialSdkError,
  webProvidersFrom,
} from './social-web';

const base: SocialAvailability = {
  google: { enabled: false, webClientId: null, iosClientId: null, androidClientId: null },
  apple: { enabled: false, servicesId: null, bundleId: null, redirectUri: null },
};

describe('webProvidersFrom', () => {
  it('offers nothing before the API answers and when nothing is configured', () => {
    expect(webProvidersFrom(undefined)).toEqual({ google: null, apple: null });
    expect(webProvidersFrom(base)).toEqual({ google: null, apple: null });
  });

  it('needs the web-specific id: an iOS-only Google configuration is not offered on web', () => {
    const iosOnly = { ...base, google: { ...base.google, enabled: true, iosClientId: 'ios' } };
    expect(webProvidersFrom(iosOnly).google).toBeNull();
    const web = { ...base, google: { ...base.google, enabled: true, webClientId: 'web' } };
    expect(webProvidersFrom(web).google).toEqual({ clientId: 'web' });
  });

  it('needs the Services ID and redirect URI for Apple on web', () => {
    const noServices = {
      ...base,
      apple: { ...base.apple, enabled: true, bundleId: 'com.popdan.chefer' },
    };
    expect(webProvidersFrom(noServices).apple).toBeNull();
    const ok = {
      ...base,
      apple: {
        enabled: true,
        servicesId: 'dev.chefer.web',
        bundleId: 'b',
        redirectUri: 'https://x/login',
      },
    };
    expect(webProvidersFrom(ok).apple).toEqual({
      servicesId: 'dev.chefer.web',
      redirectUri: 'https://x/login',
    });
  });
});

describe('nonce', () => {
  it('hashes with SHA-256 hex', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('creates a fresh raw nonce and its hash each time', async () => {
    const a = await createNonce();
    const b = await createNonce();
    expect(a.raw).toHaveLength(32);
    expect(a.raw).not.toBe(b.raw);
    expect(await sha256Hex(a.raw)).toBe(a.hashed);
  });
});

describe('requestAppleCredential', () => {
  const config = { servicesId: 'dev.chefer.web', redirectUri: 'https://x/login' };

  function stubApple(signIn: () => Promise<unknown>) {
    const init = vi.fn<[Record<string, unknown>], undefined>();
    vi.stubGlobal('AppleID', { auth: { init, signIn } });
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      queueMicrotask(() => {
        (node as HTMLScriptElement).onload?.(new Event('load'));
      });
      return node;
    });
    return init;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('inits the popup flow with the HASHED nonce and returns the RAW one with the token, code and name', async () => {
    const init = stubApple(() =>
      Promise.resolve({
        authorization: { id_token: 'tok', code: 'code-1' },
        user: { name: { firstName: 'Ann', lastName: 'Lee' }, email: 'a@x.dev' },
      }),
    );
    const payload = await requestAppleCredential(config);

    const initArg: Record<string, unknown> = init.mock.calls[0]?.[0] ?? {};
    expect(initArg).toMatchObject({
      clientId: 'dev.chefer.web',
      redirectURI: 'https://x/login',
      usePopup: true,
      scope: 'name email',
    });
    expect(payload).toMatchObject({
      provider: 'APPLE',
      idToken: 'tok',
      authorizationCode: 'code-1',
      givenName: 'Ann',
      familyName: 'Lee',
    });
    // The provider got sha256(raw); the API gets raw.
    expect(await sha256Hex(payload.nonce ?? '')).toBe(initArg['nonce']);
  });

  it('omits name and code when Apple does not send them (every sign-in after the first)', async () => {
    stubApple(() => Promise.resolve({ authorization: { id_token: 'tok' } }));
    const payload = await requestAppleCredential(config);
    expect(payload).not.toHaveProperty('givenName');
    expect(payload).not.toHaveProperty('authorizationCode');
  });

  it('a closed popup is a cancellation, not an error', async () => {
    stubApple(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Apple's SDK rejects with a plain { error } object
      Promise.reject({ error: 'popup_closed_by_user' }),
    );
    await expect(requestAppleCredential(config)).rejects.toBeInstanceOf(SocialCancelledError);
  });

  it('anything else is an SDK error', async () => {
    stubApple(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Apple's SDK rejects with a plain { error } object
      Promise.reject({ error: 'invalid_client' }),
    );
    await expect(requestAppleCredential(config)).rejects.toBeInstanceOf(SocialSdkError);
    stubApple(() => Promise.resolve({}));
    await expect(requestAppleCredential(config)).rejects.toBeInstanceOf(SocialSdkError);
  });
});
