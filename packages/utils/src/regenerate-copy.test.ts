import { describe, expect, it } from 'vitest';
import { regenerateConfirmBody } from './regenerate-copy';

describe('regenerateConfirmBody', () => {
  it('this week: promises that past days and logged meals stay', () => {
    const body = regenerateConfirmBody(0, 21);
    expect(body).toContain('Past days');
    expect(body).toContain('logged');
    expect(body).not.toContain('21');
  });

  it('a future week is replaced whole, with its meal count', () => {
    expect(regenerateConfirmBody(1, 21)).toBe('This replaces the 21 planned meals.');
    expect(regenerateConfirmBody(1, 1)).toBe('This replaces the 1 planned meal.');
  });
});
