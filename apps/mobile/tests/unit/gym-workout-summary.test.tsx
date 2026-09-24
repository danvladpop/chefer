import { onlineManager } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { GymBootstrap, ProgressionDto, WorkoutSessionDoc } from '@chefer/types';
import { toSessionSummary } from '@chefer/utils';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import {
  rememberFinished,
  resetFinishedForTests,
} from '../../src/features/gym/workout/finished-store';
import { SummaryScreen } from '../../src/features/gym/workout/summary-screen';
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
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
    dismissTo: jest.fn(),
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000999' }));
jest.mock('expo-notifications', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));

const { router } = jest.requireMock<{ router: { dismissTo: jest.Mock } }>('expo-router');

/** The finished doc: bench 3 × 60 × 12 (top of 8–12), all ticked. */
function finishedDoc(): WorkoutSessionDoc {
  const doc = activeDoc();
  const at = '2026-09-24T08:52:00.000Z';
  return {
    ...doc,
    status: 'COMPLETED',
    startedAt: '2026-09-24T08:00:00.000Z',
    finishedAt: at,
    exercises: doc.exercises.map((se) => ({
      ...se,
      sets: se.sets.map((s) => ({ ...s, reps: s.isWarmup ? s.reps : 12, completedAt: at })),
    })),
  };
}

function progression(overrides: Partial<ProgressionDto> = {}): ProgressionDto {
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
    ...overrides,
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
      <SummaryScreen id={id} />
    </Providers>,
  );
  return queryClient;
}

beforeEach(() => {
  resetFinishedForTests();
  onlineManager.setOnline(true);
  router.dismissTo.mockClear();
});

describe('SummaryScreen', () => {
  it('shows duration, sets, the week ring, streak and the "Next time" decision', async () => {
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderSummary(doc.id, bootstrapAfterFinish(doc));

    expect(screen.getByTestId('summary-title')).toHaveTextContent('Workout done');
    expect(screen.getByTestId('summary-duration')).toHaveTextContent('52 min');
    expect(screen.getByTestId('summary-sets')).toHaveTextContent('3');
    expect(screen.getByTestId('summary-week')).toHaveTextContent('2 of 3 this week');
    expect(screen.getByTestId('summary-streak')).toHaveTextContent(
      '3-week streak · 1 flex week saved',
    );

    expect(screen.getByTestId('summary-next-time')).toHaveTextContent('Next time');
    expect(screen.getByTestId('summary-next-0-direction')).toHaveTextContent('↑');
    expect(screen.getByTestId('summary-next-0-target')).toHaveTextContent('62.5 kg × 8 / 8 / 8');
    expect(screen.getByTestId('summary-next-0-reason')).toHaveTextContent(
      /You hit 12 on every set, so \+2\.5 kg today\./,
    );
  });

  it('falls back to the cached recentSessions copy after a cold start', async () => {
    const doc = finishedDoc();
    await renderSummary(doc.id, bootstrapAfterFinish(doc));
    expect(screen.getByTestId('summary-sets')).toHaveTextContent('3');
    expect(screen.getByTestId('summary-next-0-direction')).toHaveTextContent('↑');
  });

  it('lists a PR set against earlier history', async () => {
    const doc = finishedDoc();
    rememberFinished(doc);
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
    const bootstrap = bootstrapAfterFinish(doc);
    await renderSummary(doc.id, {
      ...bootstrap,
      recentSessions: [earlier, ...bootstrap.recentSessions],
    });
    expect(screen.getByTestId('summary-prs')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-pr-bench')).toBeOnTheScreen();
  });

  it('Adjust is disabled offline with an explanation', async () => {
    onlineManager.setOnline(false);
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderSummary(doc.id, bootstrapAfterFinish(doc));
    expect(screen.getByTestId('summary-next-0-adjust')).toBeDisabled();
    expect(screen.getByTestId('summary-offline')).toHaveTextContent(/needs a connection/);
  });

  it('Adjust saves an override and updates the cached suggestion', async () => {
    const user = userEvent.setup();
    const doc = finishedDoc();
    rememberFinished(doc);
    const calls: LinkCall[] = [];
    const overridden = progression({
      override: { weightKg: 65, reps: [9, 9, 9], at: '2026-09-24T09:00:00.000Z' },
      suggestion: suggestion({
        kind: 'increase',
        weightKg: 65,
        reps: [9, 9, 9],
        reasonCode: 'USER_OVERRIDE',
        deltaKg: 2.5,
        inputs: { repMin: 8, repMax: 12, loadType: 'WEIGHTED', equipment: 'BARBELL' },
      }),
    });
    const queryClient = await renderSummary(doc.id, bootstrapAfterFinish(doc), calls, (path) =>
      path === 'gym.progression.setOverride' ? overridden : null,
    );

    await user.press(screen.getByTestId('summary-next-0-adjust'));
    await user.press(screen.getByTestId('adjust-weight-inc'));
    await user.press(screen.getByTestId('adjust-reps-inc'));
    expect(screen.getByTestId('adjust-reps-all')).toHaveTextContent('All sets: 9 / 9 / 9');
    await user.press(screen.getByTestId('adjust-sheet-save'));

    await waitFor(() =>
      expect(calls.find((c) => c.path === 'gym.progression.setOverride')?.input).toEqual({
        exerciseId: 'bench',
        repBucket: '8-12',
        weightKg: 65,
        reps: [9, 9, 9],
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('summary-next-0-reason')).toHaveTextContent(
        'Your own target: 65 kg, 9 reps.',
      ),
    );
    const cached = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey);
    // Local engine state is kept; only the override and suggestion change.
    expect(cached?.progressions[0]?.state.lastExposureDate).toBe('2026-09-24');
    expect(cached?.progressions[0]?.override?.weightKg).toBe(65);
  });

  it('Done returns to Today', async () => {
    const user = userEvent.setup();
    const doc = finishedDoc();
    rememberFinished(doc);
    await renderSummary(doc.id, bootstrapAfterFinish(doc));
    await user.press(screen.getByTestId('summary-done'));
    expect(router.dismissTo).toHaveBeenCalledWith('/today');
  });
});
