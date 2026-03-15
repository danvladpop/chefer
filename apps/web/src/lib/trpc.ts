'use client';

import { createTRPCReact } from '@trpc/react-query';
import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';
import { QueryClient } from '@tanstack/react-query';

import type { AppRouter } from '@chefer/api';

// Create the tRPC React client
export const trpc = createTRPCReact<AppRouter>();

// Type helpers for inputs and outputs
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

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
