import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@chefer/api';

// Server-only: prefer the internal Docker network URL so RSC calls stay on the
// private network in production; fall back to the public URL, then localhost.
const API_URL = `${
  process.env['API_INTERNAL_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
}/trpc`;

// §2.8/T-00.8: declares this client understands the health-consent error and
// reads `profile.flags`. Bumped to 2 for T-39.1/T-26.5 (wave 1 L-ENTRY) —
// see trpc-links.ts. 3 (T-42.5, UX-42): the web renders cardio (Δ2.1).
// 4 (T-26.2/T-26.3, L-CONSENT): the web shows the health consent sheet before any
// health save. Same value as HEALTH_CONSENT_API_LEVEL (@chefer/types).
const API_LEVEL_HEADERS = { 'x-chefer-api-level': '4' };

export const serverClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: API_URL,
      transformer: superjson,
      headers: API_LEVEL_HEADERS,
    }),
  ],
});

/**
 * Creates a server-side tRPC client that forwards the request's Cookie header,
 * enabling calls to protectedProcedures from React Server Components.
 */
export function createServerClient(cookieHeader: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: API_URL,
        transformer: superjson,
        headers: { cookie: cookieHeader, ...API_LEVEL_HEADERS },
      }),
    ],
  });
}
