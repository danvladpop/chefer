import { describe, expect, it } from 'vitest';
import { containsForbiddenPhrase } from '@chefer/eslint-config/rules/no-forbidden-copy';
import { catalogs } from './catalog';

// ─── Copy audit for the `today` namespace (lanes D and E, lane J phase 4) ─────
// Lane E3's promise, now that the copy lives in the catalogs instead of the
// @chefer/utils copy objects that copy-lint.test.ts scans: Today, progress,
// reminders, the recap, share cards and "Hide numbers" never shame, never
// guilt-trip, never suggest making up for a meal, and never read as a medical
// or safety claim. English goes through the ESLint rule's own list
// (FORBIDDEN_PHRASES, additive only) plus a few guilt phrases; Romanian gets the
// equivalent list below. Keep both lists additive.

/** Guilt and nagging, on top of FORBIDDEN_PHRASES ("missed", "compensate", …). */
const EXTRA_EN = ['don’t forget', "don't forget", 'guilt', 'guilty', 'shame', 'you failed'];

/**
 * The Romanian equivalents of FORBIDDEN_PHRASES and EXTRA_EN. Whole words,
 * case-insensitive, diacritics included („sigur” never matches „siguranță”;
 * that one has its own entry).
 */
export const FORBIDDEN_PHRASES_RO = [
  // Safety/medical guarantees ("safe", "allergen-free", "guaranteed", "suitable for"…)
  'sigur',
  'sigură',
  'sigure',
  'siguri',
  'în siguranță',
  'fără riscuri',
  'fără alergeni',
  'fără nuci',
  'garantat',
  'garantată',
  'garantate',
  'garantați',
  'garantăm',
  'potrivit pentru',
  'potrivită pentru',
  'potrivite pentru',
  'potriviți pentru',
  'adecvat pentru',
  'adecvată pentru',
  'profil nutrițional',
  'diabetici',
  'diabetice',
  // "cure", "treat", "prevent", "diagnose"
  'vindecă',
  'vindecare',
  'vindecat',
  'vindecată',
  'tratează',
  'tratament',
  'tratamente',
  'tratamentul',
  'previne',
  'prevenire',
  'prevenirea',
  'previn',
  'diagnostic',
  'diagnostichează',
  'diagnosticat',
  'diagnosticare',
  'sfat medical',
  'sfaturi medicale',
  'dovedit clinic',
  'dovedită clinic',
  'testat clinic',
  // Shame-free streaks and tracking ("missed", "0-week streak")
  'ratat',
  'ratată',
  'ratate',
  'ratați',
  'ai ratat',
  '0 săptămâni la rând',
  // No compensation advice ("compensate", "make up for", "burn it off", "cheat day")
  'compensa',
  'compensezi',
  'compensează',
  'compensare',
  'compensarea',
  'compensând',
  'să recuperezi',
  'să le arzi',
  'să o arzi',
  'arde-le',
  'să le dai jos',
  'cheat',
  'zi de răsfăț',
  // Guilt and nagging ("don't forget", "guilt", "shame")
  'nu uita',
  'vinovat',
  'vinovată',
  'vinovăție',
  'vinovăția',
  'rușine',
  'ai eșuat',
] as const;

/** The disclaimer itself disclaims advice: "nu este un sfat medical". */
const ALLOWED_NEGATED_RO = [
  'nu este un sfat medical',
  'nu e un sfat medical',
  'nu oferă sfaturi medicale',
  'nu dă sfaturi medicale',
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole word with Unicode letters: `\b` treats ș, ț, ă… as word breaks. */
const wordRegex = (phrase: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase)}(?![\\p{L}\\p{N}])`, 'iu');

function firstMatch(text: string, phrases: readonly string[], allowed: readonly string[] = []) {
  let scanned = text;
  for (const a of allowed) scanned = scanned.replace(new RegExp(escape(a), 'giu'), '');
  return phrases.find((p) => wordRegex(p).test(scanned)) ?? null;
}

type Leaf = { path: string; text: string };

function leaves(node: unknown, prefix: string): Leaf[] {
  if (typeof node === 'string') return [{ path: prefix, text: node }];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, `${prefix}.${k}`),
  );
}

const enLeaves = leaves(catalogs.en.today, 'today');
const roLeaves = leaves(catalogs.ro.today, 'today');

describe('today catalog copy audit (lane E3)', () => {
  it('scans a real catalog (the guard cannot pass on an empty namespace)', () => {
    expect(enLeaves.length).toBeGreaterThan(300);
    expect(roLeaves.length).toBeGreaterThanOrEqual(enLeaves.length);
  });

  it('English: no forbidden phrase, no guilt', () => {
    const offenders = enLeaves
      .map(({ path, text }) => ({
        path,
        phrase: containsForbiddenPhrase(text) ?? firstMatch(text, EXTRA_EN),
        text,
      }))
      .filter((o) => o.phrase !== null);
    expect(offenders).toEqual([]);
  });

  it('Romanian: no forbidden phrase in either language, no guilt', () => {
    const offenders = roLeaves
      .map(({ path, text }) => ({
        path,
        phrase:
          firstMatch(text, FORBIDDEN_PHRASES_RO, ALLOWED_NEGATED_RO) ??
          containsForbiddenPhrase(text) ??
          firstMatch(text, EXTRA_EN),
        text,
      }))
      .filter((o) => o.phrase !== null);
    expect(offenders).toEqual([]);
  });

  it('the Romanian checker catches known-bad sentences and spares near misses', () => {
    expect(firstMatch('Ai ratat micul dejun.', FORBIDDEN_PHRASES_RO)).toBe('ratat');
    expect(firstMatch('Mâine poți compensa cu o salată.', FORBIDDEN_PHRASES_RO)).toBe('compensa');
    expect(firstMatch('Nu uita să înregistrezi cina!', FORBIDDEN_PHRASES_RO)).toBe('nu uita');
    expect(firstMatch('Rețetă garantată fără alergeni.', FORBIDDEN_PHRASES_RO)).toBe(
      'fără alergeni',
    );
    // Whole words only: „siguranță” is not „sigur”, „recuperare” is not „să recuperezi”.
    expect(firstMatch('Siguranța datelor tale', ['sigur'])).toBeNull();
    expect(firstMatch('Odihnă și recuperare după antrenament.', FORBIDDEN_PHRASES_RO)).toBeNull();
    expect(
      firstMatch('Chefer nu oferă sfaturi medicale.', FORBIDDEN_PHRASES_RO, ALLOWED_NEGATED_RO),
    ).toBeNull();
  });
});
