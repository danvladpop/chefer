import { describe, expect, it } from 'vitest';
import { firstSupportedLocale, intlTagFor, matchLocale, resolveLocale } from './resolve';

describe('matchLocale', () => {
  it('maps tags to a shipped language', () => {
    expect(matchLocale('ro-RO')).toBe('ro');
    expect(matchLocale('ro_MD')).toBe('ro');
    expect(matchLocale('mo')).toBe('ro');
    expect(matchLocale('EN-us')).toBe('en');
    expect(matchLocale('de-DE')).toBeNull();
    expect(matchLocale('')).toBeNull();
    expect(matchLocale(undefined)).toBeNull();
  });
});

describe('resolveLocale', () => {
  it('explicit choice → device languages → stored device locale → English', () => {
    expect(resolveLocale({ choice: 'ro', deviceTags: ['en-US'] })).toBe('ro');
    expect(resolveLocale({ choice: null, deviceTags: ['de-DE', 'ro-RO'] })).toBe('ro');
    expect(resolveLocale({ deviceTags: ['de-DE'], deviceLocale: 'ro' })).toBe('ro');
    expect(resolveLocale({ deviceTags: ['de-DE', 'fr-FR'] })).toBe('en');
    expect(resolveLocale({})).toBe('en');
  });

  it('takes the first supported language in preference order', () => {
    expect(firstSupportedLocale(['fr-FR', 'en-GB', 'ro-RO'])).toBe('en');
  });
});

describe('intlTagFor', () => {
  it("keeps the device's own regional tag when the language matches", () => {
    expect(intlTagFor('en', ['en-US'])).toBe('en-US');
    expect(intlTagFor('ro', ['ro_MD'])).toBe('ro-MD');
  });

  it("falls back to the language's default tag", () => {
    expect(intlTagFor('en', ['ro-RO'])).toBe('en-GB');
    expect(intlTagFor('ro', ['en-US'])).toBe('ro-RO');
    expect(intlTagFor('ro')).toBe('ro-RO');
  });
});
