import { describe, expect, it } from 'vitest';
import { availabilityFromConfig, isProviderEnabled, socialConfigFromEnv } from './social-config.js';

const base = {
  GOOGLE_CLIENT_ID_WEB: undefined,
  GOOGLE_CLIENT_ID_IOS: undefined,
  GOOGLE_CLIENT_ID_ANDROID: undefined,
  APPLE_SERVICES_ID: undefined,
  APPLE_BUNDLE_ID: 'com.popdan.chefer',
  APPLE_TEAM_ID: undefined,
  APPLE_KEY_ID: undefined,
  APPLE_PRIVATE_KEY: undefined,
  APPLE_WEB_REDIRECT_URI: undefined,
  SOCIAL_TOKEN_SECRET: undefined,
  JWT_SECRET: 'j'.repeat(32),
  APP_URL: 'https://chefer.example/',
};

describe('social config', () => {
  it('disables every provider when nothing is configured (the default)', () => {
    const config = socialConfigFromEnv(base);
    expect(isProviderEnabled(config, 'GOOGLE')).toBe(false);
    expect(isProviderEnabled(config, 'APPLE')).toBe(false);
    expect(availabilityFromConfig(config)).toEqual({
      google: { enabled: false, webClientId: null, iosClientId: null, androidClientId: null },
      apple: { enabled: false, servicesId: null, bundleId: null, redirectUri: null },
    });
  });

  it('enables Google as soon as one client id is set', () => {
    const config = socialConfigFromEnv({ ...base, GOOGLE_CLIENT_ID_IOS: 'ios-id' });
    expect(availabilityFromConfig(config).google).toEqual({
      enabled: true,
      webClientId: null,
      iosClientId: 'ios-id',
      androidClientId: null,
    });
  });

  it('enables Apple only with the revoke credentials (Team ID + Key ID + key)', () => {
    const partial = socialConfigFromEnv({ ...base, APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K' });
    expect(isProviderEnabled(partial, 'APPLE')).toBe(false);
    const full = socialConfigFromEnv({
      ...base,
      APPLE_SERVICES_ID: 'dev.chefer.web',
      APPLE_TEAM_ID: 'T',
      APPLE_KEY_ID: 'K',
      APPLE_PRIVATE_KEY: 'PEM',
    });
    expect(availabilityFromConfig(full).apple).toEqual({
      enabled: true,
      servicesId: 'dev.chefer.web',
      bundleId: 'com.popdan.chefer',
      redirectUri: 'https://chefer.example/login',
    });
    expect(full.apple.audiences).toEqual(['com.popdan.chefer', 'dev.chefer.web']);
  });

  it('derives the token secret from JWT_SECRET unless one is set', () => {
    expect(socialConfigFromEnv(base).tokenSecret).toBe('j'.repeat(32));
    expect(socialConfigFromEnv({ ...base, SOCIAL_TOKEN_SECRET: 's'.repeat(40) }).tokenSecret).toBe(
      's'.repeat(40),
    );
  });
});
