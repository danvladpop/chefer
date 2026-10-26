import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ParsedWorkoutImport, WorkoutCsvParseResult } from '@chefer/types';
import { parseCsv } from '../csv';
import {
  detectWorkoutCsvSource,
  parseImportDate,
  parseImportDuration,
  parseWorkoutCsv,
} from './workout-import';

// G2: Strong and Hevy exports, as their apps write them. The fixtures are
// synthetic, modelled byte-for-byte on real exports (quoting, delimiters,
// decimal commas, multi-line notes, units in headers).

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/workout-import/${name}`, import.meta.url), 'utf8');

function ok(result: WorkoutCsvParseResult): ParsedWorkoutImport {
  if (!result.ok) throw new Error(`parse failed: ${result.reason}`);
  return result.import;
}

describe('parseCsv', () => {
  it('reads quoted fields with delimiters, "" escapes, line breaks, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,"two\nlines",3\r\n\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', 'two\nlines', '3'],
    ]);
  });

  it('sniffs semicolons from the header line', () => {
    expect(parseCsv('"a";"b,c"\n"1";"2"')).toEqual([
      ['a', 'b,c'],
      ['1', '2'],
    ]);
  });
});

describe('dates and durations', () => {
  it('reads Strong and both Hevy date styles as wall-clock times', () => {
    expect(parseImportDate('2026-02-17 19:25:59')).toMatchObject({
      localDate: '2026-02-17',
      localTime: '19:25',
    });
    expect(parseImportDate('13 Feb 2026, 9:56')).toMatchObject({
      localDate: '2026-02-13',
      localTime: '09:56',
    });
    expect(parseImportDate('Jun 11, 2026, 1:01 PM')).toMatchObject({
      localDate: '2026-06-11',
      localTime: '13:01',
    });
    expect(parseImportDate('Jun 11, 2026, 12:15 AM')).toMatchObject({ localTime: '00:15' });
    expect(parseImportDate('yesterday')).toBeNull();
  });

  it('reads seconds and Strong duration text; a workout left running has none', () => {
    expect(parseImportDuration('4419')).toBe(4419);
    expect(parseImportDuration('1h 43m')).toBe(6180);
    expect(parseImportDuration('38min')).toBe(2280);
    expect(parseImportDuration('2h')).toBe(7200);
    expect(parseImportDuration('154292')).toBeNull();
    expect(parseImportDuration('')).toBeNull();
  });
});

describe('detectWorkoutCsvSource', () => {
  it('knows each app by its header', () => {
    expect(detectWorkoutCsvSource(['title', 'start_time', 'exercise_title'])).toBe('HEVY');
    expect(detectWorkoutCsvSource(['Date', 'Exercise Name', 'Set Order'])).toBe('STRONG');
    expect(detectWorkoutCsvSource(['Date', 'Food', 'Calories'])).toBeNull();
  });
});

describe('Strong, current semicolon export', () => {
  const parsed = ok(parseWorkoutCsv(fixture('strong-semicolon.csv')));

  it('groups rows into workouts with their notes and durations', () => {
    expect(parsed.source).toBe('STRONG');
    expect(parsed.weightUnit).toBe('KG');
    expect(parsed.workouts.map((w) => [w.localDate, w.localTime, w.title, w.durationSec])).toEqual([
      ['2026-02-17', '19:25', 'Full body B', 4419],
      // 154292 s: left running for two days — no duration rather than a wrong one.
      ['2026-02-19', '07:05', 'Legs', null],
    ]);
    expect(parsed.workouts[0]?.notes).toBe('Friday, after work "heavy"');
    expect(parsed.workouts[0]?.key).toBe('STRONG|2026-02-17T19:25|Full body B');
  });

  it('keeps warm-up, working, drop and failure sets; drops rest timers; Note rows become exercise notes', () => {
    const [rdl, incline, pullUp] = parsed.workouts[0]?.exercises ?? [];
    expect(rdl?.sets.map((s) => [s.kind, s.weightKg, s.reps, s.rpe])).toEqual([
      ['warmup', 20, 8, null],
      ['normal', 35, 10, 8],
      ['normal', 37.5, 8, 9],
    ]);
    expect(incline?.notes).toBe('Rep range 11-15');
    expect(incline?.sets.map((s) => s.kind)).toEqual(['normal', 'drop']);
    expect(pullUp?.sets.map((s) => [s.kind, s.weightKg, s.reps])).toEqual([
      ['normal', 0, 8],
      ['failure', 0, 5],
    ]);
  });

  it('reads timed holds and cardio from Seconds and Distance (meters)', () => {
    const legs = parsed.workouts[1]?.exercises ?? [];
    expect(legs.find((e) => e.name === 'Side Plank')?.sets[0]).toMatchObject({
      weightKg: 0,
      reps: null,
      durationSec: 30,
    });
    expect(legs.find((e) => e.name === 'Rowing (Machine)')?.sets[0]).toMatchObject({
      distanceM: 2000,
      durationSec: 480,
    });
  });
});

describe('Strong, older comma export (no unit in the file)', () => {
  it('asks for the unit instead of guessing', () => {
    expect(parseWorkoutCsv(fixture('strong-comma.csv'))).toEqual({
      ok: false,
      reason: 'needs_unit',
      source: 'STRONG',
    });
  });

  it('converts pounds once the user says lb; distance follows (miles)', () => {
    const parsed = ok(parseWorkoutCsv(fixture('strong-comma.csv'), { weightUnit: 'LB' }));
    expect(parsed.weightUnit).toBe('LB');
    const bench = parsed.workouts[0]?.exercises[0];
    expect(bench?.sets[0]?.weightKg).toBe(61.23);
    expect(parsed.workouts.map((w) => w.durationSec)).toEqual([6180, 2280]);
    const run = parsed.workouts[1]?.exercises.find((e) => e.name === 'Running');
    expect(run?.sets[0]).toMatchObject({
      weightKg: 0,
      reps: null,
      distanceM: 4989,
      durationSec: 1500,
    });
    expect(parsed.workouts[1]?.exercises[0]?.sets[0]?.rpe).toBe(8);
  });
});

describe('Strong, legacy export with a unit per row', () => {
  it('reads the row units and decimal commas', () => {
    const parsed = ok(parseWorkoutCsv(fixture('strong-legacy.csv')));
    expect(parsed.weightUnit).toBe('KG');
    const [bench, walk] = parsed.workouts[0]?.exercises ?? [];
    expect(bench?.sets.map((s) => s.weightKg)).toEqual([40, 42.5]);
    expect(walk?.sets[0]).toMatchObject({ distanceM: 2600, durationSec: 1500 });
    expect(parsed.workouts[0]?.durationSec).toBe(4440);
  });
});

describe('Hevy', () => {
  it('kg export: set types, RPE, multi-line notes, supersets merged by name, cardio', () => {
    const parsed = ok(parseWorkoutCsv(fixture('hevy-kg.csv')));
    expect(parsed.source).toBe('HEVY');
    expect(parsed.weightUnit).toBe('KG');
    const [push, long] = parsed.workouts;
    expect(push).toMatchObject({
      title: 'Push ☀️',
      localDate: '2025-09-22',
      localTime: '14:05',
      durationSec: 75 * 60,
      notes: 'Back, chest, "fun"',
    });
    const bench = push?.exercises[0];
    expect(bench?.notes).toBe('Pause at chest\nkeep elbows in');
    expect(bench?.sets.map((s) => [s.kind, s.weightKg, s.reps, s.rpe])).toEqual([
      ['warmup', 40, 10, null],
      ['normal', 80, 6, 8.5],
      ['failure', 80, 5, 10],
    ]);
    // The pushdown appears twice around a superset partner: one block, both sets.
    expect(push?.exercises.map((e) => [e.name, e.sets.length])).toEqual([
      ['Bench Press (Barbell)', 3],
      ['Triceps Rope Pushdown', 2],
      ['Lateral Raise (Dumbbell)', 1],
    ]);
    expect(long?.exercises.find((e) => e.name === 'Running')?.sets[0]).toMatchObject({
      distanceM: 5000,
      durationSec: 1680,
    });
    expect(long?.exercises.find((e) => e.name === 'Pull Up')?.sets[0]).toMatchObject({
      weightKg: 0,
      reps: 7,
    });
  });

  it('lb export: US 12-hour dates, pounds and miles converted', () => {
    const parsed = ok(parseWorkoutCsv(fixture('hevy-lbs.csv')));
    expect(parsed.weightUnit).toBe('LB');
    const [lower] = parsed.workouts;
    expect(lower).toMatchObject({
      localDate: '2026-06-11',
      localTime: '13:01',
      durationSec: 63 * 60,
    });
    const squat = lower?.exercises.find((e) => e.name === 'Squat (Barbell)');
    expect(squat?.sets.map((s) => [s.kind, s.weightKg])).toEqual([
      ['warmup', 61.23],
      ['normal', 102.06],
    ]);
    // Assisted: the assistance, as a positive number.
    expect(
      lower?.exercises.find((e) => e.name === 'Triceps Dip (Assisted)')?.sets[0]?.weightKg,
    ).toBe(19.28);
    expect(lower?.exercises.find((e) => e.name === 'Treadmill')?.sets[0]?.distanceM).toBe(2414);
  });
});

describe('files that are not workout exports', () => {
  it('says why', () => {
    expect(parseWorkoutCsv('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseWorkoutCsv('Date,Food,Calories\n2026-01-01,Apple,95')).toMatchObject({
      ok: false,
      reason: 'unknown_format',
    });
    expect(
      parseWorkoutCsv(
        '"Date";"Exercise Name";"Set Order";"Weight (kg)"\n"not a date";"Squat";"1";"100"',
      ),
    ).toMatchObject({ ok: false, reason: 'no_workouts' });
  });

  it('skips an implausible weight rather than storing it', () => {
    const parsed = ok(
      parseWorkoutCsv(
        '"Date";"Workout Name";"Exercise Name";"Set Order";"Weight (kg)";"Reps"\n' +
          '"2026-01-01 10:00:00";"A";"Squat (Barbell)";"1";"100";"5"\n' +
          '"2026-01-01 10:00:00";"A";"Squat (Barbell)";"2";"10000";"5"',
      ),
    );
    expect(parsed.workouts[0]?.exercises[0]?.sets).toHaveLength(1);
    expect(parsed.skippedRows).toBe(1);
  });
});
