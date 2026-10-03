import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// WP-02 / audit UX-X-03: `isLoading || !data` renders a failed load as an
// endless spinner or an empty state. New code goes through `useQueryState` /
// `QueryStateView` (@chefer/ui-mobile) so an error always reaches ErrorState.
// This scan fails on any NEW bare `isLoading || !…` / `isPending || !…`.
// ALLOWED lists today's occurrences; converting a screen means deleting its
// entry (the "stale allow-list" test below then keeps the list honest).

const ROOT = join(__dirname, '..', '..');
const SCANNED = ['app', 'src'];

/** `relative/path.tsx: matched snippet` for each known occurrence. */
const ALLOWED: string[] = [
  // Query screens still to convert (lanes B / C of WP-02).
  'src/features/preferences/targets-card.tsx: isLoading || !data',
  'src/features/meal-plan/plan-settings-sheet.tsx: isLoading || !draft',
  'src/features/gym/stats/stats-tab.tsx: isLoading || !bootstrap',
  // Not a query: `isPending` is a mutation's flag guarding a missing argument.
  'src/features/tracker/quick-add-sheet.tsx: isPending || !ingredient',
];

// Bare identifier (not `mutation.isPending`), then `||`, then a negation.
const PATTERN = /(?<![.\w])(isLoading|isPending)\s*\|\|\s*!\s*[\w]+/g;

function files(path: string): string[] {
  const abs = join(ROOT, path);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((name) => files(join(path, name)));
}

function occurrences(): string[] {
  return SCANNED.flatMap(files)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(PATTERN)].map(
        (m) => `${relative(ROOT, file)}: ${m[0].replace(/\s+/g, ' ')}`,
      );
    });
}

describe('no `isLoading || !data` (use useQueryState)', () => {
  const found = occurrences();

  it('scans the app', () => {
    expect(SCANNED.flatMap(files).length).toBeGreaterThan(100);
  });

  it('has no occurrence beyond the allow-list', () => {
    const fresh = found.filter((hit) => !ALLOWED.includes(hit));
    expect(fresh).toEqual([]);
  });

  it('has no stale allow-list entries (delete an entry once its screen is converted)', () => {
    const stale = ALLOWED.filter((entry) => !found.includes(entry));
    expect(stale).toEqual([]);
  });
});
