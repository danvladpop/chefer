import { describe, expect, it } from 'vitest';
import { followOutcome } from './follow-policy';
import { relationOf } from './relation';

describe('followOutcome (Instagram model)', () => {
  it('follows a public profile instantly and requests a private one', () => {
    expect(followOutcome('PUBLIC')).toBe('instant');
    expect(followOutcome('PRIVATE')).toBe('request');
  });
});

describe('relationOf', () => {
  it('maps my outgoing edge to the button state', () => {
    expect(relationOf({ isSelf: true, outgoing: 'ACCEPTED' })).toBe('self');
    expect(relationOf({ isSelf: false, outgoing: 'ACCEPTED' })).toBe('following');
    expect(relationOf({ isSelf: false, outgoing: 'PENDING' })).toBe('requested');
    expect(relationOf({ isSelf: false, outgoing: null })).toBe('none');
    expect(relationOf({ isSelf: false, outgoing: undefined })).toBe('none');
  });
});
