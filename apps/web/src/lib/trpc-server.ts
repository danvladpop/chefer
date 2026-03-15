import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@chefer/api';

const API_URL = process.env['NEXT_PUBLIC_API_URL']
  ? `${process.env['NEXT_PUBLIC_API_URL']}/trpc`
  : 'http://localhost:3001/trpc';

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
