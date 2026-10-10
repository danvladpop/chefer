import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Mobile UX revamp, phase 0 (docs/mobile-ux-revamp/plan.md, "Guardrails"):
// colours come from the role tokens (`bg-surface`, `text-label-secondary`,
// `useThemeColors()`), never from a hex literal or a raw Tailwind palette
// class (`text-gray-500`, `bg-emerald-50`). Two rules:
//
//  1. The revamp's own code — the shell (`app/(main)`, `src/features/shell`)
//     and the new ui-mobile components — has none at all.
//  2. Everywhere else the count may only go down (a ratchet). When a screen
//     is rebuilt, lower the baseline in the same PR; the test fails on a
//     stale (too high) baseline too, so the number can't drift back up.

const REPO = join(__dirname, '..', '..', '..', '..');
const SCANNED = ['apps/mobile/app', 'apps/mobile/src', 'packages/ui-mobile/src'];

/** Paths (prefixes) that must stay at zero. */
const CLEAN = [
  'apps/mobile/app/(main)/',
  'apps/mobile/src/features/shell/',
  'packages/ui-mobile/src/components/list.tsx',
  'packages/ui-mobile/src/components/icon-button.tsx',
  'packages/ui-mobile/src/components/large-header.tsx',
  'packages/ui-mobile/src/components/surface-card.tsx',
];

/** Files allowed to hold raw colour values: the palettes themselves. */
const PALETTE_FILES = new Set([
  'packages/ui-mobile/src/components/theme.ts',
  'packages/ui-mobile/src/components/avatar.tsx',
]);

// The count of the rest of the app, 2026-10-09. Only ever lower these.
const BASELINE = { hex: 301, palette: 804 };

const HEX = /['"`]#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})['"`]/g;
const PALETTE =
  /\b(?:text|bg|border|ring|fill|stroke|from|to|divide)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
}

const files: string[] = [];
for (const dir of SCANNED) walk(join(REPO, dir), files);

type Hit = { file: string; hex: number; palette: number };
const hits: Hit[] = files
  .map((path) => {
    const file = relative(REPO, path);
    const src = readFileSync(path, 'utf8');
    return {
      file,
      hex: PALETTE_FILES.has(file) ? 0 : (src.match(HEX) ?? []).length,
      palette: (src.match(PALETTE) ?? []).length,
    };
  })
  .filter((h) => h.hex > 0 || h.palette > 0);

describe('design drift guard', () => {
  it('the revamp code uses colour roles only', () => {
    const dirty = hits.filter((h) => CLEAN.some((prefix) => h.file.startsWith(prefix)));
    expect(dirty).toEqual([]);
  });

  it('the rest of the app never gains a hex colour or a raw palette class', () => {
    const hex = hits.reduce((n, h) => n + h.hex, 0);
    const palette = hits.reduce((n, h) => n + h.palette, 0);
    // Went down? Lower BASELINE to the new numbers in this PR.
    expect({ hex, palette }).toEqual(BASELINE);
  });
});
