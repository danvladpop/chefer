// Name-only people search (PRD §10). Names are normalised the same way on both
// sides of the comparison: lowercase, diacritics stripped, punctuation turned
// into spaces, whitespace collapsed. There is deliberately no email handling
// anywhere in here: an "@" is ordinary punctuation (INV-6).

/** Letters that don't decompose under NFKD but have an obvious ASCII reading. */
const FOLD: Readonly<Record<string, string>> = {
  ß: 'ss',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
  æ: 'ae',
  œ: 'oe',
  ı: 'i',
};

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[ßøđðłþæœı]/g, (c) => FOLD[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * The stored, searchable form of a person's name: `first last` (falling back to
 * the account `name`), e.g. `Ștefan Ioana-Maria Pop` → `stefan ioana maria pop`.
 */
export function normalizeSearchName(
  first: string | null | undefined,
  last: string | null | undefined,
  name?: string | null,
): string {
  const parts = [first, last].filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  const source = parts.length > 0 ? parts.join(' ') : (name ?? '');
  return fold(source);
}

/** The normalised, whitespace-split tokens of a search query. `@` is plain text. */
export function queryTokens(query: string): string[] {
  const folded = fold(query);
  return folded === '' ? [] : folded.split(' ');
}

/**
 * A profile matches when EVERY query token is a prefix of SOME name token
 * ("ana pop" finds "Ana-Maria Popescu"). No tokens never matches (an empty
 * query must not list everyone).
 */
export function matchesAllTokens(searchName: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  const nameTokens = searchName.split(' ').filter((t) => t !== '');
  return tokens.every((q) => nameTokens.some((n) => n.startsWith(q)));
}
