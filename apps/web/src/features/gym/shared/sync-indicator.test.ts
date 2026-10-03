import { describe, expect, it } from 'vitest';
import { syncFailureHint } from './sync-indicator';

describe('syncFailureHint (UX-GYM-25)', () => {
  it('is empty when nothing failed', () => {
    expect(syncFailureHint(null)).toBe('');
  });
  it('names a network failure and a server failure in plain words, never raw text', () => {
    expect(syncFailureHint('Failed to fetch')).toBe(' · can’t reach Chefer');
    expect(syncFailureHint('Unexpected token < in JSON at position 0')).toBe(' · server problem');
  });
});
