import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// WP-08 source scan: no screen can start showing a kcal figure on the Today,
// tracker, plan, weekly-review or history surfaces without being protein-only
// aware, and the mode is only ever read through `useNumbersMode()` (one
// predicate, never an ad-hoc string check at a call site).

const ROOT = join(__dirname, '..', '..', '..');

function filesIn(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesIn(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const SURFACE_DIRS = [
  'src/features/dashboard',
  'src/features/tracker',
  'src/features/meal-plan',
  'src/features/nutrition',
  'src/features/history',
];
const SURFACE_FILES = [
  'src/features/coach/components/ChefReviewBanner.tsx',
  'src/app/(dashboard)/dashboard/page.tsx',
  'src/app/(dashboard)/meal-plan/page.tsx',
  'src/app/(dashboard)/tracker/page.tsx',
];
// Files whose "kcal" is data plumbing (request fields, math), never text on screen.
const DATA_ONLY = new Set([
  'src/features/tracker/lib/use-tracker-writes.ts',
  'src/features/tracker/lib/use-slot-actions.ts',
  'src/features/tracker/lib/scan-client.ts',
  'src/features/tracker/lib/tracker-utils.ts',
  'src/features/tracker/lib/rebalance-storage.ts',
  'src/features/meal-plan/plan-miss.ts',
]);

// "kcal" as shown text: a template/JSX/string fragment around the word.
const KCAL_TEXT = /(\}|>|`|'|")\s*(\w+\s)?kcal\b|\bkcal\s*(\/|·|<|`|'|\{|")|kilocalor/;

const surfaceFiles = [
  ...SURFACE_DIRS.flatMap((d) => filesIn(join(ROOT, d))),
  ...SURFACE_FILES.map((f) => join(ROOT, f)),
]
  .map((f) => relative(ROOT, f))
  .filter((f) => !DATA_ONLY.has(f));

const withoutComments = (src: string) =>
  src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
    .join('\n');

describe('protein-only mode source scan (WP-08)', () => {
  it('every Today / tracker / plan / review file that renders kcal text is protein-only aware', () => {
    const offenders = surfaceFiles.filter((f) => {
      const src = withoutComments(readFileSync(join(ROOT, f), 'utf8'));
      return KCAL_TEXT.test(src) && !/useNumbersMode|proteinOnly/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('scans a real set of files (the guard cannot pass on an empty list)', () => {
    expect(surfaceFiles.length).toBeGreaterThan(30);
    expect(surfaceFiles).toContain('src/features/dashboard/components/nutrition-summary.tsx');
    expect(surfaceFiles).toContain('src/app/(dashboard)/tracker/page.tsx');
  });

  it('only the numbers-mode module, its picker and the onboarding draft type name PROTEIN_ONLY', () => {
    const named = filesIn(join(ROOT, 'src'))
      .filter((f) => readFileSync(f, 'utf8').includes('PROTEIN_ONLY'))
      .map((f) => relative(ROOT, f))
      .sort();
    expect(named).toEqual([
      'src/features/numbers-mode/numbers-mode-choice.tsx',
      'src/features/numbers-mode/numbers-mode.tsx',
      // the onboarding draft's typed value ('FULL' | 'PROTEIN_ONLY')
      'src/features/onboarding/types.ts',
    ]);
  });
});
