import { describe, expect, it } from 'vitest';
import { HOUSEHOLD_JOIN_PATH as SHARED_HOUSEHOLD_JOIN_PATH } from '@chefer/types';
import {
  HOUSEHOLD_JOIN_PATH,
  loginPathFor,
  nextQuery,
  safeNextPath,
  signedOutInvitePath,
} from './next-path';

it('the household join path is the shared one (kept local for the edge bundle)', () => {
  expect(HOUSEHOLD_JOIN_PATH.source).toBe(SHARED_HOUSEHOLD_JOIN_PATH.source);
  expect(HOUSEHOLD_JOIN_PATH.flags).toBe(SHARED_HOUSEHOLD_JOIN_PATH.flags);
});

describe('safeNextPath', () => {
  it('accepts a coaching or household join path only', () => {
    expect(safeNextPath('/coaching/join/ABCD234567')).toBe('/coaching/join/ABCD234567');
    expect(safeNextPath(['/coaching/join/ab-cd', 'x'])).toBe('/coaching/join/ab-cd');
    expect(safeNextPath('/household/join/ABCD234567')).toBe('/household/join/ABCD234567');
    expect(safeNextPath(['/household/join/ab-cd'])).toBe('/household/join/ab-cd');
  });

  it('rejects anything else (no open redirect)', () => {
    for (const bad of [
      'https://evil.example/coaching/join/ABC',
      'https://evil.example/household/join/ABC',
      '//evil.example',
      '//evil.example/household/join/ABC',
      '/dashboard',
      '/household',
      '/household/join/',
      '/coaching/join/../../admin',
      '/household/join/../../admin',
      '/coaching/join/ABC?x=1',
      '/household/join/ABC?x=1',
      '/household/join/ABC/extra',
      '/household/join/ABC#x',
      `/household/join/${'A'.repeat(41)}`,
      ' /household/join/ABC',
      '',
      undefined,
      null,
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });

  it('builds the query string for the login and register links', () => {
    expect(nextQuery('/coaching/join/ABC')).toBe('?next=%2Fcoaching%2Fjoin%2FABC');
    expect(nextQuery('/household/join/ABC')).toBe('?next=%2Fhousehold%2Fjoin%2FABC');
    expect(nextQuery(null)).toBe('');
  });
});

describe('loginPathFor', () => {
  it('an invite link comes back with next=, any other page says the session expired', () => {
    expect(loginPathFor('/coaching/join/ABC')).toBe('/login?next=%2Fcoaching%2Fjoin%2FABC');
    expect(loginPathFor('/household/join/ABC')).toBe('/login?next=%2Fhousehold%2Fjoin%2FABC');
    expect(loginPathFor('/gym')).toBe('/login?from=%2Fgym');
    expect(loginPathFor('/household')).toBe('/login?from=%2Fhousehold');
  });
});

describe('signedOutInvitePath', () => {
  it('maps each invite link to its app-or-web page', () => {
    expect(signedOutInvitePath('/coaching/join/AbC-1')).toBe('/coaching-invite/AbC-1');
    expect(signedOutInvitePath('/household/join/AbC-1')).toBe('/household-invite/AbC-1');
  });

  it('is null for every other path', () => {
    expect(signedOutInvitePath('/household')).toBeNull();
    expect(signedOutInvitePath('/meal-plan')).toBeNull();
    expect(signedOutInvitePath('/household/join/a/b')).toBeNull();
  });
});
