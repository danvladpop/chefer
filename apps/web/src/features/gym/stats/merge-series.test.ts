import { describe, expect, it } from 'vitest';
import { mergeByDate, type NamedChannel } from './merge-series';

describe('mergeByDate', () => {
  it('merges channels sharing the same dates', () => {
    const channels: NamedChannel[] = [
      {
        key: 'bench',
        points: [
          { localDate: '2026-01-01', value: 80 },
          { localDate: '2026-01-08', value: 82.5 },
        ],
      },
      {
        key: 'squat',
        points: [
          { localDate: '2026-01-01', value: 100 },
          { localDate: '2026-01-08', value: 105 },
        ],
      },
    ];
    expect(mergeByDate(channels)).toEqual([
      { date: '2026-01-01', bench: 80, squat: 100 },
      { date: '2026-01-08', bench: 82.5, squat: 105 },
    ]);
  });

  it('fills a null for a date where a channel has no point', () => {
    const channels: NamedChannel[] = [
      {
        key: 'bench',
        points: [
          { localDate: '2026-01-01', value: 80 },
          { localDate: '2026-01-08', value: 82.5 },
        ],
      },
      { key: 'squat', points: [{ localDate: '2026-01-08', value: 105 }] },
    ];
    expect(mergeByDate(channels)).toEqual([
      { date: '2026-01-01', bench: 80, squat: null },
      { date: '2026-01-08', bench: 82.5, squat: 105 },
    ]);
  });

  it('sorts dates ascending regardless of input order', () => {
    const channels: NamedChannel[] = [
      {
        key: 'bench',
        points: [
          { localDate: '2026-02-01', value: 1 },
          { localDate: '2026-01-01', value: 2 },
        ],
      },
    ];
    expect(mergeByDate(channels).map((r) => r['date'])).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('returns an empty array for no channels', () => {
    expect(mergeByDate([])).toEqual([]);
  });
});
