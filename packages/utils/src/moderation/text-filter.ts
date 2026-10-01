import { BLOCKED_TERMS } from './blocked-terms';

// Write-time word filter (PRD §9.4). Deterministic, bundled, no network. It runs
// on recipe name/description (when shared) and on display names.

/** `0→o 1→i 3→e 4→a 5→s @→a $→s` (implementation-plan §3.2). */
const LEET: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '@': 'a',
  $: 's',
};

/** Zero-width and soft-hyphen characters used to split a word invisibly. */
const INVISIBLES = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

function foldText(text: string, oneAs: 'i' | 'l' = 'i'): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(INVISIBLES, '')
    .replace(/[01345@$]/g, (c) => (c === '1' ? oneAs : (LEET[c] ?? c)));
}

function finish(folded: string): string {
  return folded.replace(/[^\p{L}]+/gu, ' ').trim();
}

/**
 * The comparison form of a text: lowercase, diacritics stripped, leet-speak
 * mapped, letters repeated three or more times collapsed to two, every other
 * character turned into a space, whitespace collapsed.
 *
 * `Ștefan` → `stefan`, `F U Ü C K` → `f u u c k`, `sh1111t` → `shiit`.
 */
export function normalizeForFilter(text: string): string {
  return finish(foldText(text).replace(/(\p{L})\1{2,}/gu, '$1$1'));
}

/**
 * The forms of a text the filter compares: the spec form (runs of 3+ → 2, which
 * catches a stretched double letter like "niggggger") and a squashed form (runs
 * of 3+ → 1, which catches a stretched single letter like "fuuuuck"). A "1" is
 * read as "i" (the spec) and, in a second pass, as "l" ("pu1a").
 */
function variants(text: string): string[] {
  const out = new Set<string>();
  for (const oneAs of text.includes('1') ? (['i', 'l'] as const) : (['i'] as const)) {
    const folded = foldText(text, oneAs);
    out.add(finish(folded.replace(/(\p{L})\1{2,}/gu, '$1$1')));
    out.add(finish(folded.replace(/(\p{L})\1{2,}/gu, '$1')));
  }
  return [...out];
}

// ─── Compiled term index ───────────────────────────────────────────────────────

type Index = { words: Set<string>; phrases: string[][] };

let cached: Index | undefined;

function index(): Index {
  if (cached) return cached;
  const words = new Set<string>();
  const phrases: string[][] = [];
  for (const term of BLOCKED_TERMS) {
    const normal = normalizeForFilter(term);
    if (normal === '') continue;
    const parts = normal.split(' ');
    if (parts.length > 1) phrases.push(parts);
    else words.add(normal);
  }
  cached = { words, phrases };
  return cached;
}

const MAX_JOINED_LETTERS = 8;

/** Runs of single-letter tokens ("f u c k") joined into candidate words, every window of 3+. */
function joinedLetterRuns(tokens: readonly string[]): string[] {
  const out: string[] = [];
  let i = 0;
  const single = (k: number): boolean => (tokens[k]?.length ?? 0) === 1;
  while (i < tokens.length) {
    if (!single(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < tokens.length && single(j)) j++;
    const run = tokens.slice(i, j);
    for (let a = 0; a < run.length; a++) {
      for (let b = a + 3; b <= Math.min(run.length, a + MAX_JOINED_LETTERS); b++) {
        out.push(run.slice(a, b).join(''));
      }
    }
    i = j;
  }
  return out;
}

function tokensContainBlocked(tokens: readonly string[], idx: Index): boolean {
  if (tokens.some((t) => idx.words.has(t))) return true;
  for (const phrase of idx.phrases) {
    for (let s = 0; s + phrase.length <= tokens.length; s++) {
      if (phrase.every((word, k) => tokens[s + k] === word)) return true;
    }
  }
  return joinedLetterRuns(tokens).some((w) => idx.words.has(w));
}

/**
 * True when `text` contains a blocked word or phrase. Whole-token matching on
 * the normalised text: never a substring, so innocent words that merely contain
 * a blocked one ("Scunthorpe", "assessment", "cocktail", "Sussex") pass.
 */
export function containsBlockedTerm(text: string): boolean {
  const idx = index();
  return variants(text).some((v) => v !== '' && tokensContainBlocked(v.split(' '), idx));
}

/** Which field trips the filter first: the name, then the description; `null` when clean. */
export function firstBlockedField(input: {
  name?: string | null;
  description?: string | null;
}): 'name' | 'description' | null {
  if (input.name && containsBlockedTerm(input.name)) return 'name';
  if (input.description && containsBlockedTerm(input.description)) return 'description';
  return null;
}
