import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { PersonalRecord, SessionSummaryDto, WeekSummary } from '@chefer/types';
import { addDaysLocal } from '@chefer/utils';
import ProgressScreen from '../../app/progress';
import { localDate } from '../../src/features/gym/offline/ids';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import {
  eatingStats,
  liftChangeText,
  liftSummary,
  muscleSets,
  olderHistoryCursor,
  pickLifts,
  recentPrs,
  signedPct,
  thisWeekDays,
  trainingStats,
  trainingStatsForYear,
  trainingStatsWithHistory,
} from '../../src/features/shell/stats/stats-helpers';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';
import { makeBootstrap, makeExercise } from './gym-fixtures';

// 10 Oct redesign — Progress in the new shell is "Stats" (board Progress),
// revamped 2026-10-15: Eating | Strength tabs under one 1W / 1M / 3M / 1Y
// range. Eating: tiles, intake bars with the target (weekly averages past a
// month), average macros vs targets, the weekly review in one line, weight
// with Log weight and Edit entries. Strength: workouts, PRs and streak,
// workouts per week, your lifts in plain words, sets per muscle, recent PRs.

let mockParams: { tab?: string } = {};
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../src/features/shell/shell-store', () => ({ useShellV2: () => true }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
// T-26.2: consent on record — these tests are about the screen, not the gate.
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const TODAY = localDate();

function monthly(days: number, logged: number[]) {
  return {
    dailyCalorieTarget: 2100,
    days: Array.from({ length: days }, (_, i) => {
      const on = logged.includes(i);
      return {
        date: addDaysLocal(TODAY, i - days + 1),
        totalKcal: on ? 2000 : 0,
        totalProtein: on ? 126 : 0,
        totalCarbs: on ? 198 : 0,
        totalFat: on ? 64 : 0,
        hasLog: on,
      };
    }),
  };
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(8, 0, 0, 0);
  return d;
};

const WEIGHTS = [
  { id: 'w1', weightKg: 74.3, recordedAt: daysAgo(80) },
  { id: 'w2', weightKg: 73.1, recordedAt: daysAgo(40) },
  { id: 'w3', weightKg: 72.4, recordedAt: daysAgo(0) },
];

function api(over: Partial<Handlers> = {}) {
  const calls = { monthly: [] as unknown[] };
  const handlers: Handlers = {
    'tracker.monthlySummary': (input) => {
      calls.monthly.push(input);
      const days = (input as { days?: number }).days ?? 28;
      return monthly(days, [days - 1, days - 2, days - 3, days - 5, days - 6]);
    },
    'targets.get': () => ({
      effective: { dailyCalorieTarget: 2100, proteinG: 140, carbsG: 230, fatG: 70 },
    }),
    'tracker.weightHistory': () => WEIGHTS,
    'preferences.get': () => ({ chefProfile: { preferredUnits: 'METRIC', goal: 'LOSE_WEIGHT' } }),
    'coach.currentReview': () => ({
      status: 'full',
      review: {
        reviewText: 'This week: logged 6 of 7 days, protein hit on 5.\nKeep the breakfasts.',
        adherencePct: 86,
        avgDailyKcal: 1946,
        weightTrendKg: -0.3,
        adjustmentKcal: 0,
        aiGenerated: false,
      },
    }),
    ...over,
  };
  return { handlers, calls };
}

function session(id: string, daysBack: number, weightKg: number): SessionSummaryDto {
  const date = addDaysLocal(TODAY, -daysBack);
  return {
    id,
    name: 'Push A',
    routineDayId: 'day-a',
    status: 'COMPLETED',
    localDate: date,
    startedAt: `${date}T17:00:00.000Z`,
    finishedAt: `${date}T18:00:00.000Z`,
    isDeload: false,
    exercises: [
      {
        exerciseId: 'bench',
        skipped: false,
        lastSetRir: null,
        sets: [{ weightKg, reps: 8, isWarmup: false, completed: true }],
      },
    ],
  };
}

function pr(sessionId: string, daysBack: number): PersonalRecord {
  return {
    exerciseId: 'bench',
    kind: 'weight',
    weightKg: 70,
    reps: 8,
    e1rmKg: null,
    localDate: addDaysLocal(TODAY, -daysBack),
    sessionId,
    isFirst: false,
  };
}

const week = (weekStart: string, status: WeekSummary['status'], sessions = 3): WeekSummary => ({
  weekStart,
  goal: 4,
  sessions,
  status,
  flexTokens: 0,
});

const GYM = makeBootstrap({
  recentSessions: [session('s3', 2, 70), session('s2', 9, 65), session('s1', 40, 60)],
  streak: { current: 7, best: 7, flexTokens: 1, thisWeekSessions: 2, thisWeekGoal: 4 },
  weeks: [
    week('2026-08-17', 'met'),
    week('2026-08-24', 'met'),
    week('2026-08-31', 'flex'),
    week('2026-09-07', 'met'),
    week('2026-09-14', 'met'),
    week('2026-09-21', 'met'),
    week('2026-09-28', 'met'),
    week('2026-10-05', 'current', 2),
  ],
});

async function renderStats(over: Partial<Handlers> = {}, gym: unknown = GYM) {
  const server = api(over);
  const queryClient = testQueryClient();
  if (gym) queryClient.setQueryData(gymBootstrapQueryKey, gym);
  const utils = await renderWithTrpc(<ProgressScreen />, server.handlers, queryClient);
  await screen.findByTestId(mockParams.tab === 'strength' ? 'stats-tab' : 'stats-avg');
  // `requests`: every tRPC call the screen made ({ path, input }).
  return { ...utils, calls: server.calls, requests: utils.calls };
}

/** Stats on the Strength tab, as Train's link opens it. */
async function renderStrength(over: Partial<Handlers> = {}, gym: unknown = GYM) {
  mockParams = { tab: 'strength' };
  const rendered = await renderStats(over, gym);
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('Stats (new shell)', () => {
  it('titles the screen Stats, with the range control and the review in one line', async () => {
    await renderStats();
    expect(screen.getByText('Stats')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-range')).toBeOnTheScreen();
    expect(await screen.findByTestId('stats-review-text')).toHaveTextContent(
      'This week: logged 6 of 7 days, protein hit on 5.',
    );
  });

  it('eating: averages on logged days, days logged and the gap to the target', async () => {
    await renderStats();
    await waitFor(() =>
      expect(screen.getByTestId('stats-avg')).toHaveProp(
        'accessibilityLabel',
        'avg kcal / day: 2,000',
      ),
    );
    expect(screen.getByTestId('stats-days')).toHaveProp('accessibilityLabel', 'days logged: 5');
    expect(screen.getByTestId('stats-vs-target')).toHaveProp(
      'accessibilityLabel',
      'vs target: −5%',
    );
    expect(screen.getByTestId('stats-chart')).toBeOnTheScreen();
    expect(screen.getByTestId('stats-macro-protein')).toHaveProp(
      'accessibilityLabel',
      'Protein, 126 of 140 grams',
    );
    expect(screen.getByTestId('stats-macros')).toHaveTextContent(/Daily averages on logged days/);
  });

  it('offers 1W / 1M / 3M / 1Y, 1M first; switching asks for that many days', async () => {
    const user = userEvent.setup();
    const { calls } = await renderStats();
    expect(calls.monthly[0]).toMatchObject({ days: 30 });
    expect(screen.getByTestId('progress-range-7')).toHaveTextContent('1W');
    expect(screen.getByTestId('progress-range-365')).toHaveTextContent('1Y');
    await user.press(screen.getByTestId('progress-range-90'));
    await waitFor(() => expect(calls.monthly.at(-1)).toMatchObject({ days: 90 }));
    await user.press(screen.getByTestId('progress-range-365'));
    await waitFor(() => expect(calls.monthly.at(-1)).toMatchObject({ days: 365 }));
  });

  it('past a month the bars are weekly averages, and say so', async () => {
    const user = userEvent.setup();
    await renderStats();
    expect(screen.queryByTestId('stats-chart-weekly')).toBeNull();
    await user.press(screen.getByTestId('progress-range-90'));
    expect(await screen.findByTestId('stats-chart-weekly')).toBeOnTheScreen();
    expect(screen.getByTestId('stats-chart')).toHaveProp(
      'accessibilityLabel',
      expect.stringContaining('as weekly averages'),
    );
  });

  it('weight: current, the change over the range, Log weight and Edit entries', async () => {
    const user = userEvent.setup();
    await renderStats();
    expect(await screen.findByTestId('progress-weight-current')).toHaveTextContent('72.4 kg');
    // 1M holds one weigh-in: no trend yet, but every entry stays editable.
    expect(screen.queryByTestId('progress-weight-change')).toBeNull();
    expect(screen.getByTestId('progress-weight-few')).toBeOnTheScreen();
    await user.press(screen.getByTestId('progress-range-90'));
    expect(await screen.findByTestId('progress-weight-change')).toHaveTextContent(
      '−1.9 kg in 90 days',
    );
    await user.press(screen.getByTestId('progress-range-365'));
    expect(await screen.findByTestId('progress-weight-change')).toHaveTextContent(
      '−1.9 kg in a year',
    );
    await user.press(screen.getByTestId('stats-log-weight'));
    expect(screen.getByTestId('stats-weight-input')).toBeOnTheScreen();
    await user.press(screen.getByTestId('stats-edit-entries'));
    expect(screen.getByTestId('weight-entries')).toBeOnTheScreen();
  });

  it('Eating has no training section; the Strength tab holds it', async () => {
    const user = userEvent.setup();
    await renderStats();
    expect(screen.queryByTestId('stats-training')).toBeNull();
    await user.press(screen.getByTestId('stats-tab-strength'));
    expect(await screen.findByTestId('stats-training')).toBeOnTheScreen();
    expect(screen.queryByTestId('stats-eating')).toBeNull();
  });

  it("Train's link opens Stats on Strength", async () => {
    await renderStrength();
    expect(screen.getByTestId('stats-training')).toBeOnTheScreen();
  });

  it('strength: workouts, new PRs and streak in the range, weeks chart and a way to the details', async () => {
    const user = userEvent.setup();
    await renderStrength();
    const section = screen.getByTestId('stats-training');
    expect(within(section).getByTestId('stats-streak')).toHaveProp(
      'accessibilityLabel',
      'week streak: 7',
    );
    // 30 days: the sessions 2 and 9 days ago; 40 days ago is outside.
    expect(within(section).getByTestId('stats-workouts')).toHaveProp(
      'accessibilityLabel',
      'workouts: 2',
    );
    // 65 kg and 70 kg beat 60 kg; the first-ever 60 kg set is a baseline, not a PR.
    expect(within(section).getByTestId('stats-prs')).toHaveProp('accessibilityLabel', 'new PRs: 2');
    expect(within(section).getByTestId('stats-weeks-chart')).toBeOnTheScreen();
    await user.press(screen.getByTestId('stats-strength'));
    expect(router.push).toHaveBeenCalledWith('/training/stats');
  });

  it('strength: each lift in plain words, sets per muscle and the latest PRs', async () => {
    await renderStrength();
    // 65 → 70 kg × 8 in the last 30 days.
    expect(screen.getByTestId('stats-lift-bench')).toHaveProp(
      'accessibilityLabel',
      'bench: best set 70 kg × 8, 8% stronger',
    );
    expect(screen.getByTestId('stats-muscle-chest')).toHaveProp(
      'accessibilityLabel',
      expect.stringMatching(/^Chest: [\d.]+ sets? a week$/),
    );
    expect(
      within(screen.getByTestId('stats-recent-prs')).getAllByTestId('stats-pr-row'),
    ).toHaveLength(2);
  });

  it('1W shows this week day by day instead of a chart', async () => {
    const user = userEvent.setup();
    await renderStrength();
    await user.press(screen.getByTestId('progress-range-7'));
    expect(await screen.findByTestId('stats-this-week')).toBeOnTheScreen();
    expect(screen.queryByTestId('stats-weeks-chart')).toBeNull();
  });

  it('3M: older sessions and the PR timeline cover the whole range, with no "last 12 weeks"', async () => {
    const user = userEvent.setup();
    const { requests } = await renderStrength({
      'gym.session.list': () => ({
        items: [session('s0', 87, 55), session('s-old', 120, 50)],
        nextCursor: null,
      }),
      'gym.stats.prs': () => [
        pr('s3', 2),
        pr('s0', 87),
        pr('s-old', 120),
        { ...pr('s-first', 89), isFirst: true },
      ],
    });
    await user.press(screen.getByTestId('progress-range-90'));
    const section = screen.getByTestId('stats-training');
    // 2, 9 and 40 days ago from the cache + 87 days ago from the older page.
    await waitFor(() =>
      expect(within(section).getByTestId('stats-workouts')).toHaveProp(
        'accessibilityLabel',
        'workouts: 4',
      ),
    );
    expect(within(section).getByTestId('stats-prs')).toHaveProp('accessibilityLabel', 'new PRs: 2');
    expect(within(section).queryByText(/last 12 weeks/)).toBeNull();
    // The page starts right after the oldest cached session.
    expect(requests.find((c) => c.path === 'gym.session.list')?.input).toEqual({
      cursor: olderHistoryCursor(GYM.recentSessions),
      limit: 50,
    });
  });

  it('1Y: workouts from the week summaries, PRs from the timeline, no session paging', async () => {
    const user = userEvent.setup();
    const { requests } = await renderStrength({
      'gym.stats.prs': () => [pr('s3', 2), pr('s-old', 120), pr('s-older', 400)],
    });
    await user.press(screen.getByTestId('progress-range-365'));
    const section = screen.getByTestId('stats-training');
    // 7 weeks × 3 + the current week's 2.
    await waitFor(() =>
      expect(within(section).getByTestId('stats-workouts')).toHaveProp(
        'accessibilityLabel',
        'workouts: 23',
      ),
    );
    expect(within(section).getByTestId('stats-prs')).toHaveProp('accessibilityLabel', 'new PRs: 2');
    expect(requests.some((c) => c.path === 'gym.session.list')).toBe(false);
  });

  it('1W and 1M never ask the server for older history', async () => {
    const user = userEvent.setup();
    const { requests } = await renderStrength();
    await user.press(screen.getByTestId('progress-range-7'));
    await user.press(screen.getByTestId('progress-range-30'));
    expect(
      requests.some((c) =>
        ['gym.session.list', 'gym.stats.prs', 'gym.stats.e1rm', 'gym.stats.muscleVolume'].includes(
          c.path,
        ),
      ),
    ).toBe(false);
  });

  it('3M without the older history (offline/error) falls back to the cache and says so', async () => {
    const user = userEvent.setup();
    await renderStrength(); // no handlers for the history: both calls fail
    await user.press(screen.getByTestId('progress-range-90'));
    const section = screen.getByTestId('stats-training');
    expect(within(section).getByTestId('stats-workouts')).toHaveProp(
      'accessibilityLabel',
      'workouts, last 12 weeks: 3',
    );
  });

  it('someone without a gym profile gets a way to Train, not empty charts', async () => {
    const user = userEvent.setup();
    await renderStrength({}, makeBootstrap({ profile: null }));
    expect(screen.queryByTestId('stats-training')).toBeNull();
    await user.press(screen.getByTestId('stats-strength-open-train'));
    expect(router.push).toHaveBeenCalledWith('/train');
  });
});

describe('stats helpers', () => {
  it('needs three logged days before averaging (T-11.6)', () => {
    const two = monthly(7, [5, 6]).days;
    expect(eatingStats(two, 2100)).toMatchObject({ daysLogged: 2, enoughDays: false, avgKcal: 0 });
    const three = monthly(7, [4, 5, 6]).days;
    expect(eatingStats(three, 2100)).toMatchObject({
      enoughDays: true,
      avgKcal: 2000,
      diffPct: -5,
    });
  });

  it('formats the signed percentage with a real minus', () => {
    expect(signedPct(-7)).toBe('−7%');
    expect(signedPct(3)).toBe('+3%');
    expect(signedPct(0)).toBe('0%');
  });

  it('offline fallback: counts 90 days from the 12 weeks the bootstrap carries, and says so', () => {
    const stats = trainingStats(GYM, TODAY, 90);
    expect(stats.clipped).toBe(true);
    expect(stats.workouts).toBe(3);
  });

  it('with older history: exact over 90 days, de-duplicated, completed only', () => {
    const stats = trainingStatsWithHistory({
      bootstrap: GYM,
      olderSessions: [
        session('s1', 40, 60), // already cached: counted once
        session('s0', 89, 55), // first day of the range
        session('s-out', 90, 55), // one day too old
        { ...session('s-open', 86, 55), status: 'IN_PROGRESS' },
      ],
      prTimeline: [pr('s3', 2), pr('s-out', 90), { ...pr('s0', 89), isFirst: true }],
      today: TODAY,
      rangeDays: 90,
    });
    expect(stats).toEqual({ streakWeeks: 7, workouts: 4, newPrs: 1, clipped: false });
  });

  it('the older-history cursor follows the oldest cached session', () => {
    expect(olderHistoryCursor([])).toBeUndefined();
    const oldest = session('s1', 40, 60);
    expect(olderHistoryCursor([session('s3', 2, 70), oldest, session('s2', 9, 65)])).toBe(
      `${oldest.startedAt}|s1`,
    );
  });

  it('1Y training: workouts from the weeks touching the year, PRs from the timeline', () => {
    const stats = trainingStatsForYear({
      bootstrap: { ...GYM, weeks: [week(addDaysLocal(TODAY, -400), 'met', 5), ...GYM.weeks] },
      prTimeline: [pr('a', 10), { ...pr('b', 20), isFirst: true }, pr('c', 380)],
      today: TODAY,
      rangeDays: 365,
    });
    expect(stats).toEqual({ streakWeeks: 7, workouts: 23, newPrs: 1, clipped: false });
  });

  it('a lift in plain words: best set in the range and how much stronger', () => {
    const series = {
      exerciseId: 'bench',
      points: [
        { localDate: '2026-08-01', e1rmKg: 80, weightKg: 70, reps: 5 },
        { localDate: '2026-09-20', e1rmKg: 84, weightKg: 72.5, reps: 5 },
        { localDate: '2026-10-10', e1rmKg: 88, weightKg: 75, reps: 5 },
      ].map((p) => ({ ...p, sessionId: p.localDate, lowConfidence: false, isPr: false })),
      trend: [80, 84, 88],
    };
    const summary = liftSummary(series, '2026-09-16', '2026-10-15');
    expect(summary).toEqual({
      best: { weightKg: 75, reps: 5, localDate: '2026-10-10' },
      changePct: 5,
      points: [84, 88],
    });
    expect(liftSummary(series, '2026-10-12', '2026-10-15').best).toBeNull();
    expect(liftChangeText(5)).toBe('5% stronger');
    expect(liftChangeText(-3)).toBe('3% lighter');
    expect(liftChangeText(0)).toBe('About the same');
    expect(liftChangeText(null)).toBeNull();
  });

  it('picks the lifts trained in the range, compounds first', () => {
    const iso = { ...makeExercise('curl', 'Curl'), category: 'ISOLATION' as const };
    const curl = (id: string, daysBack: number): SessionSummaryDto => {
      const base = session(id, daysBack, 20);
      return { ...base, exercises: base.exercises.map((e) => ({ ...e, exerciseId: 'curl' })) };
    };
    const sessions = [curl('c1', 1), curl('c2', 3), curl('c3', 5), ...GYM.recentSessions];
    const picked = pickLifts(sessions, [...GYM.library, iso], addDaysLocal(TODAY, -29));
    expect(picked.map((e) => e.id)).toEqual(['bench', 'curl']);
  });

  it('sets per muscle: a week is a total, longer ranges are a weekly average', () => {
    const weeks = [
      { weekStart: '2026-09-28', sets: { chest: 10, back: 6 } },
      { weekStart: '2026-10-05', sets: { chest: 11, back: 0 } },
    ];
    expect(muscleSets(weeks, 7)).toEqual([
      { group: 'chest', sets: 21 },
      { group: 'back', sets: 6 },
    ]);
    expect(muscleSets(weeks, 14)).toEqual([
      { group: 'chest', sets: 11 },
      { group: 'back', sets: 3 },
    ]);
  });

  it('recent PRs: newest first, one per lift per workout, no first-ever sets', () => {
    const prs = recentPrs(
      [
        pr('s1', 9),
        { ...pr('s2', 2), kind: 'e1rm', weightKg: 60 },
        { ...pr('s2', 2), weightKg: 72.5 },
        { ...pr('s0', 1), isFirst: true },
        pr('old', 60),
      ],
      addDaysLocal(TODAY, -29),
      TODAY,
    );
    expect(prs.map((p) => [p.sessionId, p.weightKg])).toEqual([
      ['s2', 72.5],
      ['s1', 70],
    ]);
  });

  it('this week runs Monday to Sunday and marks trained days', () => {
    const days = thisWeekDays([session('t', 0, 60)], TODAY);
    expect(days).toHaveLength(7);
    expect(days.find((d) => d.isToday)).toMatchObject({ trained: true, future: false });
    expect(days.filter((d) => d.trained)).toHaveLength(1);
  });
});
