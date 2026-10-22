import { describe, expect, it } from 'vitest';
import type { MealReminders } from '@chefer/types';
import { ENGAGEMENT_COPY, MEAL_REMINDER_NOTIFICATION } from './engagement-copy';
import {
  activeReminderSlots,
  defaultMealReminders,
  loggedMealSlots,
  mealReminderMoments,
  parseStoredMealReminders,
} from './meal-reminders';

const ON: MealReminders = {
  enabled: true,
  times: { breakfast: '08:00', lunch: '12:30', dinner: '18:30', snack: null },
};
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
// Wednesday 2026-10-21, 10:00 local.
const WED_10AM = new Date(2026, 9, 21, 10, 0);

const fmt = (d: Date) =>
  `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('defaultMealReminders', () => {
  it('pre-fills a time for each planned meal and leaves the others off', () => {
    expect(defaultMealReminders(['breakfast', 'dinner'])).toEqual({
      enabled: false,
      times: { breakfast: '08:00', lunch: null, dinner: '18:30', snack: null },
    });
  });
});

describe('parseStoredMealReminders', () => {
  it('reads a valid value and rejects anything malformed', () => {
    expect(parseStoredMealReminders(ON)).toEqual(ON);
    expect(parseStoredMealReminders(null)).toBeNull();
    expect(parseStoredMealReminders({ enabled: true })).toBeNull();
    expect(parseStoredMealReminders({ ...ON, times: { ...ON.times, lunch: '12:31' } })).toBeNull();
  });
});

describe('activeReminderSlots', () => {
  it('lists the meals with a time in the day’s order, none when switched off', () => {
    expect(activeReminderSlots({ ...ON, times: { ...ON.times, snack: '16:00' } })).toEqual([
      'breakfast',
      'lunch',
      'snack',
      'dinner',
    ]);
    expect(activeReminderSlots({ ...ON, enabled: false })).toEqual([]);
  });
});

describe('mealReminderMoments', () => {
  it('skips moments already past and plans the window ahead, soonest first', () => {
    const moments = mealReminderMoments(WED_10AM, ON, EVERY_DAY, new Set(), 2);
    expect(moments.map((m) => `${m.slot} ${fmt(m.at)}`)).toEqual([
      'lunch 10/21 12:30',
      'dinner 10/21 18:30',
      'breakfast 10/22 08:00',
      'lunch 10/22 12:30',
      'dinner 10/22 18:30',
    ]);
  });

  it('drops today’s reminder for a meal that is already logged or ticked, but not tomorrow’s', () => {
    const moments = mealReminderMoments(WED_10AM, ON, EVERY_DAY, new Set(['lunch'] as const), 2);
    expect(moments.map((m) => `${m.slot} ${fmt(m.at)}`)).toEqual([
      'dinner 10/21 18:30',
      'breakfast 10/22 08:00',
      'lunch 10/22 12:30',
      'dinner 10/22 18:30',
    ]);
  });

  it('only reminds on planned weekdays (0 = Monday)', () => {
    // Wednesday is 2; plan Thursday (3) only.
    const moments = mealReminderMoments(WED_10AM, ON, [3], new Set(), 4);
    expect(new Set(moments.map((m) => m.at.getDate()))).toEqual(new Set([22]));
  });

  it('schedules nothing while switched off', () => {
    expect(mealReminderMoments(WED_10AM, { ...ON, enabled: false }, EVERY_DAY, new Set())).toEqual(
      [],
    );
  });
});

describe('loggedMealSlots', () => {
  it('maps stored meal types to slots and ignores unknown ones', () => {
    expect(
      loggedMealSlots([{ mealType: 'BREAKFAST' }, { mealType: 'dinner' }, { mealType: 'OTHER' }]),
    ).toEqual(new Set(['breakfast', 'dinner']));
  });
});

describe('reminder copy is warm, never guilt-based', () => {
  const GUILT = /\b(missed|forget|forgot|forgotten|behind|failed|slipping|streak|don[’']t lose)\b/i;
  it('no notification or setting line reports what did not happen', () => {
    const lines = [
      ...Object.values(ENGAGEMENT_COPY),
      ...Object.values(MEAL_REMINDER_NOTIFICATION).flatMap((c) => [c.title, c.body]),
    ];
    for (const line of lines) expect(line).not.toMatch(GUILT);
  });
});
