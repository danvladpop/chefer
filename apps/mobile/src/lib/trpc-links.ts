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

export function buildTrpcLinks({ url, getToken, enableLogger = false }: TrpcLinkOptions) {
  return [
    loggerLink({
      enabled: (opts) =>
        enableLogger || (opts.direction === 'down' && opts.result instanceof Error),
      /* eslint-disable no-console -- deliberate: expected failures go to the
         plain log (Metro) instead of error, which raises the LogBox toast. */
      console: {
        log: (...args: unknown[]) => console.log(...args),
        error: (...args: unknown[]) =>
          isExpectedFailure(args) ? console.log(...args) : console.error(...args),
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
