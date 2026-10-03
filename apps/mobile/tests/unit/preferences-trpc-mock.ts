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
      // T-39.3: default "already seen" so the email-defaults notice doesn't
      // appear for tests that don't care about it.
      user: {
        me: {
          useQuery: jest.fn<unknown, unknown[]>(() => ({
            data: { emailDefaultsNoticeAt: '2026-01-01T00:00:00.000Z' },
            isLoading: false,
            isError: false,
          })),
        },
        dismissEmailDefaultsNotice: {
          useMutation: jest.fn(() => ({ mutate: jest.fn(), isPending: false, isError: false })),
        },
      },
      preferences: {
        get: { useQuery: jest.fn() },
        setup: { useMutation: jest.fn() },
        updateSafety: { useMutation: jest.fn() },
        updateTargets: { useMutation: jest.fn() },
        saveProfileBasics: { useMutation: jest.fn() },
        setDisplayPreferences: { useMutation: jest.fn() },
        setHomeDisplay: {
          useMutation: jest.fn(() => ({ mutate: jest.fn(), isPending: false, isError: false })),
        },
        // Macro preview (lifter protein) — default: nothing back yet.
        computeTargets: {
          useQuery: jest.fn<unknown, unknown[]>(() => ({ data: undefined })),
        },
        setAutoPlanWeekly: {
          useMutation: jest.fn(() => ({ mutate: jest.fn(), isPending: false, isError: false })),
        },
      },
      // TargetsCard (§2.11, T-35.3) — default: suggested-mode, nothing loaded
      // yet (isLoading true) so tests unrelated to it don't need to stub data.
      targets: {
        get: {
          useQuery: jest.fn<unknown, unknown[]>(() => ({ data: undefined, isLoading: true })),
        },
        set: {
          useMutation: jest.fn(() => ({
            mutate: jest.fn(),
            isPending: false,
            isSuccess: false,
            error: null,
          })),
        },
        changes: { useQuery: jest.fn<unknown, unknown[]>(() => ({ data: [] })) },
        acknowledgeChange: {
          useMutation: jest.fn(() => ({
            mutate: jest.fn(),
            isPending: false,
            variables: undefined,
          })),
        },
      },
      // T-01.3 migration card — default: nothing to review.
      safety: {
        getTable: {
          useQuery: jest.fn<unknown, unknown[]>(() => ({
            data: { people: [], hasRules: false, needsReview: false },
          })),
        },
        confirmReview: {
          useMutation: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
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
        dashboard: { invalidate: jest.fn(), summary: { invalidate: jest.fn() } },
        user: { me: { setData: jest.fn(), invalidate: jest.fn() } },
        targets: {
          invalidate: jest.fn(),
          get: { invalidate: jest.fn() },
          changes: { invalidate: jest.fn() },
        },
        tracker: { getDay: { invalidate: jest.fn() } },
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
