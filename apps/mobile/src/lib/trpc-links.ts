// Platform-free tRPC link construction — no react-native imports, so the
// contract tests (Node) exercise the exact link stack the app ships.
import { httpBatchLink, loggerLink } from '@trpc/client';
import superjson from 'superjson';

export interface TrpcLinkOptions {
  /** Full tRPC endpoint URL, e.g. http://localhost:3001/trpc */
  url: string;
  /** Returns the current session token, or null when signed out. */
  getToken: () => string | null;
  /** Console logging of requests (dev only). */
  enableLogger?: boolean;
}

/** Headers sent with every API request from the app. */
export function buildAuthHeaders(getToken: () => string | null): Record<string, string> {
  const token = getToken();
  return {
    'x-chefer-client': 'mobile',
    'x-trpc-source': 'mobile-react',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

// Expected, handled failures: offline / API unreachable (the gym layer is
// offline-first; food screens show their own error states) and expired
// sessions (auto sign-out). Logged at `log`, not `error`: console.error raises
// the dev-build LogBox toast, which covered the tab bar (dogfood #7).
const EXPECTED_FAILURE =
  /fetch failed|Network request failed|Could not connect|Failed to connect|timed out|UNAUTHORIZED/i;

export function isExpectedFailure(args: unknown[]): boolean {
  return args.some((arg) => {
    if (arg instanceof Error) return EXPECTED_FAILURE.test(arg.message);
    if (arg && typeof arg === 'object' && 'result' in arg) {
      const { result } = arg;
      return result instanceof Error && EXPECTED_FAILURE.test(result.message);
    }
    return typeof arg === 'string' && EXPECTED_FAILURE.test(arg);
  });
}

// F-M-AUTH-2-2: dev builds log every request's input and result — which
// included plaintext passwords (login/register/reset inputs) and session
// tokens (login/register results). Values under these keys are masked, at
// any depth, before anything reaches the console. Lowercase: matched
// case-insensitively.
const SECRET_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
]);

export const REDACTED = '[redacted]';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep copy of `value` with every secret-keyed value replaced by
 * `[redacted]`. Only plain objects and arrays are walked — Errors, Dates and
 * other instances pass through untouched (`isExpectedFailure` relies on
 * `result instanceof Error`). The input is never mutated.
 */
export function redactSecrets(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (Array.isArray(value)) {
    const cached = seen.get(value);
    if (cached) return cached;
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(redactSecrets(item, seen));
    return copy;
  }
  if (!isPlainObject(value)) return value;
  const cached = seen.get(value);
  if (cached) return cached;
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, entry] of Object.entries(value)) {
    copy[key] = SECRET_KEYS.has(key.toLowerCase()) ? REDACTED : redactSecrets(entry, seen);
  }
  return copy;
}

export function buildTrpcLinks({ url, getToken, enableLogger = false }: TrpcLinkOptions) {
  return [
    loggerLink({
      enabled: (opts) =>
        enableLogger || (opts.direction === 'down' && opts.result instanceof Error),
      /* eslint-disable no-console -- deliberate: expected failures go to the
         plain log (Metro) instead of error, which raises the LogBox toast. */
      console: {
        log: (...args: unknown[]) => console.log(...args.map((arg) => redactSecrets(arg))),
        error: (...args: unknown[]) => {
          const safe = args.map((arg) => redactSecrets(arg));
          if (isExpectedFailure(args)) console.log(...safe);
          else console.error(...safe);
        },
      },
      /* eslint-enable no-console */
    }),
    httpBatchLink({
      transformer: superjson,
      url,
      headers: () => buildAuthHeaders(getToken),
    }),
  ];
}
