// WP-20: "Log an activity" — the pure rules shared by mobile and web.
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_PRESETS,
  workoutSessionDocSchema,
  type GymBootstrap,
  type SessionSummaryDto,
} from '@chefer/types';
import {
  activityFacts,
  activityMinDate,
  activitySessionName,
  activitySummaryLine,
  buildActivityLogDoc,
  isActivityLogSession,
  validateActivityLog,
} from './activity-log';
import { sessionStatsOf, sessionStatsText } from './recent';
import { doneTodayCard, todayStatus, toSessionSummary } from './session';
import { selectTodaysSession } from './todays-session';
import { summarizeWeeks } from './weeks';

const TODAY = '2026-10-07'; // a Wednesday
const NOW = '2026-10-07T20:00:00.000Z';

let counter = 0;
const newId = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

const base = {
  presetKey: 'cycling',
  localDate: TODAY,
  durationMin: 45,
} as const;

function build(over: Partial<Parameters<typeof buildActivityLogDoc>[0]['input']> = {}) {
  return buildActivityLogDoc({
    input: { ...base, ...over },
    id: newId(),
    newId,
    startAt: `${over.localDate ?? TODAY}T18:00:00.000Z`,
    now: NOW,
  });
}

describe('buildActivityLogDoc', () => {
  it('is a finished, routine-less session with one DURATION entry that passes the wire schema', () => {
    const doc = build({ caloriesKcal: 400, effort: 7 });
    expect(workoutSessionDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.status).toBe('COMPLETED');
    expect(doc.routineId).toBeNull();
    expect(doc.routineDayId).toBeNull();
    expect(doc.name).toBe('Cycling class');
    expect(doc.exercises).toHaveLength(1);
    const ex = doc.exercises[0];
    expect(ex?.exerciseId).toBe('spin-class');
    expect(ex?.sets).toHaveLength(1);
    const set = ex?.sets[0];
    expect(set).toMatchObject({
      weightKg: 0,
      reps: 0,
      isWarmup: false,
      durationSec: 2700,
      caloriesKcal: 400,
      intensityRpe: 7,
    });
    expect(set?.completedAt).toBe(doc.finishedAt);
  });

  it('omits kcal and effort when not given (optional, never zero-filled)', () => {
    const set = build().exercises[0]?.sets[0];
    expect(set).not.toHaveProperty('caloriesKcal');
    expect(set).not.toHaveProperty('intensityRpe');
  });

  it('lasts durationMin and never ends after now', () => {
    // Start 18:00Z, 45 min → ends 18:45Z, before now (20:00Z).
    const past = build();
    expect(Date.parse(past.finishedAt ?? '') - Date.parse(past.startedAt)).toBe(45 * 60_000);
    // A 3 h activity from 18:00 would end at 21:00Z > now → pulled back to end at now.
    const long = build({ durationMin: 180 });
    expect(long.finishedAt).toBe(NOW);
    expect(Date.parse(long.finishedAt ?? '') - Date.parse(long.startedAt)).toBe(180 * 60_000);
  });

  it('keeps the picked day (yesterday) and names Other after what the user typed', () => {
    const doc = build({
      presetKey: 'other',
      customName: '  Rock climbing ',
      localDate: '2026-10-06',
    });
    expect(doc.localDate).toBe('2026-10-06');
    expect(doc.name).toBe('Rock climbing');
    expect(doc.exercises[0]?.exerciseId).toBe('other-activity');
  });

  it('maps every chip to its catalogue entry', () => {
    for (const p of ACTIVITY_PRESETS) {
      const doc = build({ presetKey: p.key, customName: 'x' });
      expect(doc.exercises[0]?.exerciseId).toBe(p.exerciseId);
    }
  });
});

describe('activitySessionName', () => {
  it('uses the chip name, ignores a stray custom name, and falls back for an empty Other', () => {
    expect(activitySessionName({ presetKey: 'yoga', customName: 'ignored' })).toBe('Yoga class');
    expect(activitySessionName({ presetKey: 'other', customName: '' })).toBe('Activity');
  });
});

describe('validateActivityLog', () => {
  it('accepts the common case: a chip and minutes', () => {
    expect(validateActivityLog({ ...base, today: TODAY })).toEqual({});
  });

  it('asks for the minutes, with a plain message', () => {
    expect(validateActivityLog({ ...base, durationMin: 0, today: TODAY }).duration).toMatch(
      /minutes/,
    );
    expect(
      validateActivityLog({ ...base, durationMin: Number.NaN, today: TODAY }).duration,
    ).toBeTruthy();
    expect(validateActivityLog({ ...base, durationMin: 181, today: TODAY }).duration).toMatch(
      /180/,
    );
  });

  it('needs a name for Other, and a chip at all', () => {
    expect(validateActivityLog({ ...base, presetKey: 'other', today: TODAY }).name).toBeTruthy();
    expect(
      validateActivityLog({ ...base, presetKey: 'other', customName: 'Padel', today: TODAY }),
    ).toEqual({});
    expect(
      validateActivityLog({ localDate: TODAY, durationMin: 30, today: TODAY }).activity,
    ).toBeTruthy();
  });

  it('allows yesterday and earlier this fortnight, never the future or too far back', () => {
    expect(validateActivityLog({ ...base, localDate: '2026-10-06', today: TODAY })).toEqual({});
    expect(activityMinDate(TODAY)).toBe('2026-09-28');
    expect(validateActivityLog({ ...base, localDate: '2026-09-28', today: TODAY })).toEqual({});
    expect(
      validateActivityLog({ ...base, localDate: '2026-09-27', today: TODAY }).date,
    ).toBeTruthy();
    expect(
      validateActivityLog({ ...base, localDate: '2026-10-08', today: TODAY }).date,
    ).toBeTruthy();
  });

  it('keeps kcal optional but bounded, and effort 1-10', () => {
    expect(validateActivityLog({ ...base, caloriesKcal: 400, today: TODAY })).toEqual({});
    expect(validateActivityLog({ ...base, caloriesKcal: -1, today: TODAY }).calories).toBeTruthy();
    expect(
      validateActivityLog({ ...base, caloriesKcal: 9000, today: TODAY }).calories,
    ).toBeTruthy();
    expect(validateActivityLog({ ...base, effort: 0, today: TODAY }).effort).toBeTruthy();
    expect(validateActivityLog({ ...base, effort: 11, today: TODAY }).effort).toBeTruthy();
    expect(validateActivityLog({ ...base, effort: 10, today: TODAY })).toEqual({});
  });
});

describe('isActivityLogSession', () => {
  it('is true for a routine-less session of activity entries only', () => {
    expect(isActivityLogSession(build())).toBe(true);
    expect(isActivityLogSession(toSessionSummary(build()))).toBe(true);
  });

  it('is false for a routine day, a strength session, a mixed one and an empty one', () => {
    const doc = build();
    expect(isActivityLogSession({ ...doc, routineDayId: 'd1' })).toBe(false);
    expect(
      isActivityLogSession({
        routineDayId: null,
        exercises: [{ exerciseId: 'barbell-bench-press' }],
      }),
    ).toBe(false);
    expect(
      isActivityLogSession({
        routineDayId: null,
        exercises: [{ exerciseId: 'spin-class' }, { exerciseId: 'barbell-bench-press' }],
      }),
    ).toBe(false);
    expect(isActivityLogSession({ routineDayId: null, exercises: [] })).toBe(false);
  });
});

describe('what an activity reads back as', () => {
  it('reads minutes and kcal from the sets', () => {
    expect(activityFacts(build({ caloriesKcal: 400 }))).toEqual({
      durationSec: 2700,
      caloriesKcal: 400,
    });
    expect(activityFacts(build())).toEqual({ durationSec: 2700, caloriesKcal: null });
  });

  it('builds the detail line: name · minutes · ~kcal (from your watch)', () => {
    expect(activitySummaryLine('Cycling class', { durationSec: 2700, caloriesKcal: 400 })).toBe(
      'Cycling class · 45 min · ~400 kcal (from your watch)',
    );
    expect(activitySummaryLine('Yoga class', { durationSec: 3600, caloriesKcal: null })).toBe(
      'Yoga class · 1 h',
    );
  });

  it('shows an activity row as "45 min · ~400 kcal", never "1 sets"', () => {
    const summary = toSessionSummary(build({ caloriesKcal: 400 }));
    expect(sessionStatsOf(summary, false).text).toBe('45 min · ~400 kcal');
    expect(sessionStatsOf(toSessionSummary(build()), false).text).toBe('45 min');
    expect(
      sessionStatsText({
        durationMin: 52,
        workingSets: 12,
        hasPr: true,
        activity: false,
        caloriesKcal: null,
      }).text,
    ).toBe('52 min · 12 sets · PR');
  });
});

// A logged activity counts for the week (it IS a finished session) but never
// as "today's workout is done" (WP-20).
describe('an activity does not hide Start', () => {
  const routineDay = {
    id: 'dA',
    position: 0,
    name: 'Upper',
    plannedWeekday: 2,
    exercises: [],
  };
  const boot: Pick<
    GymBootstrap,
    'recentSessions' | 'nextWorkout' | 'activeRoutine' | 'olderBests'
  > = {
    activeRoutine: {
      id: 'r1',
      name: 'Split',
      templateKey: null,
      isActive: true,
      nextDayId: 'dA',
      version: 1,
      archived: false,
      updatedAt: '2026-09-01T10:00:00.000Z',
      days: [routineDay],
    },
    nextWorkout: {
      routineId: 'r1',
      dayId: 'dA',
      dayName: 'Upper',
      isDeload: false,
      estimatedMin: 45,
      exercises: [],
    },
    recentSessions: [toSessionSummary(build({ caloriesKcal: 400 }))],
    olderBests: {},
  };

  it("keeps today a training day and today's session the routine's", () => {
    expect(todayStatus({ bootstrap: boot, today: TODAY })).toEqual({ kind: 'training' });
    expect(doneTodayCard({ bootstrap: boot, today: TODAY })).toBeNull();
    expect(selectTodaysSession({ bootstrap: boot, today: TODAY })).toMatchObject({
      kind: 'planned',
      dayId: 'dA',
    });
  });

  it('but a real workout the same day still makes it Done', () => {
    const strength: SessionSummaryDto = {
      ...toSessionSummary(build()),
      id: 'strength',
      name: 'Upper',
      routineDayId: 'dA',
      exercises: [
        {
          exerciseId: 'barbell-bench-press',
          skipped: false,
          lastSetRir: 2,
          sets: [{ weightKg: 60, reps: 8, isWarmup: false, completed: true }],
        },
      ],
    };
    const withStrength = { ...boot, recentSessions: [strength, ...boot.recentSessions] };
    expect(todayStatus({ bootstrap: withStrength, today: TODAY }).kind).toBe('done');
  });

  it('still counts toward the weekly goal like any finished session', () => {
    const { weeks } = summarizeWeeks({
      sessionDates: [TODAY],
      goalHistory: [{ fromWeek: '2026-10-05', goal: 3 }],
      pauses: [],
      today: TODAY,
      firstWeek: '2026-10-05',
    });
    expect(weeks.at(-1)?.sessions).toBe(1);
  });
});
