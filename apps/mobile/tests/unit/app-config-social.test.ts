/* eslint-disable @typescript-eslint/no-require-imports -- app.config.js is plain CJS read fresh per env */

// WP-22: the native config for Sign in with Apple / Google is env-driven and
// must never fail a build when the Google values are missing.

type PluginEntry = string | [string, Record<string, unknown>] | ((c: unknown) => unknown);
type LoadedConfig = {
  ios: { associatedDomains?: string[] };
  plugins: PluginEntry[];
  extra: { socialSignIn: { apple: boolean; googleIos: boolean } };
};

const ENV_KEYS = [
  'APP_VARIANT',
  'EXPO_PUBLIC_API_URL',
  'GOOGLE_IOS_URL_SCHEME',
  'GOOGLE_IOS_CLIENT_ID',
  'ENABLE_APPLE_SIGN_IN',
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function loadConfig(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): LoadedConfig {
  for (const key of ENV_KEYS) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, env);
  let config: LoadedConfig | undefined;
  jest.isolateModules(() => {
    config = require('../../app.config.js') as LoadedConfig;
  });
  if (!config) throw new Error('app.config.js did not load');
  return config;
}

const pluginNames = (c: LoadedConfig) =>
  c.plugins.map((p) => (typeof p === 'string' ? p : Array.isArray(p) ? p[0] : 'inline'));
const googlePlugin = (c: LoadedConfig) =>
  c.plugins.find((p) => Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin');

const PROD = { APP_VARIANT: 'production', EXPO_PUBLIC_API_URL: 'https://chefer.duckdns.org' };

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
  jest.restoreAllMocks();
});

describe('app.config.js — social sign-in native config', () => {
  it('production without any Google env: builds, Apple entitlement + webcredentials on, no Google plugin', () => {
    const config = loadConfig(PROD);
    expect(pluginNames(config)).toContain('expo-apple-authentication');
    expect(googlePlugin(config)).toBeUndefined();
    expect(config.ios.associatedDomains).toEqual(['webcredentials:chefer.duckdns.org']);
    expect(config.extra.socialSignIn).toEqual({ apple: true, googleIos: false });
  });

  it('GOOGLE_IOS_URL_SCHEME registers the Google plugin with the reversed client id', () => {
    const config = loadConfig({
      ...PROD,
      GOOGLE_IOS_URL_SCHEME: 'com.googleusercontent.apps.123-abc',
    });
    expect(googlePlugin(config)).toEqual([
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: 'com.googleusercontent.apps.123-abc' },
    ]);
    expect(config.extra.socialSignIn.googleIos).toBe(true);
  });

  it('derives the URL scheme from GOOGLE_IOS_CLIENT_ID', () => {
    const config = loadConfig({
      ...PROD,
      GOOGLE_IOS_CLIENT_ID: '123-abc.apps.googleusercontent.com',
    });
    expect(googlePlugin(config)).toEqual([
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: 'com.googleusercontent.apps.123-abc' },
    ]);
  });

  it('ignores a malformed value with a warning instead of failing the build', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const config = loadConfig({ ...PROD, GOOGLE_IOS_URL_SCHEME: 'not-a-google-scheme' });
    expect(googlePlugin(config)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('treats empty strings (an unset CI variable) as unset', () => {
    const config = loadConfig({ ...PROD, GOOGLE_IOS_URL_SCHEME: '', GOOGLE_IOS_CLIENT_ID: '' });
    expect(googlePlugin(config)).toBeUndefined();
  });

  it('the development variant has no Apple entitlement and no associated domain', () => {
    const config = loadConfig({ APP_VARIANT: 'development' });
    expect(pluginNames(config)).not.toContain('expo-apple-authentication');
    expect(config.ios.associatedDomains).toBeUndefined();
    expect(config.extra.socialSignIn.apple).toBe(false);
  });

  it('ENABLE_APPLE_SIGN_IN=1 opts a paid-team dev build in (no domain without an https API url)', () => {
    const config = loadConfig({ APP_VARIANT: 'development', ENABLE_APPLE_SIGN_IN: '1' });
    expect(pluginNames(config)).toContain('expo-apple-authentication');
    expect(config.ios.associatedDomains).toBeUndefined();
  });

  it('keeps the push-entitlement stripper first and last', () => {
    const names = pluginNames(loadConfig(PROD));
    expect(names[0]).toBe('inline');
    expect(names[names.length - 1]).toBe('inline');
  });
});
