/* eslint-disable @typescript-eslint/no-require-imports -- fresh module instances after jest.doMock */
// WP-22: a binary without the native sign-in modules (an old dev client, a
// 1.0.1 store build) must never crash the JS bundle — the loaders turn "module
// missing" into null, which hides the buttons.

describe('loadNativeSignInModules', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-apple-authentication');
    jest.dontMock('@react-native-google-signin/google-signin');
  });

  function load() {
    const mod =
      require('../../src/features/auth/social/native-modules') as typeof import('../../src/features/auth/social/native-modules');
    mod.resetNativeSignInModules();
    return mod.loadNativeSignInModules();
  }

  it('returns null for both when importing them throws', async () => {
    jest.doMock('expo-apple-authentication', () => {
      throw new Error('Cannot find native module ExpoAppleAuthentication');
    });
    jest.doMock('@react-native-google-signin/google-signin', () => {
      throw new Error("TurboModuleRegistry.getEnforcing(...): 'RNGoogleSignin' could not be found");
    });
    await expect(load()).resolves.toEqual({ apple: null, google: null });
  });

  it('returns null for Apple when the OS reports it unavailable, and keeps a working Google', async () => {
    jest.doMock('expo-apple-authentication', () => ({
      isAvailableAsync: () => Promise.resolve(false),
    }));
    jest.doMock('@react-native-google-signin/google-signin', () => ({
      GoogleSignin: {},
      statusCodes: {},
    }));
    const result = await load();
    expect(result.apple).toBeNull();
    expect(result.google).not.toBeNull();
  });

  it('returns Apple when the module loads and the OS supports it', async () => {
    jest.doMock('expo-apple-authentication', () => ({
      isAvailableAsync: () => Promise.resolve(true),
    }));
    jest.doMock('@react-native-google-signin/google-signin', () => {
      throw new Error('missing');
    });
    const result = await load();
    expect(result.apple).not.toBeNull();
    expect(result.google).toBeNull();
  });
});
