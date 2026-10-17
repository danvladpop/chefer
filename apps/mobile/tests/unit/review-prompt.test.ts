import { AppState } from 'react-native';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  maybeRequestReview,
  requestReviewNow,
  resetPendingReviewForTests,
} from '../../src/features/review/request-review';
import {
  INITIAL_REVIEW_PROMPT_STATE,
  isFullWeekPlan,
  markPrompted,
  parseReviewPromptState,
  PROMPT_COOLDOWN_MS,
  recordActiveDay,
  reviewDecision,
  type ReviewPromptState,
  type ReviewSession,
} from '../../src/features/review/review-eligibility';
import {
  reviewOnMutationSuccess,
  reviewOnQuerySuccess,
  trpcPathOf,
} from '../../src/features/review/review-signals';
import {
  emitAppStateForTests,
  getReviewSession,
  noteReviewBlockingError,
  noteWorkoutCompleted,
  readReviewState,
  resetReviewSessionForTests,
  REVIEW_PROMPT_KEY,
  REVIEW_SESSION_GAP_MS,
  startReviewSession,
  writeReviewState,
} from '../../src/features/review/review-store';
import { makeQueryClient } from '../../src/lib/trpc';

// Store rating prompt (ASO plan §5.1): the native sheet is requested only at a
// success moment, after 3+ active days, never in the first session or after a
// failure, and at most once per 120 days from our side.

const mockTrack = jest.fn();
jest.mock('../../src/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

const mockRequireOptional = jest.fn((_name: string): unknown => ({}));
jest.mock('expo', () => ({
  ...jest.requireActual<object>('expo'),
  requireOptionalNativeModule: (name: string): unknown => mockRequireOptional(name),
}));

const mockIsAvailable = jest.fn(() => Promise.resolve(true));
const mockRequestReview = jest.fn(() => Promise.resolve());
jest.mock('expo-store-review', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  requestReview: () => mockRequestReview(),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 16, 12, 0);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

const OK_SESSION: ReviewSession = { isFirst: false, hadError: false };

/** A seasoned user: three active days, a full week planned, 3 workouts. */
function seasoned(overrides: Partial<ReviewPromptState> = {}): ReviewPromptState {
  return {
    firstOpenAt: daysAgo(10).toISOString(),
    activeDays: ['2026-10-06', '2026-10-10', '2026-10-16'],
    lastPromptAt: null,
    fullWeekPlannedAt: daysAgo(5).toISOString(),
    completedWorkouts: 3,
    ...overrides,
  };
}

const fullWeek = {
  planId: 'plan-1',
  days: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, meals: [{ recipeId: 'r' }] })),
};

/** The RN jest mock has no real AppState; pin what `currentState` reads. */
function setAppState(status: 'active' | 'background') {
  Object.defineProperty(AppState, 'currentState', {
    value: status,
    configurable: true,
    writable: true,
  });
}

/** Launch the app on `day` as a returning user (a later process). */
function relaunch(day: Date) {
  resetReviewSessionForTests();
  startReviewSession(day);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireOptional.mockImplementation(() => ({}));
  mockIsAvailable.mockImplementation(() => Promise.resolve(true));
  mockRequestReview.mockImplementation(() => Promise.resolve());
  setKvBackendForTests(createMemoryKvBackend());
  resetReviewSessionForTests();
  resetPendingReviewForTests();
  setAppState('active');
});

afterEach(() => {
  jest.useRealTimers();
  resetReviewSessionForTests();
});

describe('active-day counting', () => {
  it('counts each calendar day once and stamps the first open', () => {
    let state = recordActiveDay(INITIAL_REVIEW_PROMPT_STATE, new Date(2026, 9, 1, 8, 0));
    state = recordActiveDay(state, new Date(2026, 9, 1, 22, 0));
    expect(state.activeDays).toEqual(['2026-10-01']);
    expect(state.firstOpenAt).toBe(new Date(2026, 9, 1, 8, 0).toISOString());

    state = recordActiveDay(state, new Date(2026, 9, 3, 9, 0));
    state = recordActiveDay(state, new Date(2026, 9, 7, 9, 0));
    expect(state.activeDays).toEqual(['2026-10-01', '2026-10-03', '2026-10-07']);
    // The first open never moves.
    expect(state.firstOpenAt).toBe(new Date(2026, 9, 1, 8, 0).toISOString());
  });

  it('needs at least 3 distinct days', () => {
    const two = seasoned({ activeDays: ['2026-10-15', '2026-10-16'] });
    expect(reviewDecision('gym_pr', two, OK_SESSION, NOW)).toEqual({
      ok: false,
      reason: 'too-few-days',
    });
    const dupes = seasoned({ activeDays: ['2026-10-16', '2026-10-16', '2026-10-15'] });
    expect(reviewDecision('gym_pr', dupes, OK_SESSION, NOW).ok).toBe(false);
    expect(reviewDecision('gym_pr', seasoned(), OK_SESSION, NOW)).toEqual({ ok: true });
  });

  it('is recorded at launch and on every return to the foreground', () => {
    startReviewSession(new Date(2026, 9, 1, 9, 0));
    expect(readReviewState().activeDays).toHaveLength(1);
    // A foreground on a later day (same process) counts that day too.
    jest.useFakeTimers({ now: new Date(2026, 9, 2, 9, 0) });
    emitAppStateForTests('active');
    expect(readReviewState().activeDays).toEqual(['2026-10-01', '2026-10-02']);
  });
});

describe('120-day cap', () => {
  it('blocks for 120 days after our last request, then allows again', () => {
    const asked = (ms: number) =>
      seasoned({ lastPromptAt: new Date(NOW.getTime() - ms).toISOString() });
    expect(reviewDecision('gym_pr', asked(DAY_MS), OK_SESSION, NOW)).toEqual({
      ok: false,
      reason: 'cooldown',
    });
    expect(reviewDecision('gym_pr', asked(119 * DAY_MS), OK_SESSION, NOW).ok).toBe(false);
    expect(reviewDecision('gym_pr', asked(PROMPT_COOLDOWN_MS - 1), OK_SESSION, NOW).ok).toBe(false);
    expect(reviewDecision('gym_pr', asked(PROMPT_COOLDOWN_MS), OK_SESSION, NOW).ok).toBe(true);
    expect(reviewDecision('gym_pr', asked(200 * DAY_MS), OK_SESSION, NOW).ok).toBe(true);
  });

  it('treats a stamp in the future (clock moved back) as just asked', () => {
    const future = seasoned({ lastPromptAt: new Date(NOW.getTime() + DAY_MS).toISOString() });
    expect(reviewDecision('gym_pr', future, OK_SESSION, NOW).ok).toBe(false);
  });

  it('starts at the request and survives a relaunch', async () => {
    writeReviewState(seasoned());
    relaunch(NOW);
    jest.useFakeTimers({ now: NOW });
    expect(await requestReviewNow('gym_pr')).toBe(true);
    expect(readReviewState().lastPromptAt).toBe(NOW.toISOString());

    relaunch(new Date(NOW.getTime() + 30 * DAY_MS));
    jest.setSystemTime(new Date(NOW.getTime() + 30 * DAY_MS));
    expect(await requestReviewNow('gym_pr')).toBe(false);
    expect(mockRequestReview).toHaveBeenCalledTimes(1);
  });
});

describe('first-session block', () => {
  it('never prompts in the session that first opened the app', () => {
    startReviewSession(NOW);
    expect(getReviewSession().isFirst).toBe(true);
    expect(reviewDecision('gym_pr', seasoned(), getReviewSession(), NOW)).toEqual({
      ok: false,
      reason: 'first-session',
    });
  });

  it('a later launch is not the first session', () => {
    startReviewSession(daysAgo(3));
    relaunch(NOW);
    expect(getReviewSession()).toEqual({ isFirst: false, hadError: false });
  });

  it('blocks everything until the session has been started', () => {
    writeReviewState(seasoned());
    expect(getReviewSession().isFirst).toBe(true);
    expect(maybeRequestReview('gym_pr')).toBe(false);
  });
});

describe('error block', () => {
  it('an ErrorBoundary recovery, sync failure or failed mutation blocks the rest of the session', () => {
    writeReviewState(seasoned());
    relaunch(NOW);
    expect(reviewDecision('gym_pr', readReviewState(), getReviewSession(), NOW).ok).toBe(true);
    noteReviewBlockingError();
    expect(reviewDecision('gym_pr', readReviewState(), getReviewSession(), NOW)).toEqual({
      ok: false,
      reason: 'recent-error',
    });
    expect(maybeRequestReview('gym_pr')).toBe(false);
  });

  it('a new launch clears it', () => {
    writeReviewState(seasoned());
    relaunch(NOW);
    noteReviewBlockingError();
    relaunch(NOW);
    expect(getReviewSession().hadError).toBe(false);
  });

  it('a return after a long background is a new session; a short one is not', () => {
    writeReviewState(seasoned());
    jest.useFakeTimers({ now: NOW });
    relaunch(NOW);
    noteReviewBlockingError();

    emitAppStateForTests('background');
    jest.setSystemTime(NOW.getTime() + 60 * 1000);
    emitAppStateForTests('active');
    expect(getReviewSession().hadError).toBe(true);

    emitAppStateForTests('background');
    jest.setSystemTime(NOW.getTime() + 60 * 1000 + REVIEW_SESSION_GAP_MS);
    emitAppStateForTests('active');
    expect(getReviewSession()).toEqual({ isFirst: false, hadError: false });
  });

  it('a failed mutation going through the query client blocks it', async () => {
    writeReviewState(seasoned());
    relaunch(NOW);
    const client = makeQueryClient({ onMutationError: () => undefined });
    await client
      .getMutationCache()
      .build(client, {
        mutationKey: [['tracker', 'logRecipe']],
        mutationFn: () => Promise.reject(new Error('boom')),
        gcTime: 0, // no 5-minute gc timer keeping Jest alive
      })
      .execute(undefined)
      .catch(() => undefined);
    expect(getReviewSession().hadError).toBe(true);
  });
});

describe('triggers', () => {
  it('food triggers need a full week planned first', () => {
    const noWeek = seasoned({ fullWeekPlannedAt: null });
    expect(reviewDecision('food_log', noWeek, OK_SESSION, NOW)).toEqual({
      ok: false,
      reason: 'trigger-not-met',
    });
    expect(reviewDecision('shopping_tick', noWeek, OK_SESSION, NOW).ok).toBe(false);
    expect(reviewDecision('food_log', seasoned(), OK_SESSION, NOW).ok).toBe(true);
  });

  it('the gym milestone needs 3 completed workouts; a PR does not', () => {
    const two = seasoned({ completedWorkouts: 2 });
    expect(reviewDecision('gym_third_workout', two, OK_SESSION, NOW).ok).toBe(false);
    expect(reviewDecision('gym_pr', two, OK_SESSION, NOW).ok).toBe(true);
    writeReviewState(two);
    noteWorkoutCompleted();
    expect(reviewDecision('gym_third_workout', readReviewState(), OK_SESSION, NOW).ok).toBe(true);
  });

  it('a full week means a meal on each of the 7 days', () => {
    expect(isFullWeekPlan(fullWeek)).toBe(true);
    expect(isFullWeekPlan({ days: fullWeek.days.slice(0, 6) })).toBe(false);
    const oneEmpty = {
      days: fullWeek.days.map((d) => (d.dayOfWeek === 3 ? { ...d, meals: [] } : d)),
    };
    expect(isFullWeekPlan(oneEmpty)).toBe(false);
    expect(isFullWeekPlan(null)).toBe(false);
    expect(isFullWeekPlan({ days: 'nope' })).toBe(false);
  });

  it('notes the full week from the query cache, then a meal log schedules the prompt', () => {
    jest.useFakeTimers({ now: NOW });
    writeReviewState(seasoned({ fullWeekPlannedAt: null }));
    relaunch(NOW);

    reviewOnMutationSuccess([['tracker', 'logRecipe']], {}, {});
    expect(maybeRequestReview('gym_pr')).toBe(true); // nothing was pending
    resetPendingReviewForTests();

    reviewOnQuerySuccess([['mealPlan', 'getForWeek'], { input: { weekOffset: 0 } }], fullWeek);
    expect(readReviewState().fullWeekPlannedAt).toBe(NOW.toISOString());

    reviewOnMutationSuccess([['tracker', 'logRecipe']], {}, {});
    expect(maybeRequestReview('gym_pr')).toBe(false); // the log already scheduled one
    // …which fires only after the success UI settles.
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it('a shopping tick triggers; an untick does not', () => {
    writeReviewState(seasoned());
    relaunch(NOW);
    jest.useFakeTimers({ now: NOW });
    reviewOnMutationSuccess([['shoppingList', 'toggleItems']], { checked: false }, {});
    expect(maybeRequestReview('gym_pr')).toBe(true); // nothing was pending
    resetPendingReviewForTests();
    reviewOnMutationSuccess([['shoppingList', 'toggleItems']], { checked: true }, {});
    expect(maybeRequestReview('gym_pr')).toBe(false); // the tick already scheduled one
  });

  it('reads tRPC paths from cache keys', () => {
    expect(trpcPathOf([['tracker', 'logCustomMeal']])).toBe('tracker.logCustomMeal');
    expect(trpcPathOf(['plain-key'])).toBeNull();
    expect(trpcPathOf(undefined)).toBeNull();
  });
});

describe('requesting the native sheet', () => {
  beforeEach(() => {
    writeReviewState(seasoned());
    relaunch(NOW);
  });

  it('asks the OS after the settle delay and starts the cooldown', async () => {
    jest.useFakeTimers({ now: NOW });
    expect(maybeRequestReview('food_log', 2000)).toBe(true);
    expect(maybeRequestReview('food_log', 2000)).toBe(false); // one at a time
    await jest.advanceTimersByTimeAsync(1999);
    expect(mockRequestReview).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockRequestReview).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('review_prompt_requested', { trigger: 'food_log' });
    expect(readReviewState().lastPromptAt).not.toBeNull();
  });

  it('re-checks at fire time: an error during the delay cancels it', async () => {
    jest.useFakeTimers({ now: NOW });
    expect(maybeRequestReview('gym_pr', 3000)).toBe(true);
    noteReviewBlockingError();
    await jest.advanceTimersByTimeAsync(3000);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it('does nothing when the app is no longer in the foreground', async () => {
    setAppState('background');
    expect(await requestReviewNow('gym_pr')).toBe(false);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it('is a silent no-op on a binary without the native module', async () => {
    mockRequireOptional.mockImplementation(() => null);
    await expect(requestReviewNow('gym_pr')).resolves.toBe(false);
    expect(mockRequestReview).not.toHaveBeenCalled();
    expect(readReviewState().lastPromptAt).toBeNull();
  });

  it('does not start the cooldown when the store says it is unavailable (TestFlight)', async () => {
    mockIsAvailable.mockImplementation(() => Promise.resolve(false));
    expect(await requestReviewNow('gym_pr')).toBe(false);
    expect(readReviewState().lastPromptAt).toBeNull();
  });

  it('swallows a native failure', async () => {
    mockRequestReview.mockImplementation(() =>
      Promise.reject(new Error('ERR_STORE_REVIEW_FAILED')),
    );
    await expect(requestReviewNow('gym_pr')).resolves.toBe(false);
    mockIsAvailable.mockImplementation(() => {
      throw new Error('native crash');
    });
    await expect(requestReviewNow('gym_pr')).resolves.toBe(false);
  });
});

describe('stored state', () => {
  it('reads malformed or missing values back as safe defaults', () => {
    expect(parseReviewPromptState(null)).toEqual(INITIAL_REVIEW_PROMPT_STATE);
    expect(
      parseReviewPromptState({
        activeDays: ['2026-10-01', 4],
        lastPromptAt: 'not a date',
        completedWorkouts: 'x',
      }),
    ).toEqual({ ...INITIAL_REVIEW_PROMPT_STATE, activeDays: ['2026-10-01'] });
    kv.setString(REVIEW_PROMPT_KEY, '{not json');
    expect(readReviewState()).toEqual(INITIAL_REVIEW_PROMPT_STATE);
  });

  it('markPrompted stamps the time', () => {
    expect(markPrompted(seasoned(), NOW).lastPromptAt).toBe(NOW.toISOString());
  });
});
