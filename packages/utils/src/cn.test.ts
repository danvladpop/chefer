import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('keeps a revamp font size next to a revamp text colour', () => {
    expect(cn('text-base', 'text-display text-label').split(' ')).toEqual(
      expect.arrayContaining(['text-display', 'text-label']),
    );
    expect(cn('text-base', 'text-display text-label')).not.toContain('text-base');
  });

  it('still lets a later colour replace an earlier one', () => {
    expect(cn('text-foreground', 'text-label-secondary')).toBe('text-label-secondary');
  });
});
