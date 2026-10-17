import { createHash } from 'node:crypto';
import { Platform, Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  CURRENT_TERMS_VERSION,
  SOCIAL_AUTH_MESSAGES,
  type SocialAvailability,
} from '@chefer/types';
import {
  clearPendingOnboarding,
  isOnboardingPending,
} from '../../src/features/auth/pending-onboarding';
import { isSessionExpired, markSessionExpired } from '../../src/features/auth/session-expired';
import type { NativeSignInModules } from '../../src/features/auth/social/native-modules';
import { resetNativeSignInModules } from '../../src/features/auth/social/native-modules';
import { SocialSignIn } from '../../src/features/auth/social/social-sign-in';

// WP-22: the Continue with Apple / Google block on Welcome / Sign in / Create
// account — gating, payloads, cancel, error mapping and session handling.

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
let mockBuild = { apple: true, googleIos: true };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { socialSignIn: mockBuild } };
    },
  },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@chefer/utils', () => ({
  ...jest.requireActual<typeof import('@chefer/utils')>('@chefer/utils'),
  detectRegion: () => 'GB',
}));

let mockAvailability: SocialAvailability | undefined;
let mockMutationOptions:
  | {
      onSuccess?: (data: unknown) => Promise<void>;
      onError?: (error: unknown) => void;
      onSettled?: () => void;
    }
  | undefined;
const mockMutate = jest.fn((_payload: Record<string, unknown>) => undefined);
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    auth: {
      socialAvailability: { useQuery: () => ({ data: mockAvailability }) },
      socialSignIn: {
        useMutation: (options: typeof mockMutationOptions) => {
          mockMutationOptions = options;
          return { mutate: mockMutate, isPending: false };
        },
      },
    },
  },
}));

const mockSetToken = jest.fn((_token: string) => {
  // What the auth gate sees at the moment the token flips.
  mockPendingAtSetToken.push(isOnboardingPending());
  return Promise.resolve();
});
const mockPendingAtSetToken: boolean[] = [];
jest.mock('../../src/lib/auth-store', () => ({
  setToken: (token: string) => mockSetToken(token),
}));
const mockSignOut = jest.fn();
jest.mock('../../src/lib/sign-out', () => ({
  signOut: (): void => {
    mockSignOut();
  },
}));

// ─── Native module fakes ─────────────────────────────────────────────────────
const mockAppleSignIn = jest.fn((_options: { nonce: string }) =>
  Promise.resolve<unknown>(undefined),
);
function FakeAppleButton({ onPress, testID }: { onPress: () => void; testID?: string }) {
  return <Pressable testID={testID} onPress={onPress} />;
}
const mockGoogleSignIn = jest.fn();
const mockGoogleSignOut = jest.fn(() => Promise.resolve(null));
const mockGoogleConfigure = jest.fn();
let mockNative: NativeSignInModules = { apple: null, google: null };
function installNative(
  parts: { apple?: boolean; google?: boolean } = { apple: true, google: true },
) {
  mockNative = {
    apple: parts.apple
      ? ({
          signInAsync: mockAppleSignIn,
          AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
          AppleAuthenticationButtonType: { CONTINUE: 1 },
          AppleAuthenticationButtonStyle: { BLACK: 2 },
          AppleAuthenticationButton: FakeAppleButton,
        } as unknown as NativeSignInModules['apple'])
      : null,
    google: parts.google
      ? ({
          GoogleSignin: {
            configure: mockGoogleConfigure,
            hasPlayServices: jest.fn(() => Promise.resolve(true)),
            signIn: mockGoogleSignIn,
            signOut: mockGoogleSignOut,
          },
          statusCodes: { SIGN_IN_CANCELLED: 'CANCELLED', IN_PROGRESS: 'IN_PROGRESS' },
        } as unknown as NativeSignInModules['google'])
      : null,
  };
}
jest.mock('../../src/features/auth/social/native-modules', () => ({
  loadNativeSignInModules: () => Promise.resolve(mockNative),
  resetNativeSignInModules: jest.fn(),
}));

const ENABLED: SocialAvailability = {
  google: {
    enabled: true,
    webClientId: 'web.apps.googleusercontent.com',
    iosClientId: 'ios.apps.googleusercontent.com',
    androidClientId: 'android.apps.googleusercontent.com',
  },
  apple: {
    enabled: true,
    servicesId: 'dev.chefer.web',
    bundleId: 'com.popdan.chefer',
    redirectUri: 'https://chefer.example/login',
  },
};

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

async function renderBlock() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SocialSignIn />
    </SafeAreaProvider>,
  );
  // Let the native-module probe settle.
  await act(() => Promise.resolve());
}

const originalOS = Platform.OS;
function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetNativeSignInModules();
  mockAvailability = ENABLED;
  mockBuild = { apple: true, googleIos: true };
  installNative();
  setPlatform('ios');
  mockPendingAtSetToken.length = 0;
  clearPendingOnboarding();
  mockAppleSignIn.mockResolvedValue({
    identityToken: 'apple.identity.token',
    authorizationCode: 'apple-auth-code',
    fullName: { givenName: 'Ada', familyName: 'Lovelace' },
  });
  mockGoogleSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'google.id.token' } });
});
afterAll(() => setPlatform(originalOS as 'ios' | 'android'));

describe('availability gating', () => {
  it('shows Apple, Google and the consent line on iOS when everything is in place', async () => {
    await renderBlock();
    expect(screen.getByTestId('social-apple')).toBeTruthy();
    expect(screen.getByTestId('social-google')).toBeTruthy();
    expect(screen.getByTestId('social-consent')).toHaveTextContent(
      'By continuing you agree to the Terms and Privacy Policy and confirm you are 16 or older.',
    );
  });

  it('never shows Apple on Android', async () => {
    setPlatform('android');
    await renderBlock();
    expect(screen.queryByTestId('social-apple')).toBeNull();
    expect(screen.getByTestId('social-google')).toBeTruthy();
  });

  it('renders nothing while the server has not answered, or when it is not configured', async () => {
    mockAvailability = undefined;
    await renderBlock();
    expect(screen.queryByTestId('social-sign-in')).toBeNull();
  });

  it('hides a disabled provider', async () => {
    mockAvailability = {
      ...ENABLED,
      apple: { ...ENABLED.apple, enabled: false },
    };
    await renderBlock();
    expect(screen.queryByTestId('social-apple')).toBeNull();
    expect(screen.getByTestId('social-google')).toBeTruthy();
  });

  it('shows nothing at all on a binary without the native modules', async () => {
    installNative({ apple: false, google: false });
    await renderBlock();
    expect(screen.queryByTestId('social-sign-in')).toBeNull();
  });

  it('hides Apple in a build without the entitlement (dev variant)', async () => {
    mockBuild = { apple: false, googleIos: true };
    await renderBlock();
    expect(screen.queryByTestId('social-apple')).toBeNull();
  });
});

describe('Apple', () => {
  it('sends the identity token, RAW nonce (provider got its SHA-256), code, name and consent', async () => {
    await renderBlock();
    await fireEvent.press(screen.getByTestId('social-apple'));
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

    const payload = mockMutate.mock.calls[0]?.[0] ?? {};
    expect(payload).toMatchObject({
      provider: 'APPLE',
      idToken: 'apple.identity.token',
      authorizationCode: 'apple-auth-code',
      givenName: 'Ada',
      familyName: 'Lovelace',
      acceptLegal: true,
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      region: 'GB',
    });
    const raw = payload.nonce as string;
    expect(raw.length).toBeGreaterThanOrEqual(16);
    const asked = mockAppleSignIn.mock.calls[0]?.[0];
    const expected = createHash('sha256').update(raw).digest('hex');
    expect(asked?.nonce).toBe(expected);
  });

  it('leaves the name out when Apple does not send it', async () => {
    mockAppleSignIn.mockResolvedValue({
      identityToken: 'apple.identity.token',
      authorizationCode: 'c',
      fullName: null,
    });
    await renderBlock();
    await fireEvent.press(screen.getByTestId('social-apple'));
    await waitFor(() => expect(mockMutate).toHaveBeenCalled());
    const payload = mockMutate.mock.calls[0]?.[0] ?? {};
    expect(payload).not.toHaveProperty('givenName');
    expect(payload).not.toHaveProperty('familyName');
  });

  it('cancelling the Apple sheet is silent: no request, no error line', async () => {
    mockAppleSignIn.mockRejectedValue(
      Object.assign(new Error('x'), { code: 'ERR_REQUEST_CANCELED' }),
    );
    await renderBlock();
    await fireEvent.press(screen.getByTestId('social-apple'));
    await act(() => Promise.resolve());
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('social-error')).toBeNull();
  });
});

describe('Google', () => {
  it('sends the ID token with consent, no nonce, and signs the Google session out again', async () => {
    await renderBlock();
    await fireEvent.press(screen.getByTestId('social-google'));
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

    expect(mockGoogleConfigure).toHaveBeenCalledWith(
      expect.objectContaining({
        iosClientId: 'ios.apps.googleusercontent.com',
        webClientId: 'web.apps.googleusercontent.com',
      }),
    );
    const payload = mockMutate.mock.calls[0]?.[0] ?? {};
    expect(payload).toMatchObject({
      provider: 'GOOGLE',
      idToken: 'google.id.token',
      acceptLegal: true,
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
    });
    expect(payload).not.toHaveProperty('nonce');
    expect(mockGoogleSignOut).toHaveBeenCalled();
  });

  it('cancelling the Google sheet is silent', async () => {
    mockGoogleSignIn.mockResolvedValue({ type: 'cancelled', data: null });
    await renderBlock();
    await fireEvent.press(screen.getByTestId('social-google'));
    await act(() => Promise.resolve());
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('social-error')).toBeNull();
  });

  it('an SDK failure says so in plain words and sends nothing', async () => {
    mockGoogleSignIn.mockRejectedValue(new Error('DEVELOPER_ERROR'));
    await renderBlock();
    await fireEvent.press(screen.getByTestId('social-google'));
    await waitFor(() => expect(screen.getByTestId('social-error')).toBeTruthy());
    expect(screen.getByTestId('social-error')).toHaveTextContent(/couldn’t finish signing in/);
    expect(mockMutate).not.toHaveBeenCalled();
  });
});

describe('the API answer', () => {
  const session = { token: 'session-token', expires: new Date() };

  it('UNAUTHORIZED reads "couldn’t verify" — it does not sign out or mark the session expired', async () => {
    await renderBlock();
    const unauthorized = Object.assign(new Error('You must be logged in'), {
      data: { code: 'UNAUTHORIZED', httpStatus: 401 },
    });
    await act(async () => {
      mockMutationOptions?.onError?.(unauthorized);
      await Promise.resolve();
    });
    expect(screen.getByTestId('social-error')).toHaveTextContent(SOCIAL_AUTH_MESSAGES.invalidToken);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(isSessionExpired()).toBe(false);
  });

  it('a new user raises onboarding BEFORE the token is stored (R-18b), like registration', async () => {
    await renderBlock();
    await act(
      () =>
        mockMutationOptions?.onSuccess?.({
          session,
          isNewUser: true,
          linkedExistingAccount: false,
        }) ?? Promise.resolve(),
    );
    expect(mockSetToken).toHaveBeenCalledWith('session-token');
    expect(mockPendingAtSetToken).toEqual([true]);
    expect(isOnboardingPending()).toBe(true);
  });

  it('a returning user just gets the token — no onboarding — and the stale notices clear', async () => {
    markSessionExpired();
    await renderBlock();
    await act(
      () =>
        mockMutationOptions?.onSuccess?.({
          session,
          isNewUser: false,
          linkedExistingAccount: true,
        }) ?? Promise.resolve(),
    );
    expect(mockSetToken).toHaveBeenCalledWith('session-token');
    expect(mockPendingAtSetToken).toEqual([false]);
    expect(isOnboardingPending()).toBe(false);
    expect(isSessionExpired()).toBe(false);
  });

  it('a response without a session shows an error instead of hanging', async () => {
    await renderBlock();
    await act(
      () =>
        mockMutationOptions?.onSuccess?.({ isNewUser: false, linkedExistingAccount: false }) ??
        Promise.resolve(),
    );
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(screen.getByTestId('social-error')).toHaveTextContent(/couldn’t start your session/);
  });

  it('removes the new-user flag again when storing the token fails', async () => {
    mockSetToken.mockRejectedValueOnce(new Error('keychain'));
    await renderBlock();
    await expect(
      act(
        () =>
          mockMutationOptions?.onSuccess?.({
            session,
            isNewUser: true,
            linkedExistingAccount: false,
          }) ?? Promise.resolve(),
      ),
    ).rejects.toThrow('keychain');
    expect(isOnboardingPending()).toBe(false);
  });
});
