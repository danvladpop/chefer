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
        get: {
          useQuery: jest.fn(() =>
            queryResult({ data: { chefProfile: null, dietaryPreferences: null, jobs: [] } }),
          ),
        },
        setup: { useMutation: jest.fn() },
        updateSafety: { useMutation: jest.fn(() => mutationResult()) },
        saveProfileBasics: { useMutation: jest.fn(() => mutationResult()) },
        setIntent: { useMutation: jest.fn(() => mutationResult()) },
        // v3 (T-03.1/T-03.3): the jobs-based wizard.
        setJobs: { useMutation: jest.fn(() => mutationResult()) },
        setDisplayPreferences: { useMutation: jest.fn(() => mutationResult()) },
        updateTargets: { useMutation: jest.fn(() => mutationResult()) },
        // WP-08: "Just protein" is saved at Finish.
        setNumbersMode: { useMutation: jest.fn(() => mutationResult()) },
      },
      // "Who's at your table?" (P2-3) renders the household editor.
      household: {
        list: { useQuery: jest.fn(() => queryResult({ data: [] })) },
        add: { useMutation: jest.fn(() => mutationResult()) },
        update: { useMutation: jest.fn(() => mutationResult()) },
        remove: { useMutation: jest.fn(() => mutationResult()) },
      },
      // T-01.7: the household editor's table read-back summary.
      safety: {
        getTable: {
          useQuery: jest.fn(() =>
            queryResult({ data: { people: [], hasRules: false, needsReview: false } }),
          ),
        },
      },
      // Training days step (T-03.3/T-03.9).
      training: {
        setDayKinds: { useMutation: jest.fn(() => mutationResult()) },
      },
      // How you cook step (T-03.3) + Your targets step (T-03.7, T-35.3).
      mealPlan: {
        getShape: { useQuery: jest.fn(() => queryResult()) },
        setShape: { useMutation: jest.fn(() => mutationResult()) },
        generate: { useMutation: jest.fn(() => mutationResult()) },
      },
      targets: {
        get: { useQuery: jest.fn(() => queryResult()) },
        set: { useMutation: jest.fn(() => mutationResult()) },
      },
      useUtils: jest.fn(() => ({
        preferences: { invalidate: jest.fn(), get: { invalidate: jest.fn() } },
        dashboard: { invalidate: jest.fn() },
        household: { list: { invalidate: jest.fn() } },
        mealPlan: { invalidate: jest.fn() },
        shoppingList: { getForWeek: { invalidate: jest.fn() } },
        safety: { getTable: { invalidate: jest.fn() } },
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
    reset: jest.fn(),
    ...overrides,
  };
}
