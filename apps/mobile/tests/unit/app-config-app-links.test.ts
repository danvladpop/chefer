/* eslint-disable @typescript-eslint/no-require-imports -- app.config.js is plain CJS read fresh per env */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractExpoPathFromURL } from 'expo-router/build/fork/extractPathFromURL';

// Coaching invite links (https://<domain>/coaching/join/<code>, QR codes too) open the app:
// iOS universal links (`applinks:`) and Android App Links (autoVerify intent filter), production only.

type IntentFilter = {
  action: string;
  autoVerify?: boolean;
  data: { scheme: string; host: string; pathPrefix: string }[];
  category: string[];
};
type LoadedConfig = {
  ios: { associatedDomains?: string[] };
  android: { intentFilters?: IntentFilter[] };
};

const ENV_KEYS = ['APP_VARIANT', 'EXPO_PUBLIC_API_URL', 'ENABLE_APPLE_SIGN_IN'] as const;
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

const PROD = { APP_VARIANT: 'production', EXPO_PUBLIC_API_URL: 'https://chefer.duckdns.org' };

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
});

describe('app.config.js — coaching invite app links', () => {
  it('production: applinks next to webcredentials, both on the API host', () => {
    expect(loadConfig(PROD).ios.associatedDomains).toEqual([
      'webcredentials:chefer.duckdns.org',
      'applinks:chefer.duckdns.org',
    ]);
  });

  it('production: one verified https intent filter for /coaching/join/ on the API host', () => {
    expect(loadConfig(PROD).android.intentFilters).toEqual([
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'chefer.duckdns.org', pathPrefix: '/coaching/join/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ]);
  });

  it('the domain follows EXPO_PUBLIC_API_URL (a domain switch is that one value)', () => {
    const config = loadConfig({ ...PROD, EXPO_PUBLIC_API_URL: 'https://app.chefer.example/' });
    expect(config.ios.associatedDomains).toContain('applinks:app.chefer.example');
    expect(config.android.intentFilters?.[0]?.data[0]?.host).toBe('app.chefer.example');
  });

  it('the development variant claims no links (its ids are not in the association files)', () => {
    for (const env of [{ APP_VARIANT: 'development' }, { ENABLE_APPLE_SIGN_IN: '1' }]) {
      const config = loadConfig(env);
      expect(config.ios.associatedDomains ?? []).not.toContainEqual(
        expect.stringMatching(/^applinks:/),
      );
      expect(config.android.intentFilters).toBeUndefined();
    }
  });
});

describe('expo-router: an invite link lands on the join route', () => {
  // The same function turns both the cold-start URL (useStore) and a link received while running
  // (useLinking) into a route path — so the https link behaves exactly like `chefer://`.
  it.each(['https://chefer.duckdns.org/coaching/join/AbC-123', 'chefer://coaching/join/AbC-123'])(
    '%s -> coaching/join/AbC-123',
    (url) => {
      expect(extractExpoPathFromURL([], url)).toBe('coaching/join/AbC-123');
    },
  );

  it('the route file exists', () => {
    expect(existsSync(join(__dirname, '../../app/coaching/join/[code].tsx'))).toBe(true);
  });
});
