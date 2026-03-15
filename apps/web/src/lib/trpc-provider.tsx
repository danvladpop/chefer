'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { httpBatchLink, loggerLink } from '@trpc/client';
import superjson from 'superjson';

import { trpc, makeQueryClient } from './trpc';

let browserQueryClient: ReturnType<typeof makeQueryClient> | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

function getTrpcUrl(): string {
  // In the browser, always use the same-origin proxy path — no CORS needed.
  if (typeof window !== 'undefined') {
    return '/trpc';
  }
  // On the server (SSR), call the API directly.
  if (process.env['VERCEL_URL']) {
    return `https://${process.env['VERCEL_URL']}/trpc`;
  }
  return process.env['NEXT_PUBLIC_API_URL']
    ? `${process.env['NEXT_PUBLIC_API_URL']}/trpc`
    : 'http://localhost:3001/trpc';
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
      </trpc.Provider>
    </QueryClientProvider>
  );
}
