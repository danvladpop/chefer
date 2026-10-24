import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Mobile UX revamp, phase 0 (docs/mobile-ux-revamp/plan.md, "Guardrails"),
// tightened for night mode (phase 4): colours come from the role tokens
// (`bg-surface`, `text-label-secondary`, `useThemeColors()`), which carry a
// Day and a Night value. A hex literal, a raw Tailwind palette class
// (`text-gray-500`, `bg-emerald-50`), `bg-white` / `text-black`, or a
// colour pinned to one scheme (`colorsFor('light')`) stays the same at
// night — light grey on a dark screen. None are allowed anywhere.
//
// A real exception (white text on a photo, the QR code that must stay dark
// on light, a third-party brand mark) carries `drift-ok: <why>` on its line
// or the line above. `bg-black/40`-style scrims are fine in both schemes.

const REPO = join(__dirname, '..', '..', '..', '..');
const SCANNED = ['apps/mobile/app', 'apps/mobile/src', 'packages/ui-mobile/src'];

/** Files allowed to hold raw colour values: the per-scheme palettes themselves. */
const PALETTE_FILES = new Set([
  'packages/ui-mobile/src/components/theme.ts',
  'packages/ui-mobile/src/hooks/use-theme-colors.ts',
  // Deep initials circles with white text: ≥ 4.5:1 and readable on Day and Night.
  'packages/ui-mobile/src/components/avatar.tsx',
]);

const RULES: Record<string, RegExp> = {
  hex: /['"`]#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})['"`]/g,
  palette:
    /\b(?:text|bg|border(?:-[xytrbl])?|ring|fill|stroke|from|to|via|divide|placeholder|shadow|outline|decoration|accent|caret)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
  // White anywhere; black unless it is a translucent scrim (bg-black/40).
  mono: /\b(?:text|bg|border(?:-[xytrbl])?|ring|fill|stroke|from|to|via|divide|placeholder|shadow|outline|decoration|accent|caret)-(?:white\b|black\b(?!\/))/g,
  pinnedScheme: /colorsFor\(\s*['"](?:light|dark)['"]\s*\)/g,
  // color="white", tintColor: 'black' — a named colour in a prop or style.
  named: /['"](?:white|black)['"]/g,
};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
}

const files: string[] = [];
for (const dir of SCANNED) walk(join(REPO, dir), files);

type Hit = { file: string; line: number; rule: string; match: string };

function scan(file: string, src: string): Hit[] {
  const lines = src.split('\n');
  const out: Hit[] = [];
  lines.forEach((text, i) => {
    if (text.includes('drift-ok') || (lines[i - 1] ?? '').includes('drift-ok')) return;
    for (const [rule, re] of Object.entries(RULES)) {
      for (const match of text.match(re) ?? []) out.push({ file, line: i + 1, rule, match });
    }
  });
  return out;
}

const hits: Hit[] = files.flatMap((path) => {
  const file = relative(REPO, path);
  return PALETTE_FILES.has(file) ? [] : scan(file, readFileSync(path, 'utf8'));
});

describe('design drift guard', () => {
  it('every colour is a role (follows Day and Night)', () => {
    expect(hits.map((h) => `${h.file}:${h.line} ${h.rule} ${h.match}`)).toEqual([]);
  });

  it('a drift-ok marker says why', () => {
    const bare = files.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((text, i) => ({ file: relative(REPO, path), line: i + 1, text }))
        .filter(({ text }) => text.includes('drift-ok') && !/drift-ok: \S/.test(text)),
    );
    expect(bare.map((b) => `${b.file}:${b.line}`)).toEqual([]);
  });
});
