import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@chefer/api';

// Server-only: prefer the internal Docker network URL so RSC calls stay on the
// private network in production; fall back to the public URL, then localhost.
const API_URL = `${
  process.env['API_INTERNAL_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
}/trpc`;

export const serverClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: API_URL,
      transformer: superjson,
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
        headers: { cookie: cookieHeader },
      }),
    ],
  });
}
