import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '@chefer/api';
import type { FriendsMeDto, FriendUserSummary } from '@chefer/types';
import { Snackbar } from '@chefer/ui-mobile';
import { trpc } from '../../src/lib/trpc';

// Shared fakes for the friends-core-* tests (F2.0). A REAL tRPC React client
// over a fake terminating link: every call is recorded by path, so a test can
// assert "only `friends.availability` was queried", and each path answers
// from a handler (data, or a thrown `trpcError(...)`). Unhandled paths fail
// with NOT_FOUND, like an API that doesn't have the procedure.

export type Handler = (input: unknown) => unknown;
export type Handlers = Record<string, Handler>;

export const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

/** A tRPC error as the API's errorFormatter shapes it (`data.*` included). */
export function trpcError(
  code: string,
  httpStatus: number,
  extra: Record<string, unknown> = {},
  message = code,
): TRPCClientError<AppRouter> {
  return TRPCClientError.from({
    error: { message, code: -32600, data: { code, httpStatus, ...extra } },
  });
}

export function makeFakeTrpc(handlers: Handlers) {
  const calls: { path: string; input: unknown }[] = [];
  const link: TRPCLink<AppRouter> =
    () =>
    ({ op }) =>
      observable((observer) => {
        calls.push({ path: op.path, input: op.input });
        const handler = handlers[op.path];
        void Promise.resolve()
          .then(() => {
            if (!handler) throw trpcError('NOT_FOUND', 404, {}, `No handler for ${op.path}`);
            return handler(op.input);
          })
          .then(
            (data) => {
              observer.next({ result: { type: 'data', data } });
              observer.complete();
            },
            (error: unknown) => {
              observer.error(
                error instanceof TRPCClientError
                  ? (error as TRPCClientError<AppRouter>)
                  : TRPCClientError.from(error as Error),
              );
            },
          );
      });
  const client = trpc.createClient({ links: [link] });
  /** Paths called so far, in order (duplicates kept). */
  const paths = () => calls.map((c) => c.path);
  /** Distinct `friends.*` paths called so far. */
  const friendsPaths = () => [...new Set(paths().filter((p) => p.startsWith('friends.')))];
  return { client, calls, paths, friendsPaths };
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { retry: false } },
  });
}

export async function renderWithTrpc(
  ui: ReactElement,
  handlers: Handlers,
  queryClient: QueryClient = makeQueryClient(),
) {
  const fake = makeFakeTrpc(handlers);
  const utils = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <trpc.Provider client={fake.client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {ui}
          <Snackbar />
        </QueryClientProvider>
      </trpc.Provider>
    </SafeAreaProvider>,
  );
  return { ...utils, ...fake, queryClient };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export function person(overrides: Partial<FriendUserSummary> = {}): FriendUserSummary {
  return {
    id: 'cmaria000000000000000001',
    displayName: 'Maria Pop',
    firstName: 'Maria',
    imageUrl: null,
    relation: 'none',
    followsYou: false,
    requestedYou: false,
    ...overrides,
  };
}

export function meDto(overrides: Partial<FriendsMeDto> = {}): FriendsMeDto {
  return {
    activated: true,
    firstName: 'Dan',
    lastName: 'Pop',
    settings: {
      visibility: 'PRIVATE',
      forcedPrivate: false,
      sharePlan: true,
      shareRecipes: true,
      shareWorkouts: true,
      shareTargets: false,
    },
    counts: { followers: 2, following: 3, pendingRequests: 1, unreadActivity: 2, blocked: 0 },
    badgeCount: 3,
    ...overrides,
  };
}

/** Handlers for a user with Following available and activated. */
export function availableHandlers(me: FriendsMeDto = meDto()): Handlers {
  return {
    'friends.availability': () => ({ enabled: true }),
    'friends.me': () => me,
  };
}

/** Handlers for a user with Following switched off. */
export const OFF_HANDLERS: Handlers = {
  'friends.availability': () => ({ enabled: false }),
  // Would only be reached if the gate leaked; the tests assert it never is.
  'friends.me': () => {
    throw trpcError('FORBIDDEN', 403, { friendsUnavailable: true });
  },
};

/** A promise you resolve or reject from the test (holds a mutation in flight). */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
