import { describe, expect, it } from 'vitest';
import { loginPathFor, nextQuery, safeNextPath } from './next-path';

describe('safeNextPath', () => {
  it('accepts a coaching join path only', () => {
    expect(safeNextPath('/coaching/join/ABCD234567')).toBe('/coaching/join/ABCD234567');
    expect(safeNextPath(['/coaching/join/ab-cd', 'x'])).toBe('/coaching/join/ab-cd');
  });

  it('rejects anything else (no open redirect)', () => {
    for (const bad of [
      'https://evil.example/coaching/join/ABC',
      '//evil.example',
      '/dashboard',
      '/coaching/join/../../admin',
      '/coaching/join/ABC?x=1',
      '',
      undefined,
      null,
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });

  it('builds the query string for the login and register links', () => {
    expect(nextQuery('/coaching/join/ABC')).toBe('?next=%2Fcoaching%2Fjoin%2FABC');
    expect(nextQuery(null)).toBe('');
  });
});

describe('loginPathFor', () => {
  it('an invite link comes back with next=, any other page says the session expired', () => {
    expect(loginPathFor('/coaching/join/ABC')).toBe('/login?next=%2Fcoaching%2Fjoin%2FABC');
    expect(loginPathFor('/gym')).toBe('/login?from=%2Fgym');
  });
});
