import { describe, expect, it } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { getLimit, hasFeature, isPremiumUser } from './entitlements.js';

const user = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1',
  email: 'u1@example.com',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
  ...overrides,
});

const free = user();
const premium = user({ planTier: 'PREMIUM' });
const admin = user({ role: 'ADMIN' });

describe('isPremiumUser', () => {
  it('is false for a free user', () => {
    expect(isPremiumUser(free)).toBe(false);
  });

  it('is true for a premium user', () => {
    expect(isPremiumUser(premium)).toBe(true);
  });

  it('grants admins implicit premium', () => {
    expect(isPremiumUser(admin)).toBe(true);
  });
});

describe('hasFeature', () => {
  it('denies free users boolean-false features', () => {
    expect(hasFeature(free, 'aiMealPlans')).toBe(false);
    expect(hasFeature(premium, 'aiMealPlans')).toBe(true);
  });

  it('counts a numeric limit as access', () => {
    expect(hasFeature(free, 'planGenerationsPerDay')).toBe(true);
    expect(hasFeature(free, 'chatMessagesPerDay')).toBe(true);
  });
});

describe('getLimit', () => {
  it('returns the tier limit for numeric access', () => {
    expect(getLimit(free, 'planGenerationsPerDay')).toBe(3);
    expect(getLimit(premium, 'planGenerationsPerDay')).toBe(20);
    expect(getLimit(admin, 'planGenerationsPerDay')).toBe(20);
  });

  it('returns null for unlimited access', () => {
    expect(getLimit(premium, 'chatMessagesPerDay')).toBeNull();
  });

  it('returns 0 for no access', () => {
    expect(getLimit(free, 'aiMealPlans')).toBe(0);
  });

  it('premium swaps are limited, free swaps are not an AI feature at all', () => {
    expect(getLimit(premium, 'aiMealSwaps')).toBe(30);
    expect(hasFeature(free, 'aiMealSwaps')).toBe(false);
  });
});
