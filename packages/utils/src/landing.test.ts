import { describe, expect, it } from 'vitest';
import { landingFor } from './landing';

describe('landingFor', () => {
  it('respects an explicit Gym choice regardless of jobs', () => {
    expect(landingFor({ jobs: ['PLAN_MEALS'], persistedMode: 'gym', hasGymProfile: true })).toBe(
      'gym',
    );
  });

  it('lands TRAIN-only, gym-set-up users on Gym', () => {
    expect(landingFor({ jobs: ['TRAIN'], persistedMode: 'food', hasGymProfile: true })).toBe('gym');
  });

  it('keeps TRAIN-only users on Food until gym setup is done', () => {
    expect(landingFor({ jobs: ['TRAIN'], persistedMode: 'food', hasGymProfile: false })).toBe(
      'food',
    );
  });

  it('lands mixed-job users on Food', () => {
    expect(
      landingFor({ jobs: ['TRAIN', 'PLAN_MEALS'], persistedMode: 'food', hasGymProfile: true }),
    ).toBe('food');
  });

  it('defaults new accounts (no jobs) to Food', () => {
    expect(landingFor({ jobs: [], persistedMode: 'food', hasGymProfile: false })).toBe('food');
  });

  it('a workout in progress wins over everything, even an explicit Food choice (row 1)', () => {
    expect(
      landingFor({
        jobs: ['PLAN_MEALS'],
        persistedMode: 'food',
        hasGymProfile: true,
        workoutInProgress: true,
      }),
    ).toBe('gym');
  });

  describe('row 4 — a planned training day, not done, from 14:00 (or the reminder-time rule)', () => {
    const base = {
      jobs: ['TRAIN', 'PLAN_MEALS'] as const,
      persistedMode: 'food' as const,
      hasGymProfile: true,
      isTrainingDayToday: true,
      workoutDoneToday: false,
    };

    it('lands on Gym at 14:00 on a planned training day', () => {
      expect(landingFor({ ...base, localHour: 14 })).toBe('gym');
    });

    it('stays on Food before 14:00 with no reminder set', () => {
      expect(landingFor({ ...base, localHour: 13.9 })).toBe('food');
    });

    it('the reminder-time rule: lands on Gym 2h before an earlier reminder', () => {
      // Reminder at 12:00 -> threshold 10:00, earlier than the 14:00 default.
      expect(landingFor({ ...base, localHour: 10, reminderHour: 12 })).toBe('gym');
      expect(landingFor({ ...base, localHour: 9.9, reminderHour: 12 })).toBe('food');
    });

    it('a later reminder never pushes the threshold past 14:00', () => {
      expect(landingFor({ ...base, localHour: 13.9, reminderHour: 20 })).toBe('food');
      expect(landingFor({ ...base, localHour: 14, reminderHour: 20 })).toBe('gym');
    });

    it('stays on Food once the workout is already done today', () => {
      expect(landingFor({ ...base, localHour: 18, workoutDoneToday: true })).toBe('food');
    });

    it('stays on Food on a non-training day', () => {
      expect(landingFor({ ...base, localHour: 18, isTrainingDayToday: false })).toBe('food');
    });

    it('never applies without gym set up', () => {
      expect(landingFor({ ...base, localHour: 18, hasGymProfile: false })).toBe('food');
    });

    it('never applies without a Train job', () => {
      expect(
        landingFor({ ...base, jobs: ['PLAN_MEALS'] as unknown as typeof base.jobs, localHour: 18 }),
      ).toBe('food');
    });
  });

  it('jobs unknown (legacy, never re-onboarded) falls back to the persisted mode', () => {
    expect(landingFor({ jobs: [], persistedMode: 'gym', hasGymProfile: false })).toBe('gym');
    expect(landingFor({ jobs: [], persistedMode: 'food', hasGymProfile: false })).toBe('food');
  });
});
