// Shared fake for `src/lib/trpc`, used by preferences/onboarding screen tests
// (dogfood feedback #6 and #9). Same shape/convention as gym-trpc-mock.ts:
// each leaf hook is a jest.fn() the test configures per scenario with
// `.mockReturnValue(...)`.

export function createTrpcPreferencesMock() {
  return {
    trpc: {
      auth: {
        me: { useQuery: jest.fn() },
      },
      preferences: {
        get: { useQuery: jest.fn() },
        setup: { useMutation: jest.fn() },
        updateSafety: { useMutation: jest.fn() },
        updateTargets: { useMutation: jest.fn() },
        saveProfileBasics: { useMutation: jest.fn() },
        setDisplayPreferences: { useMutation: jest.fn() },
        setAutoPlanWeekly: {
          useMutation: jest.fn(() => ({ mutate: jest.fn(), isPending: false, isError: false })),
        },
      },
      // Weekly updates card (P2-5) — defaults: confirmed, both emails on.
      notifications: {
        getEmailPreferences: {
          useQuery: jest.fn<unknown, unknown[]>(() => ({
            data: {
              weekReady: true,
              weeklyRecap: true,
              emailConfirmed: true,
              email: 'ana@chefer.dev',
            },
            isLoading: false,
            isError: false,
          })),
        },
        setEmailPreferences: {
          useMutation: jest.fn(() => ({ mutate: jest.fn(), isPending: false, isError: false })),
        },
        resendConfirmation: {
          useMutation: jest.fn(() => ({
            mutate: jest.fn(),
            isPending: false,
            isSuccess: false,
            isError: false,
          })),
        },
      },
      useUtils: jest.fn(() => ({
        preferences: { get: { invalidate: jest.fn() }, invalidate: jest.fn() },
        gym: { invalidate: jest.fn() },
        mealPlan: { invalidate: jest.fn() },
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
