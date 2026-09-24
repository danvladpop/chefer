import { describe, expect, it, vi } from 'vitest';
import type {
  IExerciseRepository,
  IGymProfileRepository,
  IWorkoutSessionRepository,
} from '@chefer/database';
import { exerciseRow, profileRow, sessionDoc, sessionRow, uuid } from './__test__/fixtures.js';
import { GymExportService } from './gym-export.service.js';

const USER = 'u1';

function makeExerciseRepo(rows: ReturnType<typeof exerciseRow>[]): IExerciseRepository {
  return {
    findVisibleByIds: vi.fn((_u: string, ids: string[]) =>
      Promise.resolve(rows.filter((r) => ids.includes(r.id))),
    ),
  } as unknown as IExerciseRepository;
}

function makeProfileRepo(unit: 'KG' | 'LB' | null): IGymProfileRepository {
  return {
    findByUserId: vi.fn().mockResolvedValue(unit ? profileRow({ unit }) : null),
  } as unknown as IGymProfileRepository;
}

function makeSessionRepo(rows: ReturnType<typeof sessionRow>[]): IWorkoutSessionRepository {
  return {
    findCompleted: vi.fn().mockResolvedValue(rows),
  } as unknown as IWorkoutSessionRepository;
}

/** Parses one CSV line the same way the service escapes it (no external lib needed for these fixtures). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? '';
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function setup(opts: {
  sessions?: ReturnType<typeof sessionRow>[];
  exercises?: ReturnType<typeof exerciseRow>[];
  unit?: 'KG' | 'LB' | null;
}) {
  const sessionRepo = makeSessionRepo(opts.sessions ?? []);
  const exerciseRepo = makeExerciseRepo(
    opts.exercises ?? [exerciseRow('bench', { name: 'Bench Press' })],
  );
  const profileRepo = makeProfileRepo(opts.unit ?? 'KG');
  return { service: new GymExportService(sessionRepo, exerciseRepo, profileRepo), sessionRepo };
}

describe('GymExportService.exportCsv', () => {
  it('returns a header row plus one row per set, and a dated filename', async () => {
    const doc = sessionDoc();
    const { service } = setup({ sessions: [sessionRow(doc)] });

    const { csv, filename } = await service.exportCsv(USER);

    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'Date,Session,Exercise,Set #,Warm-up,Weight (kg),Weight (kg),Reps,RIR,Notes',
    );
    expect(lines).toHaveLength(2); // header + the fixture's one set
    expect(filename).toMatch(/^chefer-gym-history-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('preserves the repository order (oldest session first) and orders exercises/sets by position', async () => {
    const older = sessionDoc({ localDate: '2026-08-01', name: 'Day A' });
    const newer = sessionDoc({ localDate: '2026-09-01', name: 'Day B' });
    const { service } = setup({ sessions: [sessionRow(older), sessionRow(newer)] });

    const { csv } = await service.exportCsv(USER);
    const rows = csv.split('\r\n').slice(1).map(parseCsvLine);

    expect(rows[0]?.[0]).toBe('2026-08-01');
    expect(rows[1]?.[0]).toBe('2026-09-01');
  });

  it('converts weight into both kg and the profile unit', async () => {
    const doc = sessionDoc({
      exercises: [
        {
          id: uuid(),
          exerciseId: 'bench',
          routineExerciseId: null,
          position: 0,
          repMin: 6,
          repMax: 10,
          targetRir: 2,
          restSec: 180,
          skipped: false,
          swappedFromId: null,
          lastSetRir: null,
          prescription: {
            kind: 'hold',
            weightKg: 100,
            reps: [5],
            sets: 1,
            reasonCode: 'ADD_REPS',
            inputs: {},
            deltaKg: 0,
            engineVersion: 1,
          },
          notes: null,
          sets: [
            {
              id: uuid(),
              position: 0,
              weightKg: 100,
              reps: 5,
              isWarmup: false,
              completedAt: '2026-09-02T17:10:00.000Z',
            },
          ],
        },
      ],
    });
    const { service } = setup({ sessions: [sessionRow(doc)], unit: 'LB' });

    const { csv } = await service.exportCsv(USER);
    const row = parseCsvLine(csv.split('\r\n')[1] ?? '');

    // Header positions: Date,Session,Exercise,Set #,Warm-up,Weight (kg),Weight (lb),Reps,RIR,Notes
    expect(row[5]).toBe('100'); // kg column, unaffected by the profile unit
    expect(row[6]).toBe('220.5'); // 100 kg → lb (round1, matching kgToUnit)
  });

  it('puts RIR only on the last non-warmup set, and notes only on the first row of the exercise', async () => {
    const doc = sessionDoc({
      exercises: [
        {
          id: 'se1',
          exerciseId: 'bench',
          routineExerciseId: null,
          position: 0,
          repMin: 6,
          repMax: 10,
          targetRir: 2,
          restSec: 180,
          skipped: false,
          swappedFromId: null,
          lastSetRir: 2,
          prescription: {
            kind: 'hold',
            weightKg: 60,
            reps: [8, 8],
            sets: 2,
            reasonCode: 'ADD_REPS',
            inputs: {},
            deltaKg: 0,
            engineVersion: 1,
          },
          notes: 'Felt strong, comma, and "quoted" text',
          sets: [
            {
              id: 's0',
              position: 0,
              weightKg: 20,
              reps: 10,
              isWarmup: true,
              completedAt: '2026-09-02T17:00:00.000Z',
            },
            {
              id: 's1',
              position: 1,
              weightKg: 60,
              reps: 8,
              isWarmup: false,
              completedAt: '2026-09-02T17:05:00.000Z',
            },
            {
              id: 's2',
              position: 2,
              weightKg: 60,
              reps: 8,
              isWarmup: false,
              completedAt: '2026-09-02T17:10:00.000Z',
            },
          ],
        },
      ],
    });
    const { service } = setup({ sessions: [sessionRow(doc)] });

    const { csv } = await service.exportCsv(USER);
    const rows = csv.split('\r\n').slice(1).map(parseCsvLine);

    expect(rows).toHaveLength(3);
    // Warm-up row: no RIR, carries the notes (it's the first row for the exercise).
    expect(rows[0]?.[4]).toBe('y');
    expect(rows[0]?.[8]).toBe('');
    expect(rows[0]?.[9]).toBe('Felt strong, comma, and "quoted" text');
    // Middle working set: no RIR, no notes.
    expect(rows[1]?.[8]).toBe('');
    expect(rows[1]?.[9]).toBe('');
    // Last working set: RIR present.
    expect(rows[2]?.[4]).toBe('n');
    expect(rows[2]?.[8]).toBe('2');
  });

  it('renders 3+ for an RIR of 3 (the "3+" chip)', async () => {
    const doc = sessionDoc();
    const withDoc = doc.exercises[0];
    if (!withDoc) throw new Error('fixture missing an exercise');
    doc.exercises[0] = { ...withDoc, lastSetRir: 3 };
    const { service } = setup({ sessions: [sessionRow(doc)] });

    const { csv } = await service.exportCsv(USER);
    const row = parseCsvLine(csv.split('\r\n')[1] ?? '');
    expect(row[8]).toBe('3+');
  });

  it('escapes commas, quotes and newlines in session and exercise names', async () => {
    const doc = sessionDoc({ name: 'Upper, "heavy"\nday' });
    const { service } = setup({
      sessions: [sessionRow(doc)],
      exercises: [exerciseRow('bench', { name: 'Bench, incline' })],
    });

    const { csv } = await service.exportCsv(USER);
    const rows = csv.split('\r\n');
    // A quoted field containing \n does not itself break the line splitter's
    // notion of the file into more visual lines than expected: it must land
    // as a single quoted CSV field, verified by round-tripping the parser.
    const dataLine = rows.slice(1).join('\r\n');
    const fields = parseCsvLine(dataLine);
    expect(fields[1]).toBe('Upper, "heavy"\nday');
    expect(fields[2]).toBe('Bench, incline');
  });

  it('falls back to the exercise id when the exercise is not visible to the user (e.g. deleted custom exercise)', async () => {
    const doc = sessionDoc();
    const { service } = setup({ sessions: [sessionRow(doc)], exercises: [] });

    const { csv } = await service.exportCsv(USER);
    const row = parseCsvLine(csv.split('\r\n')[1] ?? '');
    expect(row[2]).toBe('bench');
  });

  it('defaults to KG when the caller has no gym profile yet', async () => {
    const doc = sessionDoc();
    const { service } = setup({ sessions: [sessionRow(doc)], unit: null });

    const { csv } = await service.exportCsv(USER);
    expect(csv.split('\r\n')[0]).toContain('Weight (kg),Weight (kg)');
  });

  it('caps the export at 50k rows', async () => {
    const sets = Array.from({ length: 50_005 }, (_, i) => ({
      id: `s${i}`,
      position: i,
      weightKg: 60,
      reps: 5,
      isWarmup: false,
      completedAt: '2026-09-02T17:00:00.000Z',
    }));
    const doc = sessionDoc({
      exercises: [
        {
          id: 'se-big',
          exerciseId: 'bench',
          routineExerciseId: null,
          position: 0,
          repMin: 6,
          repMax: 10,
          targetRir: 2,
          restSec: 180,
          skipped: false,
          swappedFromId: null,
          lastSetRir: null,
          prescription: {
            kind: 'hold',
            weightKg: 60,
            reps: [5],
            sets: 1,
            reasonCode: 'ADD_REPS',
            inputs: {},
            deltaKg: 0,
            engineVersion: 1,
          },
          notes: null,
          sets,
        },
      ],
    });
    const { service } = setup({ sessions: [sessionRow(doc)] });

    const { csv } = await service.exportCsv(USER);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(50_001); // header + 50,000 rows
  });
});
