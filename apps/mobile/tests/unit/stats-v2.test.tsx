import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { SessionSummaryDto, WeekSummary } from '@chefer/types';
import { addDaysLocal } from '@chefer/utils';
import ProgressScreen from '../../app/progress';
import { localDate } from '../../src/features/gym/offline/ids';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import {
  eatingStats,
  signedPct,
  trainingStats,
  weekCells,
} from '../../src/features/shell/stats/stats-helpers';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';
import { makeBootstrap } from './gym-fixtures';

// 10 Oct redesign — Progress in the new shell is "Stats" (board Progress):
// one range for eating (tiles, calorie bars with the target, average macros
// vs targets), the weekly review in one line, weight with Log weight and Edit
// entries, and a Training section only for people who train.

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
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
  await screen.findByTestId('stats-avg');
  return { ...utils, calls: server.calls };
}

beforeEach(() => jest.clearAllMocks());

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

  it('switching the range asks for that many days', async () => {
    const user = userEvent.setup();
    const { calls } = await renderStats();
    await user.press(screen.getByTestId('progress-range-90'));
    await waitFor(() => expect(calls.monthly.at(-1)).toMatchObject({ days: 90 }));
  });

  it('weight: current, the 90-day change, Log weight and Edit entries', async () => {
    const user = userEvent.setup();
    await renderStats();
    expect(await screen.findByTestId('progress-weight-current')).toHaveTextContent('72.4 kg');
    expect(screen.getByTestId('progress-weight-change')).toHaveTextContent('−1.9 kg in 90 days');
    await user.press(screen.getByTestId('stats-log-weight'));
    expect(screen.getByTestId('stats-weight-input')).toBeOnTheScreen();
    await user.press(screen.getByTestId('stats-edit-entries'));
    expect(screen.getByTestId('weight-entries')).toBeOnTheScreen();
  });

  it('training: streak, workouts and new PRs in the range, the last 8 weeks and a way to history', async () => {
    const user = userEvent.setup();
    await renderStats();
    const section = screen.getByTestId('stats-training');
    expect(within(section).getByTestId('stats-streak')).toHaveProp(
      'accessibilityLabel',
      'week streak: 7',
    );
    // 28 days: the sessions 2 and 9 days ago; 40 days ago is outside.
    expect(within(section).getByTestId('stats-workouts')).toHaveProp(
      'accessibilityLabel',
      'workouts: 2',
    );
    // 65 kg and 70 kg beat 60 kg; the first-ever 60 kg set is a baseline, not a PR.
    expect(within(section).getByTestId('stats-prs')).toHaveProp('accessibilityLabel', 'new PRs: 2');
    expect(within(section).getByTestId('stats-weeks')).toHaveTextContent(/F/);
    expect(within(section).getByTestId('stats-weeks')).toHaveTextContent(/2\/4/);
    await user.press(screen.getByTestId('stats-strength'));
    expect(router.push).toHaveBeenCalledWith('/training/stats');
  });

  it('no training section for someone without a gym profile', async () => {
    await renderStats({}, makeBootstrap({ profile: null }));
    expect(screen.queryByTestId('stats-training')).toBeNull();
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

  it('turns weeks into ✓ / F / P / x-of-goal cells, spoken in words', () => {
    const cells = weekCells([week('2026-09-28', 'met'), week('2026-10-05', 'current', 2)]);
    expect(cells.map((c) => c.text)).toEqual(['✓', '2/4']);
    expect(cells[1]?.label).toBe('Week of 2026-10-05: this week, 2 of 4');
  });

  it('counts 90 days from the 12 weeks the bootstrap carries, and says so', () => {
    const stats = trainingStats(GYM, TODAY, 90);
    expect(stats.clipped).toBe(true);
    expect(stats.workouts).toBe(3);
  });
});
