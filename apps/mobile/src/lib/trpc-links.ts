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

export function buildTrpcLinks({ url, getToken, enableLogger = false }: TrpcLinkOptions) {
  return [
    loggerLink({
      enabled: (opts) =>
        enableLogger || (opts.direction === 'down' && opts.result instanceof Error),
    }),
    httpBatchLink({
      transformer: superjson,
      url,
      headers: () => buildAuthHeaders(getToken),
    }),
  ];
}
