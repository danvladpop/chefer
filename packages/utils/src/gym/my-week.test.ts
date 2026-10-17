import { describe, expect, it } from 'vitest';
import { routineDocSchema, type RoutineDayDto, type RoutineDto } from '@chefer/types';
import {
  applyMyWeek,
  myWeekOf,
  myWeekPlanOf,
  myWeekSummary,
  newMyWeekDays,
  plannedDayCount,
  type MyWeekPlan,
} from './my-week';

// My week = the "Keep it simple" view of the ONE active routine (ADR 0001).

const exercise = {
  id: 'rx1',
  exerciseId: 'barbell-bench-press',
  position: 0,
  sets: 3,
  repMin: 8,
  repMax: 12,
  targetRir: 2,
  restSec: 120,
  supersetGroup: null,
  notes: null,
};

function day(over: Partial<RoutineDayDto> & Pick<RoutineDayDto, 'id' | 'position'>): RoutineDayDto {
  return { name: 'Day', plannedWeekday: null, workoutType: null, exercises: [], ...over };
}

function routine(days: RoutineDayDto[]): RoutineDto {
  return {
    id: 'r1',
    name: 'My week',
    templateKey: null,
    isActive: true,
    nextDayId: null,
    version: 3,
    archived: false,
    updatedAt: '2026-10-17T10:00:00.000Z',
    days,
  };
}

const REST: MyWeekPlan = [null, null, null, null, null, null, null];
const plan = (entries: Record<number, MyWeekPlan[number]>): MyWeekPlan =>
  REST.map((t, i) => entries[i] ?? t);

describe('myWeekOf', () => {
  it('is all Rest without a routine', () => {
    const view = myWeekOf(null);
    expect(view.rows.map((r) => r.label)).toEqual(Array(7).fill('Rest'));
    expect(view.plannedCount).toBe(0);
  });

  it('shows pinned days by weekday and lists unpinned ones as unscheduled', () => {
    const view = myWeekOf(
      routine([
        day({ id: 'a', position: 0, name: 'Yoga', plannedWeekday: 1, workoutType: 'YOGA' }),
        day({ id: 'b', position: 1, name: 'Push A', plannedWeekday: 0, exercises: [exercise] }),
        day({ id: 'c', position: 2, name: 'Pull A', exercises: [exercise] }),
        // A second day on Tuesday: one planned workout per weekday → unscheduled.
        day({ id: 'd', position: 3, name: 'Legs', plannedWeekday: 1, exercises: [exercise] }),
      ]),
    );
    expect(view.rows[0]?.label).toBe('Push A');
    expect(view.rows[1]?.label).toBe('Yoga');
    expect(view.unscheduled.map((d) => d.id)).toEqual(['c', 'd']);
    expect(myWeekPlanOf(view)).toEqual(['STRENGTH_OTHER', 'YOGA', null, null, null, null, null]);
  });
});

describe('applyMyWeek', () => {
  it('adds type-only days, which pass the routine wire schema with zero exercises', () => {
    const res = applyMyWeek(
      routine([
        day({ id: 'a', position: 0, name: 'Yoga', plannedWeekday: 1, workoutType: 'YOGA' }),
      ]),
      plan({ 1: 'YOGA', 4: 'CARDIO_MACHINES' }),
    );
    expect(res.kind).toBe('doc');
    if (res.kind !== 'doc') return;
    expect(routineDocSchema.safeParse(res.doc).success).toBe(true);
    expect(res.doc.days.map((d) => [d.name, d.plannedWeekday, d.workoutType])).toEqual([
      ['Yoga', 1, 'YOGA'],
      ['Cardio machines', 4, 'CARDIO_MACHINES'],
    ]);
  });

  it('Rest removes a type-only day but only unpins a day with exercises (nothing is lost)', () => {
    const res = applyMyWeek(
      routine([
        day({ id: 'y', position: 0, name: 'Yoga', plannedWeekday: 1, workoutType: 'YOGA' }),
        day({ id: 'p', position: 1, name: 'Push A', plannedWeekday: 0, exercises: [exercise] }),
        day({ id: 'u', position: 2, name: 'Upper', plannedWeekday: 3, workoutType: 'UPPER_BODY' }),
      ]),
      plan({ 3: 'UPPER_BODY' }),
    );
    if (res.kind !== 'doc') throw new Error(res.kind);
    expect(res.doc.days.map((d) => [d.id, d.plannedWeekday])).toEqual([
      ['p', null],
      ['u', 3],
    ]);
    expect(res.doc.days[0]?.exercises).toHaveLength(1);
  });

  it('retypes a day: a type-only day takes the label, a day with exercises keeps its name', () => {
    const res = applyMyWeek(
      routine([
        day({ id: 'y', position: 0, name: 'Yoga', plannedWeekday: 1, workoutType: 'YOGA' }),
        day({ id: 'p', position: 1, name: 'Push A', plannedWeekday: 0, exercises: [exercise] }),
      ]),
      plan({ 0: 'UPPER_BODY', 1: 'PILATES' }),
    );
    if (res.kind !== 'doc') throw new Error(res.kind);
    expect(res.doc.days.map((d) => [d.name, d.workoutType])).toEqual([
      ['Pilates', 'PILATES'],
      ['Push A', 'UPPER_BODY'],
    ]);
  });

  it('leaves unscheduled days alone and refuses more than 7 days', () => {
    const unscheduled = Array.from({ length: 4 }, (_, i) =>
      day({ id: `u${i}`, position: i, name: `Day ${i}`, exercises: [exercise] }),
    );
    expect(applyMyWeek(routine(unscheduled), plan({ 0: 'YOGA', 1: 'YOGA', 2: 'YOGA' })).kind).toBe(
      'doc',
    );
    expect(
      applyMyWeek(routine(unscheduled), plan({ 0: 'YOGA', 1: 'YOGA', 2: 'YOGA', 3: 'YOGA' })).kind,
    ).toBe('too_many_days');
  });

  it('is empty when every day is Rest and nothing else is left', () => {
    expect(
      applyMyWeek(
        routine([day({ id: 'y', position: 0, plannedWeekday: 1, workoutType: 'YOGA' })]),
        REST,
      ).kind,
    ).toBe('empty');
  });
});

describe('first week, goal and summary', () => {
  it('builds type-only days and counts planned days for the weekly goal', () => {
    const p = plan({ 0: 'UPPER_BODY', 1: 'YOGA', 3: 'LOWER_BODY', 4: 'CARDIO_MACHINES' });
    expect(newMyWeekDays(p).map((d) => d.plannedWeekday)).toEqual([0, 1, 3, 4]);
    expect(plannedDayCount(p)).toBe(4);
    expect(myWeekSummary(plan({ 1: 'YOGA', 4: 'CARDIO_MACHINES' }))).toBe(
      'Tue · Yoga, Fri · Cardio machines',
    );
    expect(myWeekSummary(REST)).toBe('No workouts planned');
  });
});
