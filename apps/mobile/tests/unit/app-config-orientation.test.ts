/* eslint-disable @typescript-eslint/no-require-imports -- app.config.js is plain CJS read fresh per variant */

// 1.0.2: no orientation lock in the Android manifest (Play / Android 16 large
// screens), iPhone keeps a portrait Info.plist, phones start portrait.

type Plugin = string | [string, unknown] | ((c: unknown) => unknown);
type LoadedConfig = {
  orientation?: string;
  ios: { supportsTablet?: boolean; infoPlist?: { UISupportedInterfaceOrientations?: string[] } };
  plugins: Plugin[];
};

const ENV_KEYS = ['APP_VARIANT', 'EXPO_PUBLIC_API_URL'] as const;
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

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
});

describe.each([
  ['production', { APP_VARIANT: 'production', EXPO_PUBLIC_API_URL: 'https://chefer.duckdns.org' }],
  ['development', {}],
])('app.config.js orientation (%s)', (_variant, env) => {
  it('does not lock orientation in the manifest', () => {
    expect(loadConfig(env).orientation).toBe('default');
  });

  it('keeps iPhone portrait in Info.plist (iPhone-only app)', () => {
    const { ios } = loadConfig(env);
    expect(ios.supportsTablet).toBe(false);
    expect(ios.infoPlist?.UISupportedInterfaceOrientations).toEqual([
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationPortraitUpsideDown',
    ]);
  });

  it('starts phones in portrait natively (MainActivity plugin)', () => {
    const named = loadConfig(env).plugins.filter(
      (p): p is (c: unknown) => unknown =>
        typeof p === 'function' && p.name === 'withPhonePortraitAtLaunch',
    );
    expect(named).toHaveLength(1);
  });
});
