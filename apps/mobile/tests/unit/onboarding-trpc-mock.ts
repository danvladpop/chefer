// Shared fake for `src/lib/trpc`, used by the onboarding-routing RNTL tests
// (dogfood feedback #9: register → onboarding, login → no onboarding, skip →
// home). Same shape/convention as gym-trpc-mock.ts.

export function createTrpcOnboardingMock() {
  return {
    trpc: {
      auth: {
        me: { useQuery: jest.fn() },
        register: { useMutation: jest.fn() },
        login: { useMutation: jest.fn() },
      },
      preferences: {
        get: { useQuery: jest.fn(() => queryResult()) },
        setup: { useMutation: jest.fn() },
        updateSafety: { useMutation: jest.fn() },
        saveProfileBasics: { useMutation: jest.fn() },
      },
      useUtils: jest.fn(() => ({
        preferences: { invalidate: jest.fn() },
        dashboard: { invalidate: jest.fn() },
      })),
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
    mutateAsync: jest.fn(() => Promise.resolve(undefined)),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides,
  };
}
