import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@chefer/api';
import { showSnackbar } from '@chefer/ui-mobile';
import {
  handleAiConsentRequiredError,
  shouldNotifyMutationError,
  userFacingErrorMessage,
  type MutationMetaShape,
} from '@chefer/utils';
import { bindSessionQueryClient, clearToken, getToken } from './auth-store';

export const trpc = createTRPCReact<AppRouter>();

// Types `meta` on every mutation: `{ silent: true }` opts out of the default
// failure snackbar (below) for a call site that renders its own error UI.
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: MutationMetaShape;
  }
}

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
 * mobile mirror of web's redirect-to-/login). The app passes `signOut` from
 * `./sign-out` (UX-ACC-02: cache, device data, reminders, drafts, token —
 * the same as the buttons); it is injected rather than imported because
 * sign-out reaches the gym stores, which import this module. Clearing the
 * token (its last step) flips the root layout's auth gate, which routes back
 * to the login screen.
 */
function handleUnauthorized(error: unknown, onUnauthorized: () => void): void {
  if (!isUnauthorized(error) || getToken() === null) {
    return;
  }
  onUnauthorized();
}

export interface QueryClientOptions {
  /** What a 401 does. The default only drops the token — the app passes the full `signOut`. */
  onUnauthorized?: () => void;
  /** Shows a failed mutation's message. The default is the app-wide snackbar. */
  onMutationError?: (message: string) => void;
}

/** Query client with the same defaults and 401 handling as apps/web. */
export function makeQueryClient(options: QueryClientOptions = {}): QueryClient {
  const onUnauthorized =
    options.onUnauthorized ??
    (() => {
      void clearToken();
    });
  const notifyMutationError =
    options.onMutationError ?? ((message: string) => showSnackbar({ message }));
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => handleUnauthorized(error, onUnauthorized) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        handleUnauthorized(error, onUnauthorized);
        // R-10: the server refused an AI action for missing consent → the
        // consent provider reopens its sheet instead of a generic error.
        handleAiConsentRequiredError(error, mutation.options.mutationKey);
        // WP-02 (audit §6.3): no mutation fails silently. A call site that
        // shows its own error UI passes `meta: { silent: true }`.
        if (shouldNotifyMutationError(error, mutation.options.meta)) {
          notifyMutationError(userFacingErrorMessage(error));
        }
      },
    }),
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
  bindSessionQueryClient(client);
  return client;
}
