import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { weeklyAverage, weeklyAverageText } from '@chefer/utils';
import {
  replacedMessage,
  skippedMessage,
  SLOT_COPY,
  youHadText,
} from '../../src/features/tracker/slot-copy';

// WP-06 (Food 2): eating out is not "off-plan", logging is not "honest", over
// and under are reported not judged, and the week's average is the number that
// gets the praise. The grep half of the acceptance: no such copy in this
// platform's user-facing strings (comments and test ids may keep the names).

const ROOT = join(__dirname, '..', '..');
const FORBIDDEN = /off-plan|off plan|honestly|stays honest|log it honestly/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Source with comments and test ids removed: what is left can reach a user. */
function userFacing(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
    .replace(/testID=\{`[^`]*`\}/g, '')
    .replace(/testID=(?:"[^"]*"|\{'[^']*'\})/g, '');
}

describe('Neutral copy (Food 2)', () => {
  it('has no "off-plan" / "honestly" / "stays honest" in any mobile user-facing string', () => {
    const offenders = [join(ROOT, 'app'), join(ROOT, 'src')]
      .flatMap(sourceFiles)
      .filter((file) => FORBIDDEN.test(userFacing(readFileSync(file, 'utf8'))))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('the swap and skip copy judges nothing', () => {
    const copy = [
      ...Object.values(SLOT_COPY),
      skippedMessage('dinner'),
      replacedMessage('Shawarma · normal', 'dinner'),
      youHadText({ custom: { name: 'Shawarma · normal' }, kcal: 650 }),
    ].join(' ');
    expect(copy).not.toMatch(/cheat|fail|bad|guilt|miss|honest|off-plan|off plan|should/i);
    expect(youHadText({ custom: { name: 'Shawarma' }, kcal: 650 })).toBe(
      'You had: Shawarma (≈ 650 kcal)',
    );
    expect(skippedMessage('lunch')).toBe('Lunch skipped');
  });
});

describe('weeklyAverage (the praised number)', () => {
  const day = (date: string, kcal: number, protein: number, hasLog = true) => ({
    date,
    totalKcal: kcal,
    totalProtein: protein,
    hasLog,
  });

  it('averages the logged days and leaves today (still being logged) out', () => {
    const avg = weeklyAverage(
      [
        day('2026-09-01', 1600, 110),
        day('2026-09-02', 1680, 114),
        day('2026-09-03', 0, 0, false),
        day('2026-09-04', 300, 10),
      ],
      '2026-09-04',
    );
    expect(avg).toEqual({ kcal: 1640, protein: 112, days: 2 });
    expect(weeklyAverageText(avg ?? { kcal: 0, protein: 0 })).toBe(
      'This week you averaged 1,640 kcal · 112 g protein a day',
    );
  });

  it('needs at least two logged days before it says "average"', () => {
    expect(weeklyAverage([day('2026-09-01', 1600, 110)], '2026-09-04')).toBeNull();
    expect(weeklyAverage([], '2026-09-04')).toBeNull();
  });

  it('does not count a high day or a low day differently: it only averages', () => {
    const avg = weeklyAverage([day('2026-09-01', 2600, 90), day('2026-09-02', 1000, 150)], 'x');
    expect(avg).toEqual({ kcal: 1800, protein: 120, days: 2 });
  });
});
