import { describe, expect, it, vi } from 'vitest';
import type { GymProfileDto, RoutineDto, WorkoutType } from '@chefer/types';
import { MyWeekService } from './my-week.service.js';

vi.mock('../targets/targets-changed.js', () => ({ notifyTargetsChanged: vi.fn() }));
vi.mock('./routine.service.js', () => ({ routineService: {} }));
vi.mock('./gym-profile.service.js', () => ({ gymProfileService: {} }));

const USER = 'u1';
const week = (entries: Record<number, WorkoutType>) =>
  Array.from({ length: 7 }, (_, i) => entries[i] ?? null);

function activeRoutine(days: RoutineDto['days']): RoutineDto {
  return {
    id: 'r1',
    name: 'My week',
    templateKey: null,
    isActive: true,
    nextDayId: null,
    version: 5,
    archived: false,
    updatedAt: '2026-10-17T10:00:00.000Z',
    days,
  };
}

function setup(
  active: RoutineDto | null,
  profile: Partial<GymProfileDto> | null = { weeklyGoal: 3 },
) {
  const routines = {
    getActive: vi.fn().mockResolvedValue(active),
    save: vi.fn((_u: string, doc: { id: string }) => Promise.resolve({ ...active, id: doc.id })),
    createMyWeek: vi.fn().mockResolvedValue(activeRoutine([])),
    archive: vi.fn().mockResolvedValue({ ok: true }),
  };
  const profiles = {
    get: vi.fn().mockResolvedValue(profile),
    save: vi.fn().mockResolvedValue(profile),
  };
  return { svc: new MyWeekService(routines as never, profiles), routines, profiles };
}

describe('MyWeekService (ADR 0001: one active routine)', () => {
  it('needs a finished gym setup', async () => {
    const { svc } = setup(null, null);
    await expect(svc.save(USER, { week: week({}) })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('the first save creates THE routine from type-only days and sets the goal to the planned count', async () => {
    const { svc, routines, profiles } = setup(null);
    const res = await svc.save(USER, { week: week({ 1: 'YOGA', 4: 'CARDIO_MACHINES' }) });
    expect(routines.createMyWeek).toHaveBeenCalledWith(USER, [
      { name: 'Yoga', plannedWeekday: 1, workoutType: 'YOGA', exercises: [] },
      { name: 'Cardio machines', plannedWeekday: 4, workoutType: 'CARDIO_MACHINES', exercises: [] },
    ]);
    expect(profiles.save).toHaveBeenCalledWith(USER, { weeklyGoal: 2 });
    expect(res.weeklyGoal).toBe(2);
  });

  it('later saves go through the versioned routine save (same conflict handling as any edit)', async () => {
    const active = activeRoutine([
      {
        id: 'd1',
        position: 0,
        name: 'Yoga',
        plannedWeekday: 1,
        workoutType: 'YOGA',
        exercises: [],
      },
    ]);
    const { svc, routines } = setup(active);
    await svc.save(USER, { week: week({ 1: 'PILATES' }), expectedVersion: 4, weeklyGoal: 3 });
    expect(routines.save).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        id: 'r1',
        days: [expect.objectContaining({ id: 'd1', name: 'Pilates', workoutType: 'PILATES' })],
      }),
      4,
    );
  });

  it('an all-Rest week of type-only days archives the routine', async () => {
    const active = activeRoutine([
      {
        id: 'd1',
        position: 0,
        name: 'Yoga',
        plannedWeekday: 1,
        workoutType: 'YOGA',
        exercises: [],
      },
    ]);
    const { svc, routines, profiles } = setup(active);
    const res = await svc.save(USER, { week: week({}) });
    expect(routines.archive).toHaveBeenCalledWith(USER, 'r1');
    expect(res.routine).toBeNull();
    expect(profiles.save).not.toHaveBeenCalled();
  });

  it('refuses a week that would overflow the routine with a plain message', async () => {
    const unscheduled = Array.from({ length: 5 }, (_, i) => ({
      id: `u${i}`,
      position: i,
      name: `Day ${i}`,
      plannedWeekday: null,
      exercises: [
        {
          id: `x${i}`,
          exerciseId: 'barbell-bench-press',
          position: 0,
          sets: 3,
          repMin: 8,
          repMax: 12,
          targetRir: 2,
          restSec: 120,
          supersetGroup: null,
          notes: null,
        },
      ],
    }));
    const { svc } = setup(activeRoutine(unscheduled));
    await expect(
      svc.save(USER, { week: week({ 0: 'YOGA', 1: 'YOGA', 2: 'YOGA' }) }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/up to 7 days/),
    });
  });
});
