/* eslint-disable @typescript-eslint/no-require-imports -- app.config.js is plain CJS read fresh per env */

// M1-6: the Sentry config plugin's arguments are part of the native runtime
// fingerprint. They must be literals, so a store binary built with Sentry
// credentials and a CI OTA publish without them (or the other way round)
// resolve to the same runtime.

const ENV_KEYS = [
  'APP_VARIANT',
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_URL',
  'SENTRY_DISABLE_AUTO_UPLOAD',
] as const;
type EnvKey = (typeof ENV_KEYS)[number];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function loadConfig(env: Partial<Record<EnvKey, string>>): Record<string, unknown> {
  for (const key of ENV_KEYS) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, env);
  let config: Record<string, unknown> | undefined;
  jest.isolateModules(() => {
    config = require('../../app.config.js') as Record<string, unknown>;
  });
  if (!config) throw new Error('app.config.js did not load');
  // Functions (inline plugins) don't survive JSON — fine for a value diff.
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
});

const PROD = { APP_VARIANT: 'production', EXPO_PUBLIC_API_URL: 'https://chefer.duckdns.org' };
const SENTRY_ENV = {
  EXPO_PUBLIC_SENTRY_DSN: 'https://abc@o1.ingest.de.sentry.io/2',
  SENTRY_AUTH_TOKEN: 'sntrys_secret',
  SENTRY_ORG: 'someone-else',
  SENTRY_PROJECT: 'other',
  SENTRY_URL: 'https://sentry.example/',
  SENTRY_DISABLE_AUTO_UPLOAD: 'true',
};

describe('app.config.js — Sentry plugin', () => {
  it('registers @sentry/react-native/expo with literal org, project and region', () => {
    const plugins = loadConfig(PROD).plugins as unknown[];
    expect(plugins).toContainEqual([
      '@sentry/react-native/expo',
      { url: 'https://de.sentry.io/', organization: 'chefer', project: 'chefer-mobile' },
    ]);
  });

  it.each([
    ['production', PROD],
    ['development', {}],
  ])(
    'the %s config is identical with and without Sentry env (no token in the config)',
    (_variant, base) => {
      const without = loadConfig(base);
      const withSentry = loadConfig({ ...base, ...SENTRY_ENV });
      expect(withSentry).toEqual(without);
      expect(JSON.stringify(withSentry)).not.toContain('sntrys_secret');
    },
  );
});
