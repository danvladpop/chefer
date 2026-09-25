import { weekdayOf } from '@chefer/utils';
import {
  computeGymReminders,
  localInstant,
  type GymReminderInput,
  type GymReminderRoutine,
  type LocalInstantFn,
} from '../../src/features/gym/reminders/schedule';

// Pure scheduler tests (gym_plan.md §6.5, research §4.2 #7). Every test
// injects a deterministic `toLocalInstant` that treats "HH:MM" as if it were
// already UTC (offset 0) — the test runner's own OS timezone can't be forced
// mid-process in this Jest environment (jest-expo pins Date/Intl to the host
// machine's zone regardless of `process.env.TZ`), so asserting against a
// fixed, injected conversion is what makes these tests deterministic on any
// machine. `localInstant` itself (the real device-local/DST-aware default
// used in production) is exercised separately, by injecting a synthetic
// "zone" with a known DST-like transition below.

function fixedInstant(date: string, time: string): string {
  return `${date}T${time}:00.000Z`;
}

function routine(...days: { name: string; date: string }[]): GymReminderRoutine {
  return { days: days.map((d) => ({ name: d.name, plannedWeekday: weekdayOf(d.date) })) };
}

function baseInput(over: Partial<GymReminderInput> = {}): GymReminderInput {
  return {
    profile: { reminderEnabled: true, reminderTime: '18:00' },
    activeRoutine: null,
    lastSessionDate: null,
    today: '2026-09-25', // a Friday
    now: '2026-09-25T00:00:00.000Z',
    activePause: null,
    toLocalInstant: fixedInstant,
    ...over,
  };
}

describe('computeGymReminders', () => {
  it('returns nothing when reminders are off, unset, or there is no routine', () => {
    expect(
      computeGymReminders(
        baseInput({ profile: { reminderEnabled: false, reminderTime: '18:00' } }),
      ),
    ).toEqual([]);
    expect(
      computeGymReminders(baseInput({ profile: { reminderEnabled: true, reminderTime: null } })),
    ).toEqual([]);
    expect(computeGymReminders(baseInput({ activeRoutine: null }))).toEqual([]);
    expect(
      computeGymReminders(
        baseInput({ activeRoutine: { days: [{ name: 'A', plannedWeekday: null }] } }),
      ),
    ).toEqual([]);
  });

  it('schedules one reminder per planned weekday in the next 14 days, at the reminder time', () => {
    // Friday (today) and Monday planned; today = 2026-09-25 (Friday).
    const activeRoutine = routine(
      { name: 'Upper A', date: '2026-09-25' },
      { name: 'Lower A', date: '2026-09-28' },
    );
    const reminders = computeGymReminders(baseInput({ activeRoutine }));
    // 14-day window = 25 Sep … 8 Oct. Fridays: 25 Sep, 2 Oct; Mondays: 28 Sep, 5 Oct.
    expect(reminders.map((r) => r.at)).toEqual([
      '2026-09-25T18:00:00.000Z',
      '2026-09-28T18:00:00.000Z',
      '2026-10-02T18:00:00.000Z',
      '2026-10-05T18:00:00.000Z',
    ]);
    expect(reminders.every((r) => r.kind === 'planned')).toBe(true);
    expect(reminders[0]?.body).toBe("Upper A is up next — whenever you're ready.");
    expect(reminders[1]?.body).toBe("Lower A is up next — whenever you're ready.");
  });

  it('skips a planned day already trained (today)', () => {
    const activeRoutine = routine({ name: 'Upper A', date: '2026-09-25' });
    const reminders = computeGymReminders(
      baseInput({ activeRoutine, lastSessionDate: '2026-09-25' }),
    );
    expect(reminders.some((r) => r.at.startsWith('2026-09-25'))).toBe(false);
    // The next occurrence (2 Oct) is untouched.
    expect(reminders.some((r) => r.at.startsWith('2026-10-02'))).toBe(true);
  });

  it('skips a reminder whose time has already passed today', () => {
    const activeRoutine = routine({ name: 'Upper A', date: '2026-09-25' });
    const reminders = computeGymReminders(
      baseInput({ activeRoutine, now: '2026-09-25T19:00:00.000Z' }),
    );
    expect(reminders.some((r) => r.at.startsWith('2026-09-25'))).toBe(false);
    expect(reminders.some((r) => r.at.startsWith('2026-10-02'))).toBe(true);
  });

  it('skips days inside a pause', () => {
    const activeRoutine = routine(
      { name: 'Upper A', date: '2026-09-25' },
      { name: 'Lower A', date: '2026-09-28' },
    );
    const reminders = computeGymReminders(
      baseInput({
        activeRoutine,
        activePause: { startDate: '2026-09-26', endDate: '2026-10-03' },
      }),
    );
    // 25 Sep is before the pause (kept); 28 Sep and 2 Oct fall inside it (dropped); 5 Oct after (kept).
    expect(reminders.map((r) => r.at)).toEqual([
      '2026-09-25T18:00:00.000Z',
      '2026-10-05T18:00:00.000Z',
    ]);
  });

  it('adds one gentle nudge the day after a missed planned day', () => {
    // Planned only on Thursday (2026-09-24); today is Friday, the day after.
    const activeRoutine = routine({ name: 'Lower A', date: '2026-09-24' });
    const reminders = computeGymReminders(
      baseInput({ activeRoutine, today: '2026-09-25', lastSessionDate: '2026-09-10' }),
    );
    const nudge = reminders.find((r) => r.kind === 'missed');
    expect(nudge?.at).toBe('2026-09-25T18:00:00.000Z');
    expect(nudge?.body).not.toMatch(/miss|broke|streak/i);
  });

  it('never sends the nudge and a planned reminder on the same day (max one a day)', () => {
    // Planned on BOTH Thursday (missed) and Friday (today) — today already has
    // its own planned reminder, so the nudge must not also fire today.
    const activeRoutine = routine(
      { name: 'Lower A', date: '2026-09-24' },
      { name: 'Upper A', date: '2026-09-25' },
    );
    const reminders = computeGymReminders(
      baseInput({ activeRoutine, today: '2026-09-25', lastSessionDate: '2026-09-10' }),
    );
    const todays = reminders.filter((r) => r.at.startsWith('2026-09-25'));
    expect(todays).toHaveLength(1);
    expect(todays[0]?.kind).toBe('planned');
  });

  it('does not nudge when yesterday was not a planned day, or was not missed', () => {
    const activeRoutine = routine({ name: 'Upper A', date: '2026-09-25' }); // Friday only
    const notPlanned = computeGymReminders(baseInput({ activeRoutine, today: '2026-09-25' }));
    expect(notPlanned.some((r) => r.kind === 'missed')).toBe(false);

    const trained = computeGymReminders(
      baseInput({
        activeRoutine: routine({ name: 'Lower A', date: '2026-09-24' }),
        today: '2026-09-25',
        lastSessionDate: '2026-09-24', // yesterday was trained, not missed
      }),
    );
    expect(trained.some((r) => r.kind === 'missed')).toBe(false);
  });

  it('does not nudge when yesterday, or today, is inside a pause', () => {
    const activeRoutine = routine({ name: 'Lower A', date: '2026-09-24' });
    const pausedYesterday = computeGymReminders(
      baseInput({
        activeRoutine,
        today: '2026-09-25',
        activePause: { startDate: '2026-09-20', endDate: '2026-09-24' },
      }),
    );
    expect(pausedYesterday.some((r) => r.kind === 'missed')).toBe(false);

    const pausedToday = computeGymReminders(
      baseInput({
        activeRoutine,
        today: '2026-09-25',
        activePause: { startDate: '2026-09-25', endDate: '2026-09-28' },
      }),
    );
    expect(pausedToday.some((r) => r.kind === 'missed')).toBe(false);
  });
});

// ─── DST correctness ──────────────────────────────────────────────────────────
// A synthetic "zone" standing in for America/New_York's 2026 fall-back (clocks
// move from EDT, UTC-4, to EST, UTC-5, at 2026-11-01T02:00 local). Exercising
// this through an INJECTED `toLocalInstant` — rather than the host machine's
// real zone — is what makes the test deterministic everywhere: the scheduler
// must ask for the instant of EACH day independently (never reuse one day's
// offset for the whole 14-day window), which is exactly the bug this guards.
const FALL_BACK_LOCAL = '2026-11-01T02:00'; // clocks were EDT strictly before this instant

const nyLikeZone: LocalInstantFn = (date, time) => {
  const wallClock = `${date}T${time}`;
  const offsetHours = wallClock < FALL_BACK_LOCAL ? 4 : 5;
  // Treat "date T time" as UTC, then shift by the synthetic zone's own offset
  // (UTC-4 before the fall-back, UTC-5 on/after it) to get the real instant.
  return new Date(Date.parse(`${date}T${time}:00.000Z`) + offsetHours * 3_600_000).toISOString();
};

describe('computeGymReminders (DST-safe instant conversion)', () => {
  it('re-derives the offset per day instead of reusing one across the whole window', () => {
    const activeRoutine = routine(
      { name: 'Upper A', date: '2026-10-30' }, // Friday, before the fall-back (EDT, UTC-4)
      { name: 'Lower A', date: '2026-11-02' }, // Monday, after the fall-back (EST, UTC-5)
    );
    const reminders = computeGymReminders(
      baseInput({
        activeRoutine,
        today: '2026-10-30',
        now: '2026-10-30T00:00:00.000Z',
        toLocalInstant: nyLikeZone,
      }),
    );
    const oct30 = reminders.find((r) => r.at.startsWith('2026-10-30'));
    const nov2 = reminders.find((r) => r.at.startsWith('2026-11-02'));
    // 18:00 EDT (UTC-4) = 22:00 UTC; 18:00 EST (UTC-5, after the fall-back) = 23:00 UTC.
    expect(oct30?.at).toBe('2026-10-30T22:00:00.000Z');
    expect(nov2?.at).toBe('2026-11-02T23:00:00.000Z');
  });

  it('the real device-local converter (localInstant) resolves a nonexistent/ambiguous wall time to a valid instant', () => {
    // Not asserting a specific offset (that's the HOST machine's own zone —
    // untestable here, see file header) — only that it always returns a
    // well-formed, parseable instant and never throws.
    const at = localInstant('2026-09-25', '18:00');
    expect(() => new Date(at)).not.toThrow();
    expect(Number.isNaN(Date.parse(at))).toBe(false);
  });
});
