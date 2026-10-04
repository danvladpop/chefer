import { describe, expect, it } from 'vitest';
import {
  clearNextTargetInputSchema,
  clientOverviewInputSchema,
  clientWorkoutsInputSchema,
  COACHING_API_LEVEL,
  COACHING_COPY,
  COACHING_LIMITS,
  COACHING_RETENTION,
  createClientRoutineInputSchema,
  createInviteInputSchema,
  FALLBACK_TRAINER_NAME,
  INTERVALS_API_LEVEL,
  inviteCodeSchema,
  joinInputSchema,
  normalizeInviteCode,
  saveNoteInputSchema,
  saveTrainerRoutineInputSchema,
  setNextTargetInputSchema,
  trainerDisplayNameSchema,
  trainerNameOrFallback,
  trainerRoutineDocSchema,
  type InvitePreviewState,
} from '..';

describe('API levels', () => {
  it('coaching is 6 and INTERVALS moved above it (levels are cumulative: 5 stays unused)', () => {
    expect(COACHING_API_LEVEL).toBe(6);
    expect(INTERVALS_API_LEVEL).toBe(7);
    expect(INTERVALS_API_LEVEL).toBeGreaterThan(COACHING_API_LEVEL);
  });
});

describe('invite codes', () => {
  it('normalises case, spaces, dashes and the Crockford look-alikes', () => {
    expect(normalizeInviteCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
    expect(normalizeInviteCode('0123456789')).toBe('0123456789');
    expect(normalizeInviteCode('o1lIo1liL0')).toBe('0111011110');
  });

  it('accepts exactly 10 Crockford characters after normalising', () => {
    expect(inviteCodeSchema.parse('abcde fghjk')).toBe('ABCDEFGHJK');
    for (const bad of [
      '',
      'ABCDEFGHJ',
      'ABCDEFGHJKM',
      'ABCDEFGHJU',
      'ABCDEFGHJ!',
      'x'.repeat(41),
    ]) {
      expect(inviteCodeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('every procedure that takes a code normalises it', () => {
    expect(joinInputSchema.parse({ code: 'abcde-fghjk' }).code).toBe('ABCDEFGHJK');
    expect(joinInputSchema.parse({ code: 'ABCDEFGHJK', source: 'mobile' }).source).toBe('mobile');
    expect(joinInputSchema.safeParse({ code: 'ABCDEFGHJK', source: 'tv' }).success).toBe(false);
  });

  it('localDate is optional and must be YYYY-MM-DD', () => {
    expect(joinInputSchema.parse({ code: 'ABCDEFGHJK' }).localDate).toBeUndefined();
    expect(joinInputSchema.parse({ code: 'ABCDEFGHJK', localDate: '2026-10-04' }).localDate).toBe(
      '2026-10-04',
    );
    for (const bad of ['', '2026-10-4', '04/10/2026', '2026-10-04T23:30:00Z', 'today']) {
      expect(joinInputSchema.safeParse({ code: 'ABCDEFGHJK', localDate: bad }).success).toBe(false);
    }
  });
});

describe('inputs', () => {
  it('display name and invite label are trimmed and bounded', () => {
    expect(trainerDisplayNameSchema.parse('  Ana ')).toBe('Ana');
    expect(trainerDisplayNameSchema.safeParse('   ').success).toBe(false);
    expect(
      trainerDisplayNameSchema.safeParse('x'.repeat(COACHING_LIMITS.displayNameMaxChars + 1))
        .success,
    ).toBe(false);
    expect(createInviteInputSchema.parse({ label: '  Maria, Tue/Thu ' }).label).toBe(
      'Maria, Tue/Thu',
    );
    expect(createInviteInputSchema.safeParse({ label: 'x'.repeat(61) }).success).toBe(false);
  });

  it('the private note is bounded at 4000 characters and kept as is (opaque text)', () => {
    const body = '  anything   <b>goes</b>\n';
    expect(saveNoteInputSchema.parse({ clientId: 'c1', body }).body).toBe(body);
    expect(saveNoteInputSchema.parse({ clientId: 'c1', body: '' }).body).toBe('');
    expect(saveNoteInputSchema.safeParse({ clientId: 'c1', body: 'x'.repeat(4001) }).success).toBe(
      false,
    );
  });

  it('every client procedure needs a client id; dates are YYYY-MM-DD; pages are capped at 20', () => {
    expect(clientOverviewInputSchema.safeParse({ clientId: '', today: '2026-10-04' }).success).toBe(
      false,
    );
    expect(
      clientOverviewInputSchema.safeParse({ clientId: 'c1', today: '04/10/2026' }).success,
    ).toBe(false);
    expect(clientWorkoutsInputSchema.parse({ clientId: 'c1' }).limit).toBe(10);
    expect(clientWorkoutsInputSchema.safeParse({ clientId: 'c1', limit: 21 }).success).toBe(false);
  });

  it('next-session targets keep the D5c bounds', () => {
    const ok = {
      clientId: 'c1',
      exerciseId: 'squat',
      repBucket: '6-8',
      weightKg: 62.5,
      reps: [6, 6, 6, 6],
    };
    expect(setNextTargetInputSchema.safeParse(ok).success).toBe(true);
    expect(setNextTargetInputSchema.safeParse({ ...ok, weightKg: 1001 }).success).toBe(false);
    expect(setNextTargetInputSchema.safeParse({ ...ok, reps: [] }).success).toBe(false);
    expect(
      setNextTargetInputSchema.safeParse({ ...ok, reps: new Array<number>(11).fill(5) }).success,
    ).toBe(false);
    expect(
      clearNextTargetInputSchema.safeParse({
        clientId: 'c1',
        exerciseId: 'squat',
        repBucket: '6-8',
      }).success,
    ).toBe(true);
  });

  it('createRoutine takes a template key or a day count, both optional', () => {
    expect(createClientRoutineInputSchema.safeParse({ clientId: 'c1' }).success).toBe(true);
    expect(createClientRoutineInputSchema.safeParse({ clientId: 'c1', days: 8 }).success).toBe(
      false,
    );
    expect(
      createClientRoutineInputSchema.safeParse({ clientId: 'c1', templateKey: 'ppl' }).success,
    ).toBe(true);
  });
});

describe('the trainer routine document', () => {
  const row = {
    exerciseId: 'squat',
    sets: 3,
    repMin: 6,
    repMax: 8,
    targetRir: 2,
    restSec: 120,
    supersetGroup: null,
    trainerNote: null,
  };
  const doc = (exercises: object[]) => ({
    id: 'r1',
    name: 'Plan',
    days: [{ name: 'A', plannedWeekday: 0, exercises }],
  });

  it('has no `notes`: the client’s own note is never read from a trainer (Zod strips it)', () => {
    const parsed = trainerRoutineDocSchema.parse(doc([{ ...row, notes: 'sneaky' }]));
    expect(parsed.days[0]?.exercises[0]).not.toHaveProperty('notes');
    expect(JSON.stringify(parsed)).not.toContain('sneaky');
  });

  it('the trainer note is at most 200 characters and may be null', () => {
    expect(
      trainerRoutineDocSchema.safeParse(doc([{ ...row, trainerNote: 'x'.repeat(200) }])).success,
    ).toBe(true);
    expect(
      trainerRoutineDocSchema.safeParse(doc([{ ...row, trainerNote: 'x'.repeat(201) }])).success,
    ).toBe(false);
    expect(trainerRoutineDocSchema.safeParse(doc([{ ...row, trainerNote: null }])).success).toBe(
      true,
    );
  });

  it('keeps the client’s routine bounds (sets, reps, rest, 7 days, 20 exercises)', () => {
    expect(trainerRoutineDocSchema.safeParse(doc([{ ...row, sets: 11 }])).success).toBe(false);
    expect(trainerRoutineDocSchema.safeParse(doc([{ ...row, repMin: 9 }])).success).toBe(false);
    expect(trainerRoutineDocSchema.safeParse(doc([{ ...row, restSec: 10 }])).success).toBe(false);
    expect(trainerRoutineDocSchema.safeParse(doc(new Array<object>(21).fill(row))).success).toBe(
      false,
    );
    expect(
      saveTrainerRoutineInputSchema.safeParse({
        clientId: 'c1',
        routine: doc([row]),
        expectedVersion: 0,
      }).success,
    ).toBe(false);
  });
});

describe('copy', () => {
  it('every invite preview state has a message (consent screens render one per state)', () => {
    const states: InvitePreviewState[] = [
      'OK',
      'EXPIRED',
      'USED',
      'REVOKED',
      'SELF',
      'ALREADY_YOURS',
      'NOT_FOUND',
    ];
    for (const state of states) expect(COACHING_COPY.inviteState).toHaveProperty(state);
    expect(COACHING_COPY.inviteState.ALREADY_YOURS('Ana')).toContain('Ana');
  });

  it('the consent screen says what is seen, what can be done and what never is, with the trainer’s name', () => {
    const c = COACHING_COPY.consent;
    expect(c.title('Ana')).toBe('Ana wants to coach you in Chefer.');
    expect(c.willSee.join(' ')).toMatch(/routine/);
    expect(c.willSee.join(' ')).toMatch(/last 4 weeks/);
    expect(c.willSee.join(' ')).toMatch(/never the reason/);
    expect(c.can('Ana').join(' ')).toMatch(/Ana changed/);
    expect(c.privateNotes('Ana')).toMatch(/private notes/);
    for (const forbidden of ['food', 'body weight', 'nutrition targets', 'heart rate', 'age']) {
      expect(c.never).toContain(forbidden);
    }
    expect(c.oneTrainer('Ana')).toMatch(/routine stays yours/);
    expect(c.switchLine('Ion')).toContain('Ion');
    expect(c.switchTo('Ana')).toBe('Switch to Ana');
  });

  it('every string is plain: no raw placeholders, no "undefined", no "Following" vocabulary mix-ups', () => {
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') strings.push(v);
      else if (typeof v === 'function')
        strings.push(String((v as (...a: string[]) => unknown)('Ana', 'Maria', '2 Oct')));
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(COACHING_COPY);
    for (const s of strings) {
      expect(s).not.toMatch(/undefined|NaN|\[object|\{\w+\}/);
      expect(s).not.toMatch(/\bFollowing\b|\bfriends?\b/i);
    }
  });

  it('a trainer name falls back to "your trainer"', () => {
    expect(trainerNameOrFallback('Ana')).toBe('Ana');
    expect(trainerNameOrFallback(null)).toBe(FALLBACK_TRAINER_NAME);
    expect(trainerNameOrFallback('  ')).toBe(FALLBACK_TRAINER_NAME);
  });
});

describe('limits and retention (counsel to confirm the retention numbers)', () => {
  it('match the spec defaults', () => {
    expect(COACHING_LIMITS).toMatchObject({
      inviteCodeLength: 10,
      inviteTtlDays: 14,
      maxOpenInvites: 20,
      maxActiveClients: 50,
      noteMaxChars: 4000,
      trainerNoteMaxChars: 200,
      workoutWindowDays: 28,
      invitesPerDay: 50,
      previewPerHour: 30,
      joinPerHour: 10,
    });
    expect(COACHING_RETENTION).toEqual({
      endedLinkMonths: 24,
      hiddenNoteDays: 30,
      inviteAfterExpiryDays: 30,
      clientExportIncludesTrainerNotes: false,
    });
  });
});
