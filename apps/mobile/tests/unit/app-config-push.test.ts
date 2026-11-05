/* eslint-disable @typescript-eslint/no-require-imports -- app.config.js is plain CJS read fresh per env */
import fs from 'node:fs';

// Trainer mode M4 (docs/prd-2026-10/trainer-mode.md §7.2 "Native"): the push entitlement is no
// longer stripped (team 45TS85YK89 is paid) and Android gets google-services.json for FCM — from
// the EAS file env var GOOGLE_SERVICES_JSON, else ./google-services.json when that file exists,
// else nothing (a local dev build without the file still works; the app keeps local reminders).

const ENV_KEYS = ['APP_VARIANT', 'EXPO_PUBLIC_API_URL', 'GOOGLE_SERVICES_JSON'] as const;
type EnvKey = (typeof ENV_KEYS)[number];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

type Config = {
  plugins: unknown[];
  android: { googleServicesFile?: string };
  ios: { entitlements?: Record<string, unknown> };
};

function loadConfig(env: Partial<Record<EnvKey, string>>): Config {
  for (const key of ENV_KEYS) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, env);
  let config: Config | undefined;
  jest.isolateModules(() => {
    config = require('../../app.config.js') as Config;
  });
  if (!config) throw new Error('app.config.js did not load');
  return config;
}

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
});

const PROD = { APP_VARIANT: 'production', EXPO_PUBLIC_API_URL: 'https://chefer.duckdns.org' };

describe('app.config.js — push (M4)', () => {
  it.each([
    ['production', PROD],
    ['development', {}],
  ])(
    '%s: no plugin strips aps-environment any more; expo-notifications keeps literal args',
    (_v, env) => {
      const config = loadConfig(env);
      const inline = config.plugins.filter(
        (p): p is (...a: unknown[]) => unknown => typeof p === 'function',
      );
      expect(inline.map((fn) => fn.name)).not.toContain('withoutPushEntitlement');
      expect(config.plugins).toContainEqual(['expo-notifications', { color: '#944a00' }]);
      expect(config.ios.entitlements?.['aps-environment']).toBeUndefined(); // added by the plugin, not removed
      expect(fs.readFileSync(require.resolve('../../app.config.js'), 'utf8')).not.toMatch(
        /delete [^\n]*aps-environment/,
      );
    },
  );

  it('android.googleServicesFile comes from the EAS file env var when given', () => {
    const config = loadConfig({
      ...PROD,
      GOOGLE_SERVICES_JSON: '/eas/secrets/google-services.json',
    });
    expect(config.android.googleServicesFile).toBe('/eas/secrets/google-services.json');
  });

  it('falls back to ./google-services.json only when that file exists', () => {
    const real = fs.existsSync;
    const exists = jest
      .spyOn(fs, 'existsSync')
      .mockImplementation((p) => (String(p).endsWith('google-services.json') ? true : real(p)));
    expect(loadConfig(PROD).android.googleServicesFile).toBe('./google-services.json');
    exists.mockImplementation((p) =>
      String(p).endsWith('google-services.json') ? false : real(p),
    );
    expect(loadConfig(PROD).android).not.toHaveProperty('googleServicesFile');
  });
});
