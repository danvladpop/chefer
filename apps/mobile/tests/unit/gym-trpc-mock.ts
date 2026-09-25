// Shared fake for `src/lib/trpc`, used by gym screen tests (setup/today/
// settings/dashboard card) that call real tRPC hooks. Each leaf hook is a
// jest.fn() the test configures per scenario with `.mockReturnValue(...)`.
//
// `gym.bootstrap._def()` is kept real-shaped (matches what
// @trpc/react-query's `getQueryKey` reads: `procedure._def().path`) because
// `use-gym-bootstrap.ts` computes `gymBootstrapQueryKey` from it at module
// load time — every gym screen imports that module transitively, so this
// must resolve without touching the network. Screens under test read the
// bootstrap itself through the real `useQuery` (react-query), pre-seeded via
// `queryClient.setQueryData(gymBootstrapQueryKey, ...)`, not through this mock.
export function createTrpcGymMock() {
  return {
    trpc: {
      // Header avatar (every tab-root header) reads the signed-in user.
      auth: {
        me: {
          useQuery: jest.fn(() => ({
            data: { firstName: 'Alice', lastName: 'Jones', email: 'alice@chefer.dev' },
          })),
        },
      },
      gym: {
        bootstrap: { _def: () => ({ path: ['gym', 'bootstrap'] }) },
        profile: {
          recommend: { useQuery: jest.fn() },
          completeSetup: { useMutation: jest.fn() },
          save: { useMutation: jest.fn() },
        },
        routine: { setNextDay: { useMutation: jest.fn() } },
        progression: {
          dismissOffer: { useMutation: jest.fn() },
          startDeload: { useMutation: jest.fn() },
          setOverride: { useMutation: jest.fn() },
          clearOverride: { useMutation: jest.fn() },
        },
        pause: { create: { useMutation: jest.fn() }, end: { useMutation: jest.fn() } },
      },
      useUtils: jest.fn(() => ({ client: { gym: { bootstrap: { query: jest.fn() } } } })),
    },
  };
}

export function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    fetchStatus: 'idle',
    ...overrides,
  };
}

export function mutationResult(overrides: Record<string, unknown> = {}) {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  };
}
