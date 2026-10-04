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
    // §2.8/T-00.8: declares this client understands the health-consent error
    // and reads `profile.flags`. Bumped to 2 for T-39.1/T-26.5 (wave 1
    // L-ENTRY): level 2 is the first to render the sign-up consent
    // checkboxes, so `AuthService.register` only requires the consent
    // fields from level >= 2 — a wave-0 client already out on OTA (which
    // sends level 1, no checkboxes) keeps registering exactly as before.
    // Bumped to 3 for T-42.3 (this commit ships the cardio entry UI that
    // reads it — Δ2.1, orchestrator decision 2026-09-28: cardio moved off
    // level 2 because wave 1 already claimed it, see client-level.ts).
    // Bumped to 4 for T-26.2/T-26.3 (wave 3 L-CONSENT): level 4 is the first to
    // show the HealthDataConsentSheet before any health save, so
    // HEALTH_CONSENT_ENFORCE=declared may reject an un-consented health write
    // from it (installed binaries at <= 3 never are). Same number as
    // HEALTH_CONSENT_API_LEVEL (@chefer/types) — the shared counter's next
    // unclaimed value (gym W5's intervals must take 5, see client-level.ts).
    'x-chefer-api-level': '4',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

// Expected, handled failures: offline / API unreachable (the gym layer is
// offline-first; food screens show their own error states) and expired
// sessions (auto sign-out). Logged at `log`, not `error`: console.error raises
// the dev-build LogBox toast, which covered the tab bar (dogfood #7).
const EXPECTED_FAILURE =
  /fetch failed|Network request failed|Could not connect|Failed to connect|timed out|UNAUTHORIZED/i;

// bug B-17: a bad import URL / a page over the size cap / "no recipe found"
// are all EXPECTED user-input outcomes on these two procedures (the form
// shows its own inline error) — they used to raise the same red LogBox as a
// real bug. `BAD_REQUEST` and `PRECONDITION_FAILED` (the "page too large"
// case included) from `recipe.importPreview` / `recipe.importVideoPreview`
// are logged quietly instead. tRPC's default error shape carries `path` and
// `code` on `TRPCClientError.data` — that's what's checked, not the
// logger's already-formatted display string.
const EXPECTED_IMPORT_PATHS = new Set(['recipe.importPreview', 'recipe.importVideoPreview']);
const EXPECTED_IMPORT_CODES = new Set(['BAD_REQUEST', 'PRECONDITION_FAILED']);

function isExpectedImportFailure(result: unknown): boolean {
  if (!(result instanceof Error)) return false;
  const data = (result as { data?: { code?: unknown; path?: unknown } }).data;
  const path = typeof data?.path === 'string' ? data.path : undefined;
  const code = typeof data?.code === 'string' ? data.code : undefined;
  return Boolean(
    path && EXPECTED_IMPORT_PATHS.has(path) && code && EXPECTED_IMPORT_CODES.has(code),
  );
}

// A signed-out or expired session is expected, not a bug: the server's
// UNAUTHORIZED message ("You must be logged in…") doesn't contain the code,
// so it is read from `data.code`. Logged as an error it raised a red LogBox
// whose badge covered the tab bar in dev builds.
function isUnauthorized(result: unknown): boolean {
  if (!(result instanceof Error)) return false;
  return (result as { data?: { code?: unknown } }).data?.code === 'UNAUTHORIZED';
}

function isExpectedError(error: Error): boolean {
  return (
    EXPECTED_FAILURE.test(error.message) || isExpectedImportFailure(error) || isUnauthorized(error)
  );
}

export function isExpectedFailure(args: unknown[]): boolean {
  return args.some((arg) => {
    if (arg instanceof Error) {
      return isExpectedError(arg);
    }
    if (arg && typeof arg === 'object' && 'result' in arg) {
      const { result } = arg;
      return result instanceof Error && isExpectedError(result);
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
  // WP-22: provider credentials (auth.socialSignIn / linkIdentity / deleteSelf reauth).
  'idtoken',
  'authorizationcode',
  'nonce',
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
