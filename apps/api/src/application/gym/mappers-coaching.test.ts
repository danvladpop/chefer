import { describe, expect, it, vi } from 'vitest';
import type { RoutineWithDays } from '@chefer/database';
import { routineRow } from './__test__/fixtures.js';
import { otherEditorIds, toRoutineDto, type RoutineAttribution } from './mappers.js';

// Level-6 shape of a routine (spec §5.3, §10): trainer notes and "changed by"
// stamps, built only when the caller passes an attribution (client level >= 6).

// mappers.ts → exercise-library/ensure.ts → lib/env.ts (throws without secrets).
vi.mock('../../lib/env.js', () => ({ env: {} }));

const USER = 'u1';
const TRAINER = 'ctrainer0000000000000001';
const AT = new Date('2026-10-02T08:00:00Z');

function coached(): RoutineWithDays {
  const base = routineRow({ userId: USER });
  const [dayA, dayB] = base.days;
  if (!dayA || !dayB) throw new Error('fixture needs two days');
  return {
    ...base,
    lastEditedById: TRAINER,
    lastEditedAt: AT,
    days: [
      {
        ...dayA,
        exercises: dayA.exercises.map((e) => ({
          ...e,
          trainerNote: 'knees out',
          lastEditedById: TRAINER,
          lastEditedAt: AT,
        })),
      },
      dayB,
    ],
  };
}

const attribution = (over: Partial<RoutineAttribution> = {}): RoutineAttribution => ({
  viewerId: USER,
  names: new Map([[TRAINER, 'Ana']]),
  ...over,
});

describe('toRoutineDto', () => {
  it('without an attribution (any client below level 6) it is the legacy shape, whatever the row holds', () => {
    const dto = toRoutineDto(coached());
    const json = JSON.stringify(dto);
    for (const key of ['trainerNote', 'lastEditedByOther', 'knees out', 'Ana', TRAINER]) {
      expect(json).not.toContain(key);
    }
    expect(Object.keys(dto.days[0]?.exercises[0] ?? {}).sort()).toEqual(
      [
        'exerciseId',
        'id',
        'notes',
        'position',
        'repMax',
        'repMin',
        'restSec',
        'sets',
        'supersetGroup',
        'targetRir',
      ].sort(),
    );
  });

  it('at level 6 a row and the routine changed by someone else say who and when; untouched rows say nothing', () => {
    const dto = toRoutineDto(coached(), attribution());
    expect(dto.lastEditedByOther).toEqual({ name: 'Ana', at: AT.toISOString() });
    const changed = dto.days[0]?.exercises[0];
    expect(changed).toMatchObject({
      trainerNote: 'knees out',
      lastEditedByOther: { name: 'Ana', at: AT.toISOString() },
    });
    const untouched = dto.days[1]?.exercises[0];
    expect(untouched).not.toHaveProperty('lastEditedByOther');
    expect(untouched).not.toHaveProperty('trainerNote');
  });

  it('your own edits are never "by someone else"', () => {
    const row = coached();
    const own = {
      ...row,
      lastEditedById: USER,
      days: row.days.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) => ({ ...e, lastEditedById: USER })),
      })),
    };
    const dto = toRoutineDto(own, attribution());
    expect(dto).not.toHaveProperty('lastEditedByOther');
    expect(dto.days[0]?.exercises[0]).not.toHaveProperty('lastEditedByOther');
    // The trainer's note is still shown (it was written by the trainer).
    expect(dto.days[0]?.exercises[0]?.trainerNote).toBe('knees out');
  });

  it('an editor whose account is gone (stamp time, no editor id) reads "your trainer"', () => {
    const row = { ...coached(), lastEditedById: null };
    expect(toRoutineDto(row, attribution()).lastEditedByOther?.name).toBe('your trainer');
  });

  it('an editor with no known name (not a trainer profile) also reads "your trainer"', () => {
    const dto = toRoutineDto(coached(), attribution({ names: new Map() }));
    expect(dto.lastEditedByOther?.name).toBe('your trainer');
  });

  it('a row never edited since Phase 1 (no stamp at all) says nothing', () => {
    const dto = toRoutineDto(routineRow({ userId: USER }), attribution());
    expect(JSON.stringify(dto)).not.toContain('lastEditedByOther');
  });
});

describe('otherEditorIds', () => {
  it('collects every editor other than the viewer, once', () => {
    expect(otherEditorIds(coached(), USER)).toEqual([TRAINER]);
    expect(otherEditorIds(coached(), TRAINER)).toEqual([]);
    expect(otherEditorIds(routineRow({ userId: USER }), USER)).toEqual([]);
  });
});
