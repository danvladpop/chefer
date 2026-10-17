import { createHash } from 'node:crypto';
import { SOCIAL_AUTH_MESSAGES, type SocialAvailability } from '@chefer/types';
import type {
  GoogleSignIn,
  NativeSignInModules,
} from '../../src/features/auth/social/native-modules';
import {
  createNonce,
  requestAppleCredential,
  requestGoogleCredential,
  SocialCancelledError,
  SocialSdkError,
} from '../../src/features/auth/social/social-credentials';
import { socialErrorMessage } from '../../src/features/auth/social/social-errors';
import { resolveSocialProviders } from '../../src/features/auth/social/social-providers';

// WP-22: the pure parts of "Continue with Apple / Google" — which buttons a
// device may offer, the nonce, and the payload each provider yields.

jest.mock('expo-crypto', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't reference imports
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  return {
    getRandomBytes: (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
    digestStringAsync: (_alg: string, data: string) =>
      Promise.resolve(nodeCrypto.createHash('sha256').update(data).digest('hex')),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex' },
  };
});
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
jest.mock('../../src/lib/trpc', () => ({ trpc: {} }));

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function availability(overrides: {
  google?: Partial<SocialAvailability['google']>;
  apple?: Partial<SocialAvailability['apple']>;
}): SocialAvailability {
  return {
    google: {
      enabled: true,
      webClientId: 'web.apps.googleusercontent.com',
      iosClientId: 'ios.apps.googleusercontent.com',
      androidClientId: 'android.apps.googleusercontent.com',
      ...overrides.google,
    },
    apple: {
      enabled: true,
      servicesId: 'dev.chefer.web',
      bundleId: 'com.popdan.chefer',
      redirectUri: 'https://chefer.example/login',
      ...overrides.apple,
    },
  };
}

const fakeApple = {} as NonNullable<NativeSignInModules['apple']>;
const fakeGoogle = {} as GoogleSignIn;
const FULL_NATIVE: NativeSignInModules = { apple: fakeApple, google: fakeGoogle };
const FULL_BUILD = { apple: true, googleIos: true };

describe('resolveSocialProviders (which buttons a device may offer)', () => {
  const resolve = (
    over: Partial<Parameters<typeof resolveSocialProviders>[0]> = {},
  ): ReturnType<typeof resolveSocialProviders> =>
    resolveSocialProviders({
      availability: availability({}),
      native: FULL_NATIVE,
      build: FULL_BUILD,
      platform: 'ios',
      ...over,
    });

  it('offers both on iOS when configured, built in and present', () => {
    const result = resolve();
    expect(result.apple).toBe(fakeApple);
    expect(result.google?.config).toEqual({
      iosClientId: 'ios.apps.googleusercontent.com',
      webClientId: 'web.apps.googleusercontent.com',
    });
  });

  it('never offers Apple on Android', () => {
    const result = resolve({ platform: 'android' });
    expect(result.apple).toBeNull();
    expect(result.google?.config).toEqual({ webClientId: 'web.apps.googleusercontent.com' });
  });

  it('hides a provider the server has not enabled (and everything while loading or failed)', () => {
    expect(resolve({ availability: availability({ apple: { enabled: false } }) }).apple).toBeNull();
    expect(
      resolve({ availability: availability({ google: { enabled: false } }) }).google,
    ).toBeNull();
    expect(resolve({ availability: undefined })).toEqual({ apple: null, google: null });
    expect(resolve({ native: null })).toEqual({ apple: null, google: null });
  });

  it('hides a provider whose native module is missing from this binary', () => {
    expect(resolve({ native: { apple: null, google: fakeGoogle } }).apple).toBeNull();
    expect(resolve({ native: { apple: fakeApple, google: null } }).google).toBeNull();
  });

  it('needs the client id of the current platform (iOS: iOS id + URL scheme; Android: web id)', () => {
    expect(
      resolve({ availability: availability({ google: { iosClientId: null } }) }).google,
    ).toBeNull();
    expect(resolve({ build: { apple: true, googleIos: false } }).google).toBeNull();
    expect(
      resolve({
        platform: 'android',
        availability: availability({ google: { webClientId: null } }),
      }).google,
    ).toBeNull();
    // iOS without a web client id still works (the token's audience is the iOS client).
    expect(
      resolve({ availability: availability({ google: { webClientId: null } }) }).google?.config,
    ).toEqual({ iosClientId: 'ios.apps.googleusercontent.com' });
  });

  it('hides Apple when this binary was built without the entitlement (dev variant)', () => {
    expect(resolve({ build: { apple: false, googleIos: true } }).apple).toBeNull();
  });
});

describe('createNonce', () => {
  it('returns >= 16 chars of raw nonce and its lowercase-hex SHA-256', async () => {
    const { raw, hashed } = await createNonce();
    expect(raw.length).toBeGreaterThanOrEqual(16);
    expect(hashed).toBe(sha256(raw));
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect((await createNonce()).raw).not.toBe(raw);
  });
});

describe('requestAppleCredential', () => {
  function appleModule(signInAsync: jest.Mock): NonNullable<NativeSignInModules['apple']> {
    return {
      signInAsync,
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    } as unknown as NonNullable<NativeSignInModules['apple']>;
  }
  const credential = {
    identityToken: 'apple.identity.token',
    authorizationCode: 'auth-code',
    fullName: { givenName: 'Ada', familyName: 'Lovelace' },
  };

  it('asks for name + email with the HASHED nonce and sends the RAW nonce, code and name', async () => {
    const signInAsync = jest.fn((_options: { requestedScopes: number[]; nonce: string }) =>
      Promise.resolve(credential),
    );
    const payload = await requestAppleCredential(appleModule(signInAsync));

    const [options] = signInAsync.mock.calls[0] ?? [];
    expect(options?.requestedScopes).toEqual([0, 1]);
    expect(payload.nonce).toBeDefined();
    expect(options?.nonce).toBe(sha256(payload.nonce ?? ''));
    expect(payload).toEqual({
      provider: 'APPLE',
      idToken: 'apple.identity.token',
      nonce: payload.nonce,
      authorizationCode: 'auth-code',
      givenName: 'Ada',
      familyName: 'Lovelace',
    });
  });

  it('omits the name when Apple does not send it (every authorization after the first)', async () => {
    const payload = await requestAppleCredential(
      appleModule(jest.fn(() => Promise.resolve({ ...credential, fullName: null }))),
    );
    expect(payload).not.toHaveProperty('givenName');
    expect(payload).not.toHaveProperty('familyName');
    const blank = await requestAppleCredential(
      appleModule(
        jest.fn(() =>
          Promise.resolve({ ...credential, fullName: { givenName: ' ', familyName: null } }),
        ),
      ),
    );
    expect(blank).not.toHaveProperty('givenName');
  });

  it('treats the user closing the sheet as a silent cancel', async () => {
    const cancelled = Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' });
    await expect(
      requestAppleCredential(appleModule(jest.fn(() => Promise.reject(cancelled)))),
    ).rejects.toBeInstanceOf(SocialCancelledError);
  });

  it('turns any other failure, or a missing token, into an SDK error', async () => {
    await expect(
      requestAppleCredential(appleModule(jest.fn(() => Promise.reject(new Error('boom'))))),
    ).rejects.toBeInstanceOf(SocialSdkError);
    await expect(
      requestAppleCredential(
        appleModule(jest.fn(() => Promise.resolve({ ...credential, identityToken: null }))),
      ),
    ).rejects.toBeInstanceOf(SocialSdkError);
  });
});

describe('requestGoogleCredential', () => {
  function googleModule(signIn: jest.Mock) {
    const GoogleSignin = {
      configure: jest.fn(),
      hasPlayServices: jest.fn(() => Promise.resolve(true)),
      signIn,
      signOut: jest.fn(() => Promise.resolve(null)),
    };
    const module = {
      GoogleSignin,
      statusCodes: { SIGN_IN_CANCELLED: 'CANCELLED', IN_PROGRESS: 'IN_PROGRESS' },
    } as unknown as GoogleSignIn;
    return { module, GoogleSignin };
  }

  it('configures the client ids, returns only the ID token (no nonce) and signs the Google session out', async () => {
    const { module, GoogleSignin } = googleModule(
      jest.fn(() => Promise.resolve({ type: 'success', data: { idToken: 'google.id.token' } })),
    );
    const payload = await requestGoogleCredential(
      module,
      { iosClientId: 'ios-id', webClientId: 'web-id' },
      'ios',
    );
    expect(payload).toEqual({ provider: 'GOOGLE', idToken: 'google.id.token' });
    expect(GoogleSignin.configure).toHaveBeenCalledWith({
      scopes: ['email', 'profile'],
      iosClientId: 'ios-id',
      webClientId: 'web-id',
    });
    expect(GoogleSignin.hasPlayServices).not.toHaveBeenCalled();
    expect(GoogleSignin.signOut).toHaveBeenCalled();
  });

  it('checks Play Services on Android', async () => {
    const { module, GoogleSignin } = googleModule(
      jest.fn(() => Promise.resolve({ type: 'success', data: { idToken: 'g.t.t' } })),
    );
    await requestGoogleCredential(module, { webClientId: 'web-id' }, 'android');
    expect(GoogleSignin.hasPlayServices).toHaveBeenCalledWith({
      showPlayServicesUpdateDialog: true,
    });
  });

  it('cancel (response or status code) is silent; a token-less success is an SDK error', async () => {
    await expect(
      requestGoogleCredential(
        googleModule(jest.fn(() => Promise.resolve({ type: 'cancelled', data: null }))).module,
        { webClientId: 'w' },
        'android',
      ),
    ).rejects.toBeInstanceOf(SocialCancelledError);
    await expect(
      requestGoogleCredential(
        googleModule(
          jest.fn(() => Promise.reject(Object.assign(new Error('x'), { code: 'CANCELLED' }))),
        ).module,
        { webClientId: 'w' },
        'android',
      ),
    ).rejects.toBeInstanceOf(SocialCancelledError);
    await expect(
      requestGoogleCredential(
        googleModule(jest.fn(() => Promise.resolve({ type: 'success', data: { idToken: null } })))
          .module,
        { webClientId: 'w' },
        'android',
      ),
    ).rejects.toBeInstanceOf(SocialSdkError);
  });
});

describe('socialErrorMessage', () => {
  it('says nothing for a cancel', () => {
    expect(socialErrorMessage(new SocialCancelledError())).toBeNull();
  });

  it('maps UNAUTHORIZED to "couldn’t verify", never to a session-expired line', () => {
    const unauthorized = Object.assign(new Error('You must be logged in'), {
      data: { code: 'UNAUTHORIZED', httpStatus: 401 },
    });
    expect(socialErrorMessage(unauthorized)).toBe(SOCIAL_AUTH_MESSAGES.invalidToken);
  });

  it('passes deliberate server messages through and hides transport noise', () => {
    const conflict = Object.assign(new Error(SOCIAL_AUTH_MESSAGES.identityTaken), {
      data: { code: 'CONFLICT' },
    });
    expect(socialErrorMessage(conflict)).toBe(SOCIAL_AUTH_MESSAGES.identityTaken);
    expect(socialErrorMessage(new TypeError('Network request failed'))).toMatch(
      /Can't reach Chefer/,
    );
    expect(socialErrorMessage(new SocialSdkError('x'))).toMatch(/couldn’t finish signing in/);
  });
});
