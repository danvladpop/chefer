import { describe, expect, it } from 'vitest';
import { tierOf } from './tier';

// GLOSSARY "Tier": Free or Premium. An admin has every feature without a
// Premium plan, so the UI shows them as Premium and never offers a downgrade.
describe('tierOf', () => {
  it('reads the plan for a normal account', () => {
    expect(tierOf({ role: 'USER', planTier: 'FREE' })).toBe('free');
    expect(tierOf({ role: 'MODERATOR', planTier: 'PREMIUM' })).toBe('premium');
  });

  it('an admin is admin whatever their plan says', () => {
    expect(tierOf({ role: 'ADMIN', planTier: 'FREE' })).toBe('admin');
    expect(tierOf({ role: 'ADMIN', planTier: 'PREMIUM' })).toBe('admin');
  });
});
