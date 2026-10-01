import { describe, expect, it } from 'vitest';
import { matchesAllTokens, normalizeSearchName, queryTokens } from './search-name';

describe('normalizeSearchName', () => {
  it('lowercases, strips diacritics and splits punctuation', () => {
    expect(normalizeSearchName('Ștefan', 'Popescu')).toBe('stefan popescu');
    expect(normalizeSearchName('Ioana-Maria', 'Țînțar')).toBe('ioana maria tintar');
    expect(normalizeSearchName('  Zoë ', "O'Brien")).toBe('zoe o brien');
  });

  it('folds letters that do not decompose', () => {
    expect(normalizeSearchName('Søren', 'Łukasz')).toBe('soren lukasz');
    expect(normalizeSearchName('Weiß', 'Đorđe')).toBe('weiss dorde');
  });

  it('falls back to the account name when no first/last name is set', () => {
    expect(normalizeSearchName(null, null, 'Ana Pop')).toBe('ana pop');
    expect(normalizeSearchName('', '  ', 'Ana Pop')).toBe('ana pop');
    expect(normalizeSearchName('Ana', null, 'Ignored Name')).toBe('ana');
    expect(normalizeSearchName(null, null)).toBe('');
  });
});

describe('queryTokens', () => {
  it('normalises the same way and splits on whitespace', () => {
    expect(queryTokens('  ȘTEFAN   pop ')).toEqual(['stefan', 'pop']);
    expect(queryTokens('Ioana-Maria')).toEqual(['ioana', 'maria']);
    expect(queryTokens('   ')).toEqual([]);
  });

  it('treats "@" as plain text, never as an email', () => {
    expect(queryTokens('ana@gmail.com')).toEqual(['ana', 'gmail', 'com']);
    expect(queryTokens('@ana')).toEqual(['ana']);
    expect(queryTokens('@')).toEqual([]);
  });
});

describe('matchesAllTokens', () => {
  const name = normalizeSearchName('Ana-Maria', 'Popescu');

  it('needs every query token to prefix some name token', () => {
    expect(matchesAllTokens(name, queryTokens('ana pop'))).toBe(true);
    expect(matchesAllTokens(name, queryTokens('maria'))).toBe(true);
    expect(matchesAllTokens(name, queryTokens('popescu ana'))).toBe(true);
    expect(matchesAllTokens(name, queryTokens('ana xyz'))).toBe(false);
    expect(matchesAllTokens(name, queryTokens('escu'))).toBe(false); // prefix, not substring
  });

  it('finds a diacritic name from an ASCII query and back', () => {
    expect(matchesAllTokens(normalizeSearchName('Ștefan', 'Ionescu'), queryTokens('stefan'))).toBe(
      true,
    );
    expect(matchesAllTokens(normalizeSearchName('Stefan', 'Ionescu'), queryTokens('Ștef'))).toBe(
      true,
    );
  });

  it('never matches an empty query, and an email-shaped query matches nothing by accident', () => {
    expect(matchesAllTokens(name, [])).toBe(false);
    expect(matchesAllTokens(name, queryTokens('ana.popescu@example.com'))).toBe(false);
  });
});
