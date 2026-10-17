'use client';

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import superjson from 'superjson';
import { COACHING_API_LEVEL } from '@chefer/types';
import { AppToastHost } from './app-toast';
import { makeQueryClient, trpc } from './trpc';

let browserQueryClient: ReturnType<typeof makeQueryClient> | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

function getTrpcUrl(): string {
  // In the browser, always use the same-origin proxy path — no CORS needed.
  if (typeof window !== 'undefined') {
    return '/trpc';
  }
  // On the server (SSR), call the API directly. Prefer the internal Docker
  // network URL (API_INTERNAL_URL) so RSC calls don't round-trip the public edge.
  const base =
    process.env['API_INTERNAL_URL'] ??
    process.env['NEXT_PUBLIC_API_URL'] ??
    'http://localhost:3001';
  return `${base}/trpc`;
}

/**
 * TRPCProvider — wraps your app with tRPC and React Query providers.
 * Usage: wrap your root layout or specific pages.
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        httpBatchLink({
          transformer: superjson,
          url: getTrpcUrl(),
          headers() {
            return {
              'x-trpc-source': 'nextjs-react',
              // §2.8/T-00.8: declares this client understands the
              // health-consent error and reads `profile.flags`. Bumped to 2
              // for T-39.1/T-26.5 (wave 1 L-ENTRY) — see trpc-links.ts.
              // 3 (T-42.5, UX-42): the web now RENDERS cardio sets/exercises
              // (history, summary); it still never logs or picks them.
              // 4 (T-26.2/T-26.3, L-CONSENT): the web shows the health consent
              // sheet before any health save — see mobile trpc-links.ts.
              // 6 (WP-18, trainer coaching): the web shows trainer stamps and notes
              // on the routine, "Set by Ana", the named conflict dialog and the
              // coaching consent rows. Levels are cumulative; INTERVALS is 7 and
              // not implemented here. Web is always the latest client.
              'x-chefer-api-level': String(COACHING_API_LEVEL),
            };
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        {children}
        <AppToastHost />
      </trpc.Provider>
    </QueryClientProvider>
  );
}
