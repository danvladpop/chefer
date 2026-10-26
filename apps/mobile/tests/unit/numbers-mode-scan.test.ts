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
  // Lane E3: the revamp shell's Today / meals / log / stats, recipes and the coach.
  'src/features/shell/today',
  'src/features/shell/meals',
  'src/features/shell/tracker',
  'src/features/shell/stats',
  'src/features/shell/cookbook',
  'src/features/recipes',
  'src/features/coach',
];
const SURFACE_FILES = [
  'src/features/coach/chef-review-banner.tsx',
  'src/features/history/past-weeks-section.tsx',
  'app/(food)/index.tsx',
  'app/(food)/meal-plan.tsx',
  'app/tracker.tsx',
  'app/history/[planId].tsx',
  'app/recipe/[id].tsx',
  'app/cook/[id].tsx',
  'app/progress.tsx',
  'app/(food)/recipes.tsx',
];
// Files whose "kcal" is data plumbing (request fields), never text on screen,
// and authoring forms where the user edits a recipe's own nutrition.
const DATA_ONLY = new Set([
  'src/features/tracker/use-tracker-writes.ts',
  'src/features/recipes/video-draft-form.tsx',
]);

// Lane E3: surfaces lane A (market review 2026-10) is rewriting — the Log
// sheet's quick add. They get "Hide numbers" when lane E3 rebases onto lane A's
// merged PRs (IMPLEMENTATION-PLAN.md conflict rule A ↔ E3). Remove an entry the
// moment its file handles `noNumbers`.
const PENDING_LANE_A = new Set(['src/features/tracker/quick-add-sheet.tsx']);

// "kcal" as shown text: a template/JSX/string fragment around the word.
const KCAL_TEXT = /(\}|>|`|'|")\s*(\w+\s)?kcal\b|\bkcal\s*(\/|·|<|`|'|\{|")|kilocalor/;

const surfaceFiles = [
  ...new Set([
    ...SURFACE_DIRS.flatMap((d) => filesIn(join(ROOT, d))),
    ...SURFACE_FILES.map((f) => join(ROOT, f)),
  ]),
]
  .map((f) => relative(ROOT, f))
  .filter((f) => !DATA_ONLY.has(f));

const withoutComments = (src: string) =>
  src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');

// Lane E3 "Hide numbers": a protein or macro figure shown as text. In NONE these
// must disappear too, so the file has to consult `noNumbers` / `show.*` or render
// through `<NutritionNumber>`.
const PROTEIN_TEXT =
  /\bg protein\b|proteinLabel\(|proteinRingLabel\(|proteinAverageText\(|nutritionLabel\(|proteinGuide(\??\.)label|\bg (carbs|fat)\b|\}\s*g\b/;
const NONE_AWARE = /noNumbers|show\.(protein|macros|kcal)|NutritionNumber/;

describe('hide-numbers mode source scan (lane E3)', () => {
  it('every surface that shows a protein or macro figure also hides it in "Hide numbers"', () => {
    const offenders = surfaceFiles.filter((f) => {
      if (PENDING_LANE_A.has(f)) return false;
      const src = withoutComments(readFileSync(join(ROOT, f), 'utf8'));
      return PROTEIN_TEXT.test(src) && !NONE_AWARE.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('the lane-A waiting list only names files that still need it', () => {
    for (const f of PENDING_LANE_A) {
      expect(NONE_AWARE.test(readFileSync(join(ROOT, f), 'utf8'))).toBe(false);
    }
  });
});

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
