/* eslint-disable @typescript-eslint/no-require-imports -- each case loads the module fresh under its own env */

// M1-6: Sentry must stay fully inert unless this is a production build with a
// DSN, and must never send query strings or anything but the account id.

const mockInit = jest.fn<undefined, unknown[]>();
const mockCapture = jest.fn<undefined, unknown[]>();
const mockSetUser = jest.fn<undefined, unknown[]>();
jest.mock('@sentry/react-native', () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureException: (...args: unknown[]) => mockCapture(...args),
  setUser: (...args: unknown[]) => mockSetUser(...args),
}));

let mockVariant: string | undefined;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { appVariant: mockVariant } };
    },
  },
}));

let mockDsn: string | undefined;
jest.mock('../../src/lib/env', () => ({
  get env() {
    return { EXPO_PUBLIC_SENTRY_DSN: mockDsn };
  },
}));

type CrashReporting = typeof import('../../src/lib/crash-reporting');
const DSN = 'https://abc@o1.ingest.de.sentry.io/2';

function load(): CrashReporting {
  let mod: CrashReporting | undefined;
  jest.isolateModules(() => {
    mod = require('../../src/lib/crash-reporting') as CrashReporting;
  });
  if (!mod) throw new Error('crash-reporting did not load');
  return mod;
}

const g = globalThis as { __DEV__?: boolean };
const savedDev = g.__DEV__;

beforeEach(() => {
  mockInit.mockReset();
  mockCapture.mockReset();
  mockSetUser.mockReset();
  mockVariant = 'production';
  mockDsn = DSN;
  g.__DEV__ = false;
});
afterAll(() => {
  g.__DEV__ = savedDev;
});

describe('shouldEnableCrashReporting', () => {
  const { shouldEnableCrashReporting } = load();
  it.each([
    [{ dsn: DSN, variant: 'production', isDev: false }, true],
    [{ dsn: undefined, variant: 'production', isDev: false }, false],
    [{ dsn: '', variant: 'production', isDev: false }, false],
    [{ dsn: DSN, variant: 'development', isDev: false }, false],
    [{ dsn: DSN, variant: undefined, isDev: false }, false],
    [{ dsn: DSN, variant: 'production', isDev: true }, false],
  ])('%j → %s', (gate, expected) => {
    expect(shouldEnableCrashReporting(gate)).toBe(expected);
  });
});

describe('initCrashReporting', () => {
  it('initialises a production build with a DSN: no PII, no tracing, no replay', () => {
    const cr = load();
    cr.initCrashReporting();
    cr.initCrashReporting();
    expect(mockInit).toHaveBeenCalledTimes(1);
    const options = mockInit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toMatchObject({
      dsn: DSN,
      environment: 'production',
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
    });
    for (const key of [
      'tracesSampleRate',
      'tracesSampler',
      'profilesSampleRate',
      'replaysSessionSampleRate',
      'replaysOnErrorSampleRate',
    ]) {
      expect(options).not.toHaveProperty(key);
    }
  });

  it.each([
    ['no DSN', () => (mockDsn = undefined)],
    ['the development variant', () => (mockVariant = 'development')],
    ['__DEV__', () => (g.__DEV__ = true)],
  ])('stays inert with %s — every helper is a no-op', (_label, arrange) => {
    arrange();
    const cr = load();
    cr.initCrashReporting();
    cr.reportError(new Error('boom'), 'test');
    cr.setCrashReportingUser('user-1');
    expect(mockInit).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it('reports errors and tags only the account id once enabled', () => {
    const cr = load();
    cr.initCrashReporting();
    const error = new Error('boom');
    cr.reportError(error, 'root-error-boundary');
    expect(mockCapture).toHaveBeenCalledWith(error, { tags: { source: 'root-error-boundary' } });
    cr.setCrashReportingUser('user-1');
    expect(mockSetUser).toHaveBeenLastCalledWith({ id: 'user-1' });
    cr.setCrashReportingUser(null);
    expect(mockSetUser).toHaveBeenLastCalledWith(null);
  });
});

describe('breadcrumb scrubbing', () => {
  const { scrubBreadcrumb, stripQuery } = load();

  it('drops query strings and fragments', () => {
    expect(stripQuery('https://x.dev/trpc/a,b?batch=1&input=%7B%7D')).toBe(
      'https://x.dev/trpc/a,b',
    );
    expect(stripQuery('https://x.dev/p#frag')).toBe('https://x.dev/p');
    expect(stripQuery('https://x.dev/p')).toBe('https://x.dev/p');
  });

  it('strips the query from fetch/xhr breadcrumbs only', () => {
    const url = 'https://x.dev/trpc/recipe.search?input=%7B%22q%22%3A%22eggs%22%7D';
    expect(
      scrubBreadcrumb({ category: 'fetch', data: { url, method: 'GET', status_code: 200 } }),
    ).toEqual({
      category: 'fetch',
      data: { url: 'https://x.dev/trpc/recipe.search', method: 'GET', status_code: 200 },
    });
    expect(scrubBreadcrumb({ category: 'xhr', data: { url } }).data?.url).toBe(
      'https://x.dev/trpc/recipe.search',
    );
    const console = { category: 'console', message: 'hello', data: { url } };
    expect(scrubBreadcrumb(console)).toBe(console);
  });
});

describe('env — EXPO_PUBLIC_SENTRY_DSN', () => {
  const saved = process.env.EXPO_PUBLIC_SENTRY_DSN;
  afterEach(() => {
    if (saved === undefined) Reflect.deleteProperty(process.env, 'EXPO_PUBLIC_SENTRY_DSN');
    else process.env.EXPO_PUBLIC_SENTRY_DSN = saved;
  });

  function loadEnv(value: string | undefined): string | undefined {
    if (value === undefined) Reflect.deleteProperty(process.env, 'EXPO_PUBLIC_SENTRY_DSN');
    else process.env.EXPO_PUBLIC_SENTRY_DSN = value;
    let loaded: typeof import('../../src/lib/env') | undefined;
    jest.isolateModules(() => {
      loaded = jest.requireActual<typeof import('../../src/lib/env')>('../../src/lib/env');
    });
    if (!loaded) throw new Error('env did not load');
    return loaded.env.EXPO_PUBLIC_SENTRY_DSN;
  }

  it('keeps a valid DSN', () => {
    expect(loadEnv(DSN)).toBe(DSN);
  });

  // An empty CI variable or a typo must turn crash reporting off, not crash
  // every installed app at startup.
  it.each([[undefined], [''], ['not a url']])('%j → off, without throwing', (value) => {
    expect(loadEnv(value)).toBeUndefined();
  });
});
