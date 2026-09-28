import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SessionExerciseDoc, SessionSummaryDto } from '@chefer/types';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { CardioEntry } from '../../src/features/gym/workout/cardio-entry';
import { resetCardioTimerForTests } from '../../src/features/gym/workout/cardio-timer';
import type { CardioLogFields } from '../../src/features/gym/workout/exercise-card';
import { makeExercise } from './gym-fixtures';

// T-42.3 (UX-42): AC1 (no kg/sets/RIR), AC3 ("Same as last time" → "Log it"
// = 2 taps), AC9 (the entry works for a distance-tracking bike). The 3 h
// kill-survival case is covered directly in gym-cardio-timer.test.ts.

const BIKE = makeExercise('stationary-bike-upright', 'Stationary Bike');
const bikeMeta = { ...BIKE, trackingType: 'DURATION_DISTANCE' as const };

function cardioSe(over: Partial<SessionExerciseDoc> = {}): SessionExerciseDoc {
  return {
    id: 'se-bike',
    exerciseId: BIKE.id,
    routineExerciseId: null,
    position: 0,
    repMin: 1,
    repMax: 1,
    targetRir: 0,
    restSec: 0,
    skipped: false,
    swappedFromId: null,
    lastSetRir: null,
    prescription: {
      kind: 'hold',
      weightKg: 0,
      reps: [0],
      sets: 1,
      reasonCode: 'START',
      inputs: {},
      deltaKg: 0,
      engineVersion: 1,
    },
    notes: null,
    sets: [
      {
        id: 'set-1',
        position: 0,
        weightKg: 0,
        reps: 0,
        isWarmup: false,
        completedAt: null,
      },
    ],
    ...over,
  };
}

function priorWithExposure(
  fields: { durationSec: number; distanceM?: number; intensityRpe?: number } = {
    durationSec: 1200,
  },
): SessionSummaryDto[] {
  return [
    {
      id: 's1',
      name: 'Bike day',
      routineDayId: null,
      status: 'COMPLETED',
      localDate: '2026-09-20',
      startedAt: '2026-09-20T08:00:00.000Z',
      finishedAt: '2026-09-20T08:30:00.000Z',
      isDeload: false,
      exercises: [
        {
          exerciseId: BIKE.id,
          skipped: false,
          lastSetRir: null,
          sets: [
            {
              weightKg: 0,
              reps: 0,
              isWarmup: false,
              completed: true,
              ...fields,
            },
          ],
        },
      ],
    },
  ];
}

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetCardioTimerForTests();
});

describe('CardioEntry (T-42.3)', () => {
  it('AC1: never shows a kg/sets/RIR control — just Timer/Enter, distance, effort, Log it', async () => {
    await render(
      <CardioEntry
        se={cardioSe()}
        meta={bikeMeta}
        unit="KG"
        prior={[]}
        onLogIt={jest.fn()}
        testID="cardio"
      />,
    );
    expect(screen.getByTestId('cardio-mode')).toBeTruthy();
    expect(screen.getByTestId('cardio-log-it')).toBeTruthy();
    expect(screen.queryByText(/RIR/i)).toBeNull();
    expect(screen.queryByText(/kg/)).toBeNull();
  });

  it('Log it starts disabled with nothing entered', async () => {
    await render(
      <CardioEntry
        se={cardioSe()}
        meta={bikeMeta}
        unit="KG"
        prior={[]}
        onLogIt={jest.fn()}
        testID="cardio"
      />,
    );
    const logIt = screen.getByTestId('cardio-log-it') as unknown as {
      props: { accessibilityState?: { disabled?: boolean } };
    };
    expect(logIt.props.accessibilityState?.disabled).toBe(true);
  });

  it('AC3: "Same as last time" then "Log it" is exactly 2 taps and logs the prior duration/distance/effort', async () => {
    const onLogIt = jest.fn() as jest.MockedFunction<(fields: CardioLogFields) => void>;
    await render(
      <CardioEntry
        se={cardioSe()}
        meta={bikeMeta}
        unit="KG"
        prior={priorWithExposure({ durationSec: 1200, distanceM: 8000, intensityRpe: 6 })}
        onLogIt={onLogIt}
        testID="cardio"
      />,
    );

    await fireEvent.press(screen.getByTestId('cardio-same-as-last-time')); // tap 1
    await fireEvent.press(screen.getByTestId('cardio-log-it')); // tap 2

    expect(onLogIt).toHaveBeenCalledTimes(1);
    const fields = onLogIt.mock.calls[0]?.[0];
    expect(fields?.durationSec).toBe(1200);
    expect(fields?.distanceM).toBeCloseTo(8000, 0);
    expect(fields?.intensityRpe).toBe(6);
  });

  it('entering a duration chip enables Log it and logs just the duration (no distance/effort set)', async () => {
    const onLogIt = jest.fn();
    await render(
      <CardioEntry
        se={cardioSe()}
        meta={bikeMeta}
        unit="KG"
        prior={[]}
        onLogIt={onLogIt}
        testID="cardio"
      />,
    );

    // Switch to Enter mode via the segmented control's option.
    await fireEvent.press(screen.getByText('Enter'));
    await fireEvent.press(screen.getByTestId('cardio-duration-20'));
    await fireEvent.press(screen.getByTestId('cardio-log-it'));

    expect(onLogIt).toHaveBeenCalledWith({ durationSec: 1200 });
  });

  it('an already-logged entry shows "Logged." and hides the entry controls', async () => {
    await render(
      <CardioEntry
        se={cardioSe({
          sets: [
            {
              id: 'set-1',
              position: 0,
              weightKg: 0,
              reps: 0,
              isWarmup: false,
              completedAt: '2026-09-24T09:00:00.000Z',
              durationSec: 1200,
            },
          ],
        })}
        meta={bikeMeta}
        unit="KG"
        prior={[]}
        onLogIt={jest.fn()}
        testID="cardio"
      />,
    );
    expect(screen.getByTestId('cardio-logged')).toBeTruthy();
    expect(screen.queryByTestId('cardio-log-it')).toBeNull();
  });
});
