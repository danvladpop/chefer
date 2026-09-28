import type { EquipmentProfile, ExerciseMeta, SessionExerciseDoc } from '@chefer/types';
import {
  cardioPrescription,
  defaultSlotParams,
  isCardioMeta,
  prescribeFor,
  swapSlotParams,
  type SlotParams,
} from '../../src/features/gym/workout/workout-model';
import { makeExercise } from './gym-fixtures';

const PROFILE: EquipmentProfile = {
  unit: 'KG',
  barWeightKg: 20,
  platePairsKg: [20, 10, 5],
  dumbbellsKg: [],
  machineStepKg: 5,
  cableStepKg: 2.5,
  hasDipBelt: false,
  microPlates: false,
};

function cardioMeta(over: Partial<ExerciseMeta> = {}): ExerciseMeta {
  const dto = makeExercise('stationary-bike-upright', 'Stationary Bike');
  return { ...dto, trackingType: 'DURATION_DISTANCE', isTimed: true, ...over };
}

function strengthMeta(over: Partial<ExerciseMeta> = {}): ExerciseMeta {
  const dto = makeExercise('barbell-bench-press', 'Bench Press');
  return { ...dto, trackingType: 'WEIGHT_REPS', ...over };
}

describe('isCardioMeta (T-42.3)', () => {
  it('is true for DURATION_DISTANCE/DISTANCE/DURATION/INTERVALS, false for strength types', () => {
    expect(isCardioMeta(cardioMeta({ trackingType: 'DURATION_DISTANCE' }))).toBe(true);
    expect(isCardioMeta(cardioMeta({ trackingType: 'DISTANCE' }))).toBe(true);
    expect(isCardioMeta(cardioMeta({ trackingType: 'DURATION' }))).toBe(true);
    expect(isCardioMeta(cardioMeta({ trackingType: 'INTERVALS' }))).toBe(true);
    expect(isCardioMeta(strengthMeta({ trackingType: 'WEIGHT_REPS' }))).toBe(false);
    expect(isCardioMeta(strengthMeta({ trackingType: 'BODYWEIGHT_REPS' }))).toBe(false);
  });

  it('falls back to trackingTypeOf when trackingType is absent (pre-W2 cached row)', () => {
    const { trackingType: _drop, ...rest } = strengthMeta();
    expect(isCardioMeta(rest as ExerciseMeta)).toBe(false);
  });
});

describe('defaultSlotParams (AC1: a cardio exercise gets ONE entry — no sets/kg/RIR)', () => {
  it('cardio: exactly 1 "set", no rest, no RIR target', () => {
    expect(defaultSlotParams(cardioMeta())).toEqual({
      sets: 1,
      repMin: 1,
      repMax: 1,
      targetRir: 0,
      restSec: 0,
    });
  });

  it('strength: unchanged default of 3 sets from the exercise meta', () => {
    const meta = strengthMeta({ repMin: 6, repMax: 10, restSec: 180 });
    const params = defaultSlotParams(meta);
    expect(params.sets).toBe(3);
    expect(params.repMin).toBe(6);
    expect(params.repMax).toBe(10);
    expect(params.restSec).toBe(180);
  });
});

function sessionExercise(over: Partial<SessionExerciseDoc> = {}): SessionExerciseDoc {
  return {
    id: 'se1',
    exerciseId: 'barbell-bench-press',
    routineExerciseId: null,
    position: 0,
    repMin: 6,
    repMax: 10,
    targetRir: 2,
    restSec: 120,
    skipped: false,
    swappedFromId: null,
    lastSetRir: null,
    prescription: {
      kind: 'hold',
      weightKg: 60,
      reps: [8, 8, 8, 8],
      sets: 4,
      reasonCode: 'ADD_REPS',
      inputs: {},
      deltaKg: 0,
      engineVersion: 1,
    },
    notes: null,
    sets: [0, 1, 2, 3].map((position) => ({
      id: `s${position}`,
      position,
      weightKg: 60,
      reps: 8,
      isWarmup: false,
      completedAt: '2026-09-24T09:00:00.000Z',
    })),
    ...over,
  };
}

describe('swapSlotParams — cardio transitions reset to the cardio default', () => {
  const strengthParams: SlotParams = { sets: 4, repMin: 6, repMax: 10, targetRir: 2, restSec: 120 };
  const se = sessionExercise();

  it('swapping a strength exercise for a cardio one drops to the 1-entry cardio default', () => {
    const params = swapSlotParams(se, strengthMeta(), cardioMeta());
    expect(params).toEqual({ sets: 1, repMin: 1, repMax: 1, targetRir: 0, restSec: 0 });
  });

  it('swapping a cardio exercise for a strength one uses the strength default, not the cardio slot', () => {
    const cardioSe = sessionExercise({ repMin: 1, repMax: 1, targetRir: 0, restSec: 0 });
    const params = swapSlotParams(
      cardioSe,
      cardioMeta(),
      strengthMeta({ repMin: 8, repMax: 12, restSec: 90 }),
    );
    expect(params.sets).toBe(3); // defaultSlotParams, not the old cardio slot's 1
    expect(params.repMin).toBe(8);
  });

  it('swapping between two strength exercises keeps the slot (unaffected by the cardio change)', () => {
    const params = swapSlotParams(se, strengthMeta(), strengthMeta({ id: 'squat' }));
    expect(params).toEqual(strengthParams);
  });
});

describe('cardioPrescription (Δ2.2: no stored progression state)', () => {
  it('is a trivial hold/START placeholder — one 0kg×0 working set, no warmups', () => {
    const { prescription, warmups } = cardioPrescription();
    expect(prescription).toMatchObject({
      kind: 'hold',
      weightKg: 0,
      reps: [0],
      sets: 1,
      reasonCode: 'START',
    });
    expect(warmups).toEqual([]);
  });
});

describe('prescribeFor short-circuits to cardioPrescription for a cardio exercise', () => {
  it('never touches the strength engine or bootstrap.progressions for cardio', () => {
    const result = prescribeFor({
      meta: cardioMeta(),
      params: defaultSlotParams(cardioMeta()),
      bootstrap: undefined,
      profile: PROFILE,
      today: '2026-09-24',
      isDeload: false,
      isFirstForPattern: true,
    });
    expect(result).toEqual(cardioPrescription());
  });
});
