import { describe, expect, it } from 'vitest';
import { parseAcceptLanguage, parseLocaleCookie } from './locale-cookie';

describe('parseAcceptLanguage', () => {
  it('orders tags by weight, keeping header order on ties', () => {
    expect(parseAcceptLanguage('en;q=0.5, ro-RO, ro;q=0.9, *;q=0.1')).toEqual([
      'ro-RO',
      'ro',
      'en',
    ]);
  });

  it('drops empty, wildcard and zero-weight entries', () => {
    expect(parseAcceptLanguage('de;q=0, *, ')).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});

describe('parseLocaleCookie', () => {
  it('accepts only a shipped language', () => {
    expect(parseLocaleCookie('ro')).toBe('ro');
    expect(parseLocaleCookie('de')).toBeNull();
    expect(parseLocaleCookie(undefined)).toBeNull();
  });
});
