import { Keyboard, Platform, TextInput } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ExerciseDto, SessionSummaryDto } from '@chefer/types';
import { KeyboardAwareScrollView } from '@chefer/ui-mobile';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { ConsistencyView } from '../../src/features/gym/stats/consistency-view';
import {
  localBestSets,
  localE1rmSeries,
  localRepPrTable,
  topCompoundsByFrequency,
} from '../../src/features/gym/stats/local-engine';
import { LogWeightPrompt } from '../../src/features/gym/stats/log-weight-prompt';
import { PrTimelineView } from '../../src/features/gym/stats/pr-timeline-view';
import { StatsTab } from '../../src/features/gym/stats/stats-tab';
import { StrengthTrendView } from '../../src/features/gym/stats/strength-trend-view';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import { makeGymQueryClient, renderWithGym } from './gym-screen-test-utils';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useIsFocused: () => true,
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
afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

describe('local-engine (offline e1RM / rep-PR / frequency)', () => {
  it('computes e1RM per session with a rolling-max trend and marks the e1RM PR', () => {
    const series = localE1rmSeries(SESSIONS, 'bench');

    expect(series.points).toHaveLength(3);
    expect(series.points.map((p) => p.e1rmKg)).toEqual([123.33, 122.5, 132]);
    // s2 is a WEIGHT pr (105 > 100) but not an e1RM pr (122.5 < 123.33).
    expect(series.points[1]?.isPr).toBe(false);
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

// Gym dogfood #2: the decimal-pad bodyweight field has no Return key on iOS
// and could open under the keyboard at the bottom of the Stats scroll.
describe('LogWeightPrompt keyboard handling', () => {
  it('iOS: a "Done" bar above the decimal pad logs the weight and dismisses the keyboard', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    onlineManager.setOnline(true); // otherwise the mutation just pauses
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const user = userEvent.setup();
    await renderWithGym(<LogWeightPrompt />);

    const input = screen.getByTestId('log-weight-prompt-input');
    expect(input.props.inputAccessoryViewID).toBe('log-weight-prompt-return');
    await user.type(input, '82.5');
    await user.press(screen.getByTestId('log-weight-prompt-return-bar'));

    expect(dismiss).toHaveBeenCalled();
    await waitFor(() =>
      expect(jest.mocked(global.fetch)).toHaveBeenCalledWith(
        expect.stringContaining('tracker.logWeight'),
        expect.anything(),
      ),
    );
  });

  it("Android: no accessory bar; the keyboard's own Done submits and dismisses", async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await renderWithGym(<LogWeightPrompt />);

    const input = screen.getByTestId('log-weight-prompt-input');
    expect(input.props.inputAccessoryViewID).toBeUndefined();
    expect(input.props.returnKeyType).toBe('done');
    expect(screen.queryByTestId('log-weight-prompt-return-bar')).toBeNull();

    await fireEvent(input, 'submitEditing');
    expect(dismiss).toHaveBeenCalled();
  });

  it('scrolls itself clear of the keyboard on focus inside a KeyboardAwareScrollView', async () => {
    const measureLayout = jest.spyOn(TextInput.prototype, 'measureLayout');
    await renderWithGym(
      <KeyboardAwareScrollView>
        <LogWeightPrompt />
      </KeyboardAwareScrollView>,
    );

    // RN's TextInput mock shares one jest.fn across every instance and test.
    measureLayout.mockClear();
    await fireEvent(screen.getByTestId('log-weight-prompt-input'), 'focus');
    expect(measureLayout).toHaveBeenCalledTimes(1);
  });

  it("the Stats tab scroll is keyboard-aware, so the prompt's focus scroll reaches it", async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    setKvBackendForTests(createMemoryKvBackend());
    const measureLayout = jest.spyOn(TextInput.prototype, 'measureLayout');
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ library: [bench], recentSessions: SESSIONS, bodyweightKg: null }),
    );
    await renderWithGym(<StatsTab />, queryClient);

    // `automaticallyAdjustKeyboardInsets` is KeyboardAwareScrollView's iOS
    // signature — a plain ScrollView leaves it off.
    expect(
      (await screen.findByTestId('gym-stats-scroll')).props.automaticallyAdjustKeyboardInsets,
    ).toBe(true);

    await user.press(await screen.findByTestId('stats-strength-bodyweight-toggle'));
    // RN's TextInput mock shares one jest.fn across every instance and test.
    measureLayout.mockClear();
    await fireEvent(await screen.findByTestId('stats-strength-log-weight-input'), 'focus');
    expect(measureLayout).toHaveBeenCalledTimes(1);
  });
});
