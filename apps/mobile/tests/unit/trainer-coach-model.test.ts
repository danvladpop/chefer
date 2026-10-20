import { BOOKING_COPY } from '@chefer/types';
import { equipmentOf, unitOf } from '../../src/features/gym/workout/workout-model';
import {
  bookingIdOf,
  bookingKeyOf,
  coachedBootstrap,
  coachingLabel,
  confirmLoads,
  priorFromLastTime,
  startCoachedDoc,
} from '../../src/features/trainer-coach/coach-model';
import { coachedMiniBarGroups } from '../../src/features/trainer-coach/coached-mini-bar';
import type { CoachedWorkoutRecord } from '../../src/features/trainer-coach/coached-session-store';
import { loggedByLabel, loggedByYouLabel } from '../../src/features/trainer-coach/history-labels';
import { makeBootstrap, makeExercise, uuid } from './gym-fixtures';
import { BOOKING, coachStart, ION, MARIA, nextWorkout, prescribed } from './trainer-coach-fixtures';

// Trainer mode M3 (trainer-mode.md §6.7): the client's prescription → the logger's state, the
// labels the coached workout shows (mini bar, history).

let n = 0;
const deps = () => ({
  newId: () => uuid(++n),
  now: '2026-10-19T18:00:00.000Z',
  localDate: '2026-10-19',
});

describe('prescription → logger state', () => {
  it('starts the CLIENT’s routine day with their prescription and fresh client UUIDs', () => {
    const start = coachStart(MARIA, 'Maria Pop', {
      workout: nextWorkout({
        exercises: [
          prescribed('squat', { warmups: [{ weightKg: 40, reps: 5 }] }),
          prescribed('rdl', {
            position: 1,
            suggestion: { ...prescribed('rdl').suggestion, weightKg: 80 },
          }),
        ],
      }),
    });
    const doc = startCoachedDoc(start, deps());
    expect(doc).toMatchObject({
      status: 'IN_PROGRESS',
      routineId: 'routine-maria',
      routineDayId: 'day-lower-a',
      name: 'Lower body A',
      localDate: '2026-10-19',
    });
    expect(doc?.exercises.map((e) => e.exerciseId)).toEqual(['squat', 'rdl']);
    // 1 warm-up + 3 working sets at the client's suggested load.
    expect(doc?.exercises[0]?.sets).toHaveLength(4);
    expect(doc?.exercises[1]?.sets.every((s) => s.weightKg === 80)).toBe(true);
    const ids = [
      doc?.id,
      ...(doc?.exercises.flatMap((e) => [e.id, ...e.sets.map((s) => s.id)]) ?? []),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no routine → no workout to start', () => {
    expect(startCoachedDoc(coachStart(MARIA, 'Maria Pop', { workout: null }), deps())).toBeNull();
  });

  it('reads in the CLIENT’s unit, the trainer’s equipment, and the client’s exercise meta first', () => {
    const trainer = makeBootstrap({
      library: [
        { ...makeExercise('squat', 'Trainer squat name') },
        makeExercise('bench'),
        { ...makeExercise('my-custom'), ownerId: 'trainer-1' },
        { ...makeExercise('old'), archived: true },
      ],
    });
    const start = coachStart(MARIA, 'Maria Pop', {
      client: { id: MARIA, name: 'Maria Pop', unit: 'LB' },
    });
    const bootstrap = coachedBootstrap(start, trainer);
    expect(unitOf(bootstrap)).toBe('LB');
    expect(equipmentOf(bootstrap).barWeightKg).toBe(20);
    expect(bootstrap.library.map((e) => e.id)).toEqual(['squat', 'bench']);
    expect(bootstrap.library[0]?.name).toBe('Back Squat');
    // Nothing in the logger may touch the client's routine, and no progression but theirs applies.
    expect(bootstrap.activeRoutine).toBeNull();
    expect(bootstrap.progressions).toEqual([]);
    expect(bootstrap.nextWorkout).toBe(start.workout);
  });

  it('a trainer without a gym profile still gets the client’s unit', () => {
    const bootstrap = coachedBootstrap(
      coachStart(MARIA, 'Maria Pop', { client: { id: MARIA, name: 'Maria', unit: 'LB' } }),
      undefined,
    );
    expect(unitOf(bootstrap)).toBe('LB');
  });

  it('the client’s last exposures become the history the "Last time" column reads', () => {
    const prior = priorFromLastTime(
      nextWorkout({
        exercises: [
          prescribed('squat', {
            lastTime: { localDate: '2026-10-12', sets: [{ weightKg: 70, reps: 8 }], lastSetRir: 2 },
          }),
          prescribed('rdl', { lastTime: null }),
        ],
      }),
    );
    expect(prior).toHaveLength(1);
    expect(prior[0]).toMatchObject({ localDate: '2026-10-12', status: 'COMPLETED' });
    expect(prior[0]?.exercises[0]).toMatchObject({
      exerciseId: 'squat',
      sets: [{ weightKg: 70, reps: 8, isWarmup: false, completed: true }],
    });
  });
});

describe('confirmed loads', () => {
  it('drops loadConfirmed: false — the trainer saw every set', () => {
    const doc = startCoachedDoc(coachStart(MARIA, 'Maria Pop'), deps());
    if (!doc) throw new Error('no doc');
    const withUnconfirmed = {
      ...doc,
      exercises: doc.exercises.map((se) => ({
        ...se,
        sets: se.sets.map((s) => ({ ...s, loadConfirmed: false as const })),
      })),
    };
    const confirmed = confirmLoads(withUnconfirmed);
    expect(confirmed.exercises.flatMap((e) => e.sets).some((s) => 'loadConfirmed' in s)).toBe(
      false,
    );
    // Untouched docs keep their identity.
    expect(confirmLoads(doc)).toBe(doc);
  });
});

describe('labels', () => {
  it('booking keys round-trip, `none` = no booking', () => {
    expect(bookingKeyOf(null)).toBe('none');
    expect(bookingIdOf('none')).toBeNull();
    expect(bookingIdOf(bookingKeyOf(BOOKING))).toBe(BOOKING);
  });

  it('mini bar: "Coaching Maria", a group "Coaching Maria + 1"', () => {
    expect(coachingLabel(['Maria'])).toBe(BOOKING_COPY.coach.miniBar('Maria'));
    expect(coachingLabel(['Maria', 'Ion'])).toBe('Coaching Maria + 1');
  });

  it('mini bar groups: one bar per booking, this trainer’s workouts only', () => {
    const record = (clientId: string, name: string, bookingId: string | null, ownerId: string) =>
      ({
        v: 1,
        ownerId,
        bookingId,
        client: { id: clientId, name, unit: 'KG' },
        workout: nextWorkout(),
        exercises: [],
        order: clientId === MARIA ? 0 : 1,
        doc: { ...startCoachedDoc(coachStart(clientId, name), deps()) },
      }) as CoachedWorkoutRecord;
    const groups = coachedMiniBarGroups(
      [
        record(MARIA, 'Maria Pop', BOOKING, 'trainer-1'),
        record(ION, 'Ion Rusu', BOOKING, 'trainer-1'),
        record(MARIA, 'Maria Pop', null, 'someone-else'),
      ],
      'trainer-1',
    );
    expect(groups).toEqual([
      expect.objectContaining({
        bookingKey: BOOKING,
        label: 'Coaching Maria + 1',
        dayName: 'Lower body A',
        clientId: MARIA,
      }),
    ]);
  });

  it('history: "Logged by Ana" for the client, "Logged by you" for the trainer', () => {
    expect(loggedByLabel({ loggedBy: { name: 'Ana' } })).toBe('Logged by Ana');
    expect(loggedByLabel({})).toBeNull();
    expect(loggedByLabel(undefined)).toBeNull();
    expect(loggedByYouLabel({ loggedByTrainer: true })).toBe('Logged by you');
    expect(loggedByYouLabel({})).toBeNull();
  });
});
