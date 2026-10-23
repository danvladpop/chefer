import { describe, expect, it } from 'vitest';
import { containsForbiddenPhrase } from '@chefer/eslint-config/rules/no-forbidden-copy';
import type { ShareCardPayload } from '@chefer/types';
import { shareCardLines } from './share-card-lines';

const ALL: ShareCardPayload[] = [
  { kind: 'recipe', title: 'Lemon pasta', imageUrl: null, totalMinutes: 25, servings: 2 },
  {
    kind: 'cook',
    title: 'Lemon pasta',
    imageUrl: null,
    totalMinutes: 25,
    servings: 1,
    nutrition: { kcal: 540, proteinG: 22 },
  },
  {
    kind: 'workout',
    title: 'Upper A',
    localDate: '2026-10-20',
    exercises: 5,
    sets: 16,
    durationMin: 52,
    prs: [{ exerciseName: 'Bench Press', label: '62.5 kg × 5' }],
  },
  {
    kind: 'recap',
    label: '12–18 Oct',
    cooking: { cookedFromPlan: 9, newRecipesTried: 2 },
    protein: { hit: 4, logged: 6 },
    training: { sessions: 3, prCount: 1, streakWeeks: 4 },
  },
];

describe('shareCardLines', () => {
  it('a recipe shows time and servings; nutrition only when snapshotted', () => {
    expect(shareCardLines(ALL[0] as ShareCardPayload)).toEqual({
      eyebrow: 'From my Chefer kitchen',
      title: 'Lemon pasta',
      stats: [
        { value: '25 min', label: 'start to finish' },
        { value: '2', label: 'servings' },
      ],
    });
    const cook = shareCardLines(ALL[1] as ShareCardPayload);
    expect(cook.eyebrow).toBe('Cooked it with Chefer');
    expect(cook.stats.map((s) => s.value)).toEqual(['25 min', '1', '540 kcal', '22 g']);
  });

  it('a workout leads with its PRs', () => {
    const lines = shareCardLines(ALL[2] as ShareCardPayload);
    expect(lines.stats[0]).toEqual({ value: '62.5 kg × 5', label: 'New best: Bench Press' });
    expect(lines.stats.map((s) => s.label)).toEqual([
      'New best: Bench Press',
      'exercises',
      'sets',
      'of training',
    ]);
  });

  it('a recap shows what happened and leaves zero counts off the card', () => {
    expect(shareCardLines(ALL[3] as ShareCardPayload).stats).toHaveLength(6);
    const quiet = shareCardLines({
      kind: 'recap',
      label: '12–18 Oct',
      cooking: { cookedFromPlan: 1, newRecipesTried: 0 },
      training: { sessions: 0, prCount: 0, streakWeeks: 0 },
    });
    expect(quiet.stats).toEqual([{ value: '1', label: 'meal cooked from my plan' }]);
    expect(JSON.stringify(quiet)).not.toMatch(/\b0\b/);
  });

  it('no card line carries forbidden or shaming wording', () => {
    for (const payload of ALL) {
      const lines = shareCardLines(payload);
      for (const text of [lines.eyebrow, ...lines.stats.map((s) => s.label)]) {
        expect(containsForbiddenPhrase(text), text).toBeNull();
      }
    }
  });
});
