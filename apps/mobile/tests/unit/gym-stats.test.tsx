import { useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent } from '@testing-library/react-native';
import type { ExerciseDto, MuscleVolumeWeekDto, SessionSummaryDto } from '@chefer/types';
import { ConsistencyView } from '../../src/features/gym/stats/consistency-view';
import {
  localBestSets,
  localE1rmSeries,
  localRepPrTable,
  topCompoundsByFrequency,
} from '../../src/features/gym/stats/local-engine';
import { MonthlyRecapView } from '../../src/features/gym/stats/monthly-recap-view';
import { pickStackGroups } from '../../src/features/gym/stats/muscle-volume-view';
import { PrTimelineView } from '../../src/features/gym/stats/pr-timeline-view';
import { StatsTab } from '../../src/features/gym/stats/stats-tab';
import { StrengthTrendView } from '../../src/features/gym/stats/strength-trend-view';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import { makeGymQueryClient, renderWithGym } from './gym-screen-test-utils';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
let mockSearchParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false },
  usePathname: () => '/stats',
  useLocalSearchParams: () => mockSearchParams,
}));

function session(overrides: Partial<SessionSummaryDto> & { id: string }): SessionSummaryDto {
  return {
    name: 'Push Day',
    routineDayId: null,
    status: 'COMPLETED',
    localDate: '2026-01-01',
    startedAt: '2026-01-01T08:00:00.000Z',
    finishedAt: '2026-01-01T09:00:00.000Z',
    isDeload: false,
    exercises: [],
    ...overrides,
  };
}

const bench = makeExercise('bench', 'Bench Press'); // COMPOUND by default fixture
const isolation: ExerciseDto = { ...makeExercise('curl', 'Bicep Curl'), category: 'ISOLATION' };

// Three sessions of the same exercise: a weight PR (not e1RM) then an e1RM PR.
const SESSIONS: SessionSummaryDto[] = [
  session({
    id: 's1',
    localDate: '2026-01-01',
    exercises: [
      {
        exerciseId: 'bench',
        skipped: false,
        lastSetRir: 2,
        sets: [{ weightKg: 100, reps: 5, isWarmup: false, completed: true }],
      },
    ],
  }),
  session({
    id: 's2',
    localDate: '2026-01-08',
    exercises: [
      {
        exerciseId: 'bench',
        skipped: false,
        lastSetRir: 0,
        sets: [{ weightKg: 105, reps: 5, isWarmup: false, completed: true }],
      },
    ],
  }),
  session({
    id: 's3',
    localDate: '2026-01-15',
    exercises: [
      {
        exerciseId: 'bench',
        skipped: false,
        lastSetRir: 1,
        sets: [
          { weightKg: 60, reps: 10, isWarmup: true, completed: true },
          { weightKg: 110, reps: 5, isWarmup: false, completed: true },
        ],
      },
    ],
  }),
];

beforeEach(() => onlineManager.setOnline(false));
afterEach(() => onlineManager.setOnline(true));

describe('local-engine (offline e1RM / rep-PR / frequency)', () => {
  it('computes e1RM per session with a rolling-max trend and marks the e1RM PR', () => {
    const series = localE1rmSeries(SESSIONS, 'bench');

    expect(series.points).toHaveLength(3);
    expect(series.points.map((p) => p.e1rmKg)).toEqual([123.33, 122.5, 132]);
    // UX-GYM-33: a PR is ANY kind beaten, the same rule as the summary and History.
    // s2 is a WEIGHT pr (105 > 100) even though its e1RM (122.5) is lower.
    expect(series.points[1]?.isPr).toBe(true);
    // s3 (132) beats the prior e1RM max (123.33): an e1RM PR.
    expect(series.points[2]?.isPr).toBe(true);
    expect(series.trend).toEqual([123.33, 123.33, 132]);
  });

  it('ignores warm-up sets when computing e1RM', () => {
    const series = localE1rmSeries(SESSIONS, 'bench');
    // s3's warm-up (60kg x10) must not affect its point (110kg x5 wins).
    expect(series.points[2]?.weightKg).toBe(110);
  });

  it('tracks the best reps ever logged at each weight', () => {
    const table = localRepPrTable(SESSIONS, 'bench');
    // Every working weight is distinct across the fixture, one row each,
    // heaviest first.
    expect(table).toEqual([
      { weightKg: 110, reps: 5, localDate: '2026-01-15' },
      { weightKg: 105, reps: 5, localDate: '2026-01-08' },
      { weightKg: 100, reps: 5, localDate: '2026-01-01' },
    ]);
  });

  it('ranks the best sets by e1RM, most impressive first', () => {
    const best = localBestSets(SESSIONS, 'bench', 2);
    expect(best.map((p) => p.weightKg)).toEqual([110, 100]);
  });

  it('picks the top compounds by how often they appear in completed sessions', () => {
    const library = [bench, isolation];
    const top = topCompoundsByFrequency(SESSIONS, library, 3);
    expect(top.map((e) => e.id)).toEqual(['bench']);
  });

  it('returns nothing when there is no session history yet', () => {
    expect(topCompoundsByFrequency([], [bench], 3)).toEqual([]);
    expect(localE1rmSeries([], 'bench').points).toEqual([]);
    expect(localRepPrTable([], 'bench')).toEqual([]);
  });
});

describe('Stats empty states', () => {
  it('Strength trend: "log your first workout" for a brand-new user', async () => {
    const queryClient = makeGymQueryClient();
    const bootstrap = makeBootstrap({ library: [bench], recentSessions: [] });
    await renderWithGym(<StrengthTrendView bootstrap={bootstrap} />, queryClient);

    expect(await screen.findByTestId('stats-strength-trend-empty-state')).toBeTruthy();
    expect(screen.getByText('Log your first workout to see your trend')).toBeTruthy();
  });

  it('Strength trend: offers to log weight for the bodyweight overlay when none is known', async () => {
    const user = userEvent.setup();
    const bootstrap = makeBootstrap({
      library: [bench],
      recentSessions: SESSIONS,
      bodyweightKg: null,
    });
    const queryClient = makeGymQueryClient();
    await renderWithGym(<StrengthTrendView bootstrap={bootstrap} />, queryClient);

    await user.press(await screen.findByTestId('stats-strength-bodyweight-toggle'));
    expect(await screen.findByTestId('stats-strength-log-weight')).toBeTruthy();
  });

  it('UX-GYM-34: the Stats tab has no empty "More" placeholder', async () => {
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ library: [bench], recentSessions: SESSIONS }),
    );
    await renderWithGym(<StatsTab />, queryClient);

    await screen.findByTestId('gym-stats-scroll');
    expect(screen.queryByTestId('gym-stats-more-toggle')).toBeNull();
    expect(screen.queryByTestId('gym-stats-more')).toBeNull();
    expect(screen.queryByText(/§/)).toBeNull();
  });

  // UX-GYM-29: the tab stays mounted, so a new ?tab=history must move the segment.
  it('switches to History when the tab param changes after mount', async () => {
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ library: [bench], recentSessions: SESSIONS }),
    );
    let bump: () => void = () => undefined;
    function Harness() {
      const [, setN] = useState(0);
      bump = () => setN((n) => n + 1);
      return <StatsTab />;
    }
    await renderWithGym(<Harness />, queryClient);
    expect(await screen.findByTestId('gym-stats-scroll')).toBeOnTheScreen();

    mockSearchParams = { tab: 'history' };
    try {
      await act(() => {
        bump();
        return Promise.resolve();
      });
      expect(await screen.findByTestId('gym-stats-history-scroll')).toBeOnTheScreen();
    } finally {
      mockSearchParams = {};
    }
  });

  // UX-GYM-13: Today's "See September" opens Stats with the month pre-selected.
  it('opens the monthly recap on the month passed in ?month=', async () => {
    mockSearchParams = { month: '2026-09' };
    try {
      const queryClient = makeGymQueryClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ library: [bench], recentSessions: SESSIONS }),
      );
      await renderWithGym(<StatsTab />, queryClient);

      const recap = await screen.findByTestId('stats-monthly-recap');
      expect(recap).toHaveTextContent(/September 2026/);
    } finally {
      mockSearchParams = {};
    }
  });

  it('ignores a malformed ?month= and shows the current month', async () => {
    mockSearchParams = { month: 'September' };
    try {
      const queryClient = makeGymQueryClient();
      queryClient.setQueryData(
        gymBootstrapQueryKey,
        makeBootstrap({ library: [bench], recentSessions: SESSIONS }),
      );
      await renderWithGym(<StatsTab />, queryClient);
      expect(await screen.findByTestId('stats-monthly-recap')).not.toHaveTextContent(/September/);
    } finally {
      mockSearchParams = {};
    }
  });

  it('T-36.5: the History segment lists sessions and hides the overview views', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ library: [bench], recentSessions: SESSIONS }),
    );
    await renderWithGym(<StatsTab />, queryClient);

    expect(screen.getByTestId('gym-stats-scroll')).toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-stats-segment-history'));

    expect(screen.queryByTestId('gym-stats-scroll')).not.toBeOnTheScreen();
    expect(await screen.findByTestId('gym-history')).toBeOnTheScreen();

    await user.press(screen.getByTestId('gym-stats-segment-overview'));
    expect(await screen.findByTestId('gym-stats-scroll')).toBeOnTheScreen();
  });

  it('PR timeline: "No PRs yet" for a user with no personal records', async () => {
    const bootstrap = makeBootstrap({ library: [bench], recentSessions: [] });
    const queryClient = makeGymQueryClient();
    await renderWithGym(<PrTimelineView bootstrap={bootstrap} />, queryClient);

    expect(await screen.findByTestId('stats-pr-timeline-empty')).toBeTruthy();
  });

  it('PR timeline: lists PRs offline from the cached sessions', async () => {
    const bootstrap = makeBootstrap({ library: [bench], recentSessions: SESSIONS });
    const queryClient = makeGymQueryClient();
    await renderWithGym(<PrTimelineView bootstrap={bootstrap} />, queryClient);

    expect(await screen.findByTestId('stats-pr-row-0')).toBeTruthy();
    expect(screen.queryByTestId('stats-pr-timeline-empty')).toBeNull();
  });

  it('Consistency: renders the week grid from the cached bootstrap when offline', async () => {
    const bootstrap = makeBootstrap({
      weeks: [
        { weekStart: '2026-01-05', goal: 3, sessions: 3, status: 'met', flexTokens: 0 },
        { weekStart: '2026-01-12', goal: 3, sessions: 1, status: 'under', flexTokens: 0 },
      ],
      streak: { current: 1, best: 4, flexTokens: 0, thisWeekSessions: 1, thisWeekGoal: 3 },
    });
    const queryClient = makeGymQueryClient();
    await renderWithGym(<ConsistencyView bootstrap={bootstrap} />, queryClient);

    expect(await screen.findByTestId('stats-consistency-grid')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy(); // current streak
    expect(screen.getByText('4')).toBeTruthy(); // best streak
  });
});

describe('UX-GYM-33/34 stats polish', () => {
  it('pickStackGroups: top 5 by volume plus the selected group, in library order', () => {
    const weeks: MuscleVolumeWeekDto[] = [
      {
        weekStart: '2026-09-07',
        sets: { chest: 12, back: 10, quads: 9, glutes: 8, biceps: 7, triceps: 6 },
      },
      {
        weekStart: '2026-09-14',
        sets: { chest: 12, back: 10, quads: 9, glutes: 8, biceps: 7, calves: 1 },
      },
    ];
    const groups = pickStackGroups(weeks, 'calves');
    // Six colours at most, so six groups at most — never twelve sharing six colours.
    expect(groups).toHaveLength(6);
    expect(groups).toContain('calves'); // the selected group always gets a colour
    expect(groups).not.toContain('triceps'); // sixth by volume folds into "Other"
    expect(groups.indexOf('chest')).toBeLessThan(groups.indexOf('back')); // library order
  });

  it('the monthly recap shows an error with Retry, not "No data for this month"', async () => {
    onlineManager.setOnline(true);
    const bootstrap = makeBootstrap({ library: [bench] });
    await renderWithGym(<MonthlyRecapView bootstrap={bootstrap} />, makeGymQueryClient());

    expect(await screen.findByTestId('stats-monthly-recap-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('stats-monthly-recap-empty')).toBeNull();
    // The month is a name, never the raw YYYY-MM.
    expect(screen.getByTestId('stats-recap-month')).not.toHaveTextContent(/^\d{4}-\d{2}$/);
  });
});
