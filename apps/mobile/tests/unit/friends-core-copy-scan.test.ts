import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { catalogs, en } from '@chefer/i18n';
import { FRIENDS_SCREEN_TITLES } from '../../src/features/friends/components/screen-titles';
import { getTranslator } from '../../src/lib/i18n';

// Program rule 1 (ux-design.md conventions, implementation-plan §15): the
// user-facing name is "Following". Code identifiers keep `friends` (routes,
// testIDs, procedures), but no user-visible string may say "Friends".
// This scans every string literal and JSX text in the Following code this
// lane ships, and the `friends` catalog (the words people read now live there;
// FRIENDS_COPY, the API's share of them, is deep-scanned by friends-copy.test.ts).

const ROOT = join(__dirname, '..', '..');
const SCANNED = [
  'src/features/friends',
  'app/friends',
  'app/(food)/more.tsx',
  'app/(food)/_layout.tsx',
  'src/features/settings/settings-screen.tsx',
  'src/features/privacy/privacy-section.tsx',
  'src/features/privacy/consent-history.tsx',
];

function files(path: string): string[] {
  const abs = join(ROOT, path);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((name) => files(join(path, name)));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;,{}()])\/\/.*$/gm, '$1');
}

/** Drops the `${…}` code inside a template literal: only its text is user-visible. */
function withoutInterpolations(text: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (depth === 0 && text[i] === '$' && text[i + 1] === '{') {
      depth = 1;
      i++;
    } else if (depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
    } else out += text[i] ?? '';
  }
  return out;
}

/** String literals and JSX text runs. */
function strings(source: string): string[] {
  const code = stripComments(source);
  const literals = code.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
  const jsxText = [...code.matchAll(/>([^<>{}=;]+)</g)].map((m) => m[1] ?? '');
  return [...literals.map((l) => withoutInterpolations(l.slice(1, -1))), ...jsxText].filter(
    (s) => s.trim() !== '',
  );
}

/** A capitalised "Friend(s)" anywhere, or "friend(s)" inside prose (a string with a space). */
function looksUserVisibleFriends(text: string): boolean {
  if (/\bFriends?\b/.test(text)) return true;
  return /\s/.test(text.trim()) && /\bfriends?\b/i.test(text);
}

describe('copy-deck scan: no user-visible "Friends"', () => {
  const all = SCANNED.flatMap(files).filter((f) => /\.(ts|tsx)$/.test(f));

  it('scans the Following code', () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it.each(all.map((f) => [relative(ROOT, f), f]))('%s', (_rel, file) => {
    const offenders = strings(readFileSync(file, 'utf8')).filter(looksUserVisibleFriends);
    expect(offenders).toEqual([]);
  });

  it('the screen titles say Following, never Friends', () => {
    const { t } = getTranslator();
    for (const key of Object.values(FRIENDS_SCREEN_TITLES)) {
      expect(looksUserVisibleFriends(t(key))).toBe(false);
    }
    expect(t(FRIENDS_SCREEN_TITLES.home)).toBe('Following');
  });

  it('the friends catalog never says Friends (English) or prieteni (Romanian)', () => {
    const texts: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') texts.push(node);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(en.friends);
    walk(catalogs.ro.friends);
    expect(texts.length).toBeGreaterThan(300);
    expect(texts.filter((s) => /\bfriends?\b|prieten/i.test(s))).toEqual([]);
  });

  it('the detector itself catches the obvious cases', () => {
    expect(looksUserVisibleFriends('Friends')).toBe(true);
    expect(looksUserVisibleFriends('Invite your friends')).toBe(true);
    expect(looksUserVisibleFriends('/friends/settings')).toBe(false);
    expect(looksUserVisibleFriends('friends-header')).toBe(false);
    expect(looksUserVisibleFriends('friends.availability')).toBe(false);
  });
});
