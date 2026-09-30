import { describe, expect, it } from 'vitest';
import { avatarColorIndex, displayNameOf, firstNameOf, initialsOf } from './display-name';

describe('displayNameOf', () => {
  it('prefers first + last, then the account name, then the fallback', () => {
    expect(displayNameOf({ firstName: 'Maria', lastName: 'Pop', name: 'mp' })).toBe('Maria Pop');
    expect(displayNameOf({ firstName: ' Maria ', lastName: null })).toBe('Maria');
    expect(displayNameOf({ firstName: null, lastName: null, name: 'Ana  Pop' })).toBe('Ana Pop');
    expect(displayNameOf({})).toBe('Chefer user');
    expect(displayNameOf({ firstName: '  ', name: '' })).toBe('Chefer user');
  });
});

describe('firstNameOf', () => {
  it('uses the first name, else the first word of the account name, else the fallback', () => {
    expect(firstNameOf({ firstName: 'Maria', lastName: 'Pop' })).toBe('Maria');
    expect(firstNameOf({ name: 'Ana Pop' })).toBe('Ana');
    expect(firstNameOf({})).toBe('Chefer user');
  });
});

describe('initialsOf', () => {
  it('takes the first and last word initials, uppercased', () => {
    expect(initialsOf('Maria Pop')).toBe('MP');
    expect(initialsOf('ana maria popescu')).toBe('AP');
    expect(initialsOf('Ștefan')).toBe('Ș');
    expect(initialsOf('Chefer user')).toBe('CU');
    expect(initialsOf('')).toBe('?');
  });
});

describe('avatarColorIndex', () => {
  it('is stable, in range and spreads seeds', () => {
    expect(avatarColorIndex('user-1')).toBe(avatarColorIndex('user-1'));
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const v = avatarColorIndex(`seed-${i}`, 8);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(8);
      seen.add(v);
    }
    expect(seen.size).toBe(8);
    expect(avatarColorIndex('x', 1)).toBe(0);
  });
});
