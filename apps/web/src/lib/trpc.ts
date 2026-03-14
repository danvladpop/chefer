'use client';

import { createTRPCReact } from '@trpc/react-query';
import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';
import { httpBatchStreamLink, loggerLink } from '@trpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import superjson from 'superjson';

import type { AppRouter } from '@chefer/api';

// Create the tRPC React client
export const trpc = createTRPCReact<AppRouter>();

// Type helpers for inputs and outputs
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// Get the tRPC URL from environment
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Browser should use the current origin or explicit URL
    return process.env.NEXT_PUBLIC_API_URL ?? '';
  }

  // Server-side: use full URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

function getTrpcUrl(): string {
  return `${getBaseUrl()}/trpc`;
}

/**
 * Creates a new QueryClient instance with sensible defaults.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        retry: (failureCount, error) => {
          // Don't retry on 4xx errors
          if (error instanceof Error && 'data' in error) {
            const trpcError = error as { data?: { httpStatus?: number } };
            if (
              trpcError.data?.httpStatus &&
              trpcError.data.httpStatus >= 400 &&
              trpcError.data.httpStatus < 500
            ) {
              return false;
            }
          }
          return failureCount < 3;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always create a new client
    return makeQueryClient();
  }
  // Browser: create once and reuse
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
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
        httpBatchStreamLink({
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
