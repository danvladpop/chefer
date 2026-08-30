import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@chefer/api';
import { clearToken, getToken } from './auth-store';

export const trpc = createTRPCReact<AppRouter>();

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

/** True for a tRPC error the API rejected as unauthenticated. */
function isUnauthorized(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return false;
  }
  const { data } = error as { data?: { code?: string; httpStatus?: number } };
  return data?.code === 'UNAUTHORIZED' || data?.httpStatus === 401;
}

/**
 * Signs the user out when the API rejects a request as unauthenticated (the
 * mobile mirror of web's redirect-to-/login). Clearing the token flips the
 * root layout's auth gate, which routes back to the login screen.
 */
function handleUnauthorized(error: unknown): void {
  if (!isUnauthorized(error) || getToken() === null) {
    return;
  }
  void clearToken();
}

/** Query client with the same defaults and 401 handling as apps/web. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleUnauthorized }),
    mutationCache: new MutationCache({ onError: handleUnauthorized }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: (failureCount, error) => {
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
