export type NameParts = {
  firstName?: string | null;
  lastName?: string | null;
  /** The account's single `name` field, used when no Following names are set. */
  name?: string | null;
};

const FALLBACK = 'Chefer user';

function clean(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

/** `{first} {last}`, else the account name, else "Chefer user". */
export function displayNameOf(parts: NameParts): string {
  const full = [clean(parts.firstName), clean(parts.lastName)].filter(Boolean).join(' ');
  if (full !== '') return full;
  const account = clean(parts.name);
  return account === '' ? FALLBACK : account;
}

/** The first name, else the first word of the account name, else "Chefer user". */
export function firstNameOf(parts: NameParts): string {
  const first = clean(parts.firstName);
  if (first) return first;
  const fromName = clean(parts.name).split(' ')[0] ?? '';
  return fromName === '' ? FALLBACK : fromName;
}

/** Up to two uppercase initials from a display name ("Maria Pop" → "MP"). */
export function initialsOf(displayName: string): string {
  const words = clean(displayName).split(' ').filter(Boolean);
  if (words.length === 0) return '?';
  const letters = [words[0], words.length > 1 ? words[words.length - 1] : undefined]
    .filter((w): w is string => w !== undefined)
    .map((w) => Array.from(w)[0] ?? '')
    .join('');
  return letters.toLocaleUpperCase('en-US');
}

/** A stable bucket (0 … buckets-1) for an avatar colour, from any seed (FNV-1a). */
export function avatarColorIndex(seed: string, buckets = 8): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % Math.max(1, Math.floor(buckets));
}
