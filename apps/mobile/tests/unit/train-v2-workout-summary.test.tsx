import { onlineManager } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { GymBootstrap, ProgressionDto, WorkoutSessionDoc } from '@chefer/types';
import { toSessionSummary } from '@chefer/utils';
import GymSummaryRoute from '../../app/gym/summary/[id]';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import {
  rememberFinished,
  resetFinishedForTests,
} from '../../src/features/gym/workout/finished-store';
import { resetShellStoreForTests, setShellV2Preview } from '../../src/features/shell/shell-store';
import { WorkoutSummaryV2 } from '../../src/features/shell/train/workout-summary-v2';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import {
  activeDoc,
  Providers,
  recordingLink,
  suggestion,
  testQueryClient,
  type LinkCall,
} from './gym-workout-helpers';

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
    dismissTo: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000999' }));
jest.mock('expo-notifications', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));

const { router, useLocalSearchParams } = jest.requireMock<{
  router: { dismissTo: jest.Mock; push: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');

/** The finished doc: bench 3 × 60 × 12 (top of 8–12), all ticked, 52 min. */
function finishedDoc(): WorkoutSessionDoc {
  const doc = activeDoc();
  const at = '2026-09-24T08:52:00.000Z';
  return {
    ...doc,
    status: 'COMPLETED',
    startedAt: '2026-09-24T08:00:00.000Z',
    finishedAt: at,
    localDate: '2026-09-24',
    exercises: doc.exercises.map((se) => ({
      ...se,
      sets: se.sets.map((s) => ({ ...s, reps: s.isWarmup ? s.reps : 12, completedAt: at })),
    })),
  };
}

/** A logged activity: one completed row with a user-entered kcal. */
function activityDoc(): WorkoutSessionDoc {
  const doc = finishedDoc();
  return {
    ...doc,
    name: 'Cycling class',
    exercises: doc.exercises.map((se) => ({
      ...se,
      exerciseId: 'cycling',
      sets: [
        {
          id: '00000000-0000-4000-8000-0000000000aa',
          position: 0,
          weightKg: 0,
          reps: 0,
          isWarmup: false,
          completedAt: doc.finishedAt,
          durationSec: 45 * 60,
          caloriesKcal: 310,
        },
      ],
    })),
  };
}

function progression(): ProgressionDto {
  const next = suggestion({
    kind: 'increase',
    weightKg: 62.5,
    reps: [8, 8, 8],
    reasonCode: 'TOP_OF_RANGE',
    deltaKg: 2.5,
    inputs: {
      repMin: 8,
      repMax: 12,
      loadType: 'WEIGHTED',
      equipment: 'BARBELL',
      lastWeightKg: 60,
      lastReps: [12, 12, 12],
    },
  });
  return {
    exerciseId: 'bench',
    repBucket: '8-12',
    override: null,
    suggestion: next,
    state: {
      workingWeightKg: 62.5,
      repTargets: [8, 8, 8],
      sets: 3,
      missStreak: 0,
      stallCount: 0,
      resetDates: [],
      calibrating: false,
      calibrationExposures: 0,
      justIncreased: true,
      preBreakWeightKg: null,
      lastExposureDate: '2026-09-24',
      lastTotalReps: 36,
      next,
    },
  };
}

function bootstrapAfterFinish(doc: WorkoutSessionDoc): GymBootstrap {
  return makeBootstrap({
    library: [makeExercise('bench', 'Bench Press')],
    progressions: [progression()],
    recentSessions: [toSessionSummary(doc)],
    streak: { current: 3, best: 5, flexTokens: 1, thisWeekSessions: 2, thisWeekGoal: 3 },
  });
}

/** An earlier, lighter bench session so today's 60 kg × 12 is a PR. */
function withEarlierHistory(bootstrap: GymBootstrap): GymBootstrap {
  const earlier = toSessionSummary({
    ...finishedDoc(),
    id: '00000000-0000-4000-8000-000000000123',
    startedAt: '2026-09-20T08:00:00.000Z',
    localDate: '2026-09-20',
    exercises: finishedDoc().exercises.map((se) => ({
      ...se,
      sets: se.sets.map((s) => ({ ...s, weightKg: 55 })),
    })),
  });
  return { ...bootstrap, recentSessions: [earlier, ...bootstrap.recentSessions] };
}

/** A StatTile shows exactly this value and caption. */
function expectTile(testID: string, value: string, label: string) {
  const tile = within(screen.getByTestId(testID));
  expect(tile.getByText(value)).toBeOnTheScreen();
  expect(tile.getByText(label)).toBeOnTheScreen();
}

async function renderSummary(
  id: string,
  bootstrap: GymBootstrap,
  calls: LinkCall[] = [],
  respond: (path: string) => unknown = () => null,
) {
  const queryClient = testQueryClient();
  queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
  await render(
    <Providers queryClient={queryClient} link={recordingLink(calls, (path) => respond(path))}>
      <WorkoutSummaryV2 id={id} />
    </Providers>,
  );
  return queryClient;
}

beforeEach(() => {
  resetFinishedForTests();
  resetShellStoreForTests();
  onlineManager.setOnline(true);
  router.dismissTo.mockClear();
  router.push.mockClear();
});

describe('WorkoutSummaryV2', () => {
  it('a gym session shows Duration / Sets / Exercises and never a kcal tile', async () => {
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderSummary(doc.id, bootstrapAfterFinish(doc));

    expect(screen.getByTestId('summary-title')).toHaveTextContent('Workout complete');
    expect(screen.getByTestId('summary-subline')).toHaveTextContent(/^Upper A · .*(Sep 24|24 Sep)/);
    expect(screen.getByTestId('summary-duration')).toHaveTextContent(/52 min/);
    expect(screen.getByTestId('summary-duration')).toHaveTextContent(/Duration/);
    expectTile('summary-sets', '3', 'Sets');
    expectTile('summary-exercises', '1', 'Exercise');
    expect(screen.queryByTestId('summary-kcal')).toBeNull();
    expect(screen.queryByText(/kcal/)).toBeNull();

    expect(screen.getByTestId('summary-week')).toHaveTextContent('2 of 3 this week');
    expect(screen.getByTestId('summary-streak')).toHaveTextContent(
      '3-week streak · 1 flex week saved',
    );
    // No earlier history: a first session is a baseline, not a PR.
    expect(screen.queryByTestId('summary-prs')).toBeNull();
  });

  it('a logged activity with user-entered kcal shows the kcal tile instead of Sets', async () => {
    const doc = activityDoc();
    rememberFinished(doc);
    await renderSummary(doc.id, makeBootstrap({ recentSessions: [toSessionSummary(doc)] }));

    expectTile('summary-kcal', '310', 'kcal you logged');
    expect(screen.queryByTestId('summary-sets')).toBeNull();
    expectTile('summary-exercises', '1', 'Exercise');
  });

  it('shows the PR card with the exercise and the record set', async () => {
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderSummary(doc.id, withEarlierHistory(bootstrapAfterFinish(doc)));

    expect(screen.getByTestId('summary-prs')).toBeOnTheScreen();
    expect(screen.getByTestId('summary-pr-bench-name')).toHaveTextContent('New PR · Bench Press');
    expect(screen.getByTestId('summary-pr-bench')).toHaveTextContent(/60 kg × 12/);
  });

  it('Next time: a labelled direction, the target, and Adjust opens the adjust sheet with the reason', async () => {
    const user = userEvent.setup();
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderSummary(doc.id, bootstrapAfterFinish(doc));

    expect(screen.getByTestId('summary-next-0-direction')).toHaveProp(
      'accessibilityLabel',
      'Going up',
    );
    expect(screen.getByTestId('summary-next-0-target')).toHaveTextContent('62.5 kg × 8 / 8 / 8');
    expect(screen.getByTestId('summary-next-0-adjust')).toHaveProp(
      'accessibilityHint',
      expect.stringMatching(/You hit 12 on every set, so \+2\.5 kg next time\./),
    );

    await user.press(screen.getByTestId('summary-next-0-adjust'));
    expect(await screen.findByTestId('adjust-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('adjust-sheet-reason')).toHaveTextContent(
      /You hit 12 on every set, so \+2\.5 kg next time\./,
    );
  });

  it('Adjust is disabled offline with an explanation', async () => {
    onlineManager.setOnline(false);
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderSummary(doc.id, bootstrapAfterFinish(doc));
    expect(screen.getByTestId('summary-next-0-adjust')).toBeDisabled();
    expect(screen.getByTestId('summary-offline')).toHaveTextContent(/needs a connection/);
  });

  it('the refuel row links the next planned meal', async () => {
    const user = userEvent.setup();
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderSummary(doc.id, { ...bootstrapAfterFinish(doc), bodyweightKg: 90 }, [], (path) =>
      path === 'dashboard.summary'
        ? { nextMeal: { mealType: 'dinner', recipe: { id: 'r-salmon', name: 'Miso Salmon' } } }
        : null,
    );
    expect(screen.getByTestId('summary-refuel-grams')).toHaveTextContent(
      'Next meal · aim for ~35 g protein',
    );
    await screen.findByText('Miso Salmon');
    await user.press(screen.getByTestId('summary-refuel-link'));
    expect(router.push).toHaveBeenCalledWith('/recipe/r-salmon');
  });

  it('Done returns to Today, like the legacy summary', async () => {
    const user = userEvent.setup();
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderSummary(doc.id, bootstrapAfterFinish(doc));
    await user.press(screen.getByTestId('summary-done'));
    expect(router.dismissTo).toHaveBeenCalledWith('/today');
  });

  it('an unknown session shows the saved-will-sync state with Done', async () => {
    const user = userEvent.setup();
    await renderSummary('missing', makeBootstrap());
    expect(screen.getByTestId('summary-missing')).toBeOnTheScreen();
    await user.press(screen.getByTestId('summary-done'));
    expect(router.dismissTo).toHaveBeenCalledWith('/today');
  });
});

describe('/gym/summary/[id] route', () => {
  async function renderRoute(doc: WorkoutSessionDoc) {
    useLocalSearchParams.mockReturnValue({ id: doc.id });
    const queryClient = testQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrapAfterFinish(doc));
    await render(
      <Providers queryClient={queryClient} link={recordingLink([], () => null)}>
        <GymSummaryRoute />
      </Providers>,
    );
  }

  it('renders the legacy summary in the old shell', async () => {
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderRoute(doc);
    await waitFor(() =>
      expect(screen.getByTestId('summary-title')).toHaveTextContent('Workout done'),
    );
  });

  it('renders the v2 summary in the new shell', async () => {
    setShellV2Preview(true);
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderRoute(doc);
    expect(screen.getByTestId('summary-title')).toHaveTextContent('Workout complete');
  });
});
