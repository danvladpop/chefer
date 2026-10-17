import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// WP-08 source scan: no screen can start showing a kcal figure on the Today,
// tracker, plan or weekly-review surfaces without being protein-only aware, and
// the mode is only ever read through `useNumbersMode()` (one predicate, never an
// ad-hoc string check at a call site).

const ROOT = join(__dirname, '..', '..');

function filesIn(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesIn(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const SURFACE_DIRS = [
  'src/features/dashboard',
  'src/features/tracker',
  'src/features/meal-plan',
  'src/features/nutrition',
];
const SURFACE_FILES = [
  'src/features/coach/chef-review-banner.tsx',
  'src/features/history/past-weeks-section.tsx',
  'app/(food)/index.tsx',
  'app/(food)/meal-plan.tsx',
  'app/tracker.tsx',
  'app/history/[planId].tsx',
];
// Files whose "kcal" is data plumbing (request fields), never text on screen.
const DATA_ONLY = new Set(['src/features/tracker/use-tracker-writes.ts']);

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
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
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
    expect(surfaceFiles).toContain('app/tracker.tsx');
  });

  it('only the numbers-mode module, its picker and the onboarding draft name PROTEIN_ONLY', () => {
    const named = [...filesIn(join(ROOT, 'src')), ...filesIn(join(ROOT, 'app'))]
      .filter((f) => readFileSync(f, 'utf8').includes('PROTEIN_ONLY'))
      .map((f) => relative(ROOT, f))
      .sort();
    expect(named).toEqual([
      'src/features/numbers-mode/numbers-mode.tsx',
      'src/features/onboarding/onboarding-draft.ts',
      'src/features/preferences/numbers-mode-choice.tsx',
    ]);
  });
});
