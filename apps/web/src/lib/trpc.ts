'use client';

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@chefer/api';

// Create the tRPC React client
export const trpc = createTRPCReact<AppRouter>();

// Type helpers for inputs and outputs
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// Pages that must never bounce to /login — they are where you land after one.
const AUTH_PATHS = ['/login', '/register'];

/** True for a tRPC error the API rejected as unauthenticated. */
function isUnauthorized(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return false;
  }
  const { data } = error as { data?: { code?: string; httpStatus?: number } };
  return data?.code === 'UNAUTHORIZED' || data?.httpStatus === 401;
}

// Set once we start navigating, so a batch of failing queries triggers one redirect.
let redirectingToLogin = false;

/**
 * Sends the user to /login when the API rejects a request as unauthenticated.
 *
 * Without this, an expired or deleted session renders as a silently empty page:
 * the middleware sees a cookie and lets the request through, then every query
 * fails. A full page navigation (rather than router.push) drops the cached RSC
 * payload, and /login re-validates the cookie server-side before rendering.
 */
function handleUnauthorized(error: unknown): void {
  if (typeof window === 'undefined' || redirectingToLogin || !isUnauthorized(error)) {
    return;
  }

  const { pathname } = window.location;
  if (AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return;
  }

  redirectingToLogin = true;
  window.location.replace(`/login?from=${encodeURIComponent(pathname)}`);
}

/**
 * Creates a new QueryClient instance with sensible defaults.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleUnauthorized }),
    mutationCache: new MutationCache({ onError: handleUnauthorized }),
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
