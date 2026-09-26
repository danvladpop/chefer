import { describe, expect, it } from 'vitest';
import { AI_CONSENT_FEATURE_DATA, AI_CONSENT_FEATURES } from '@chefer/types';
import { aiConsentIntro, aiConsentRequiredFor, needsAiDataConsent } from './ai-consent';

describe('needsAiDataConsent (App Store 5.1.2(i))', () => {
  it('asks when the user has not consented', () => {
    expect(needsAiDataConsent({ aiDataConsentAt: null })).toBe(true);
  });

  it('asks while the user is still loading', () => {
    expect(needsAiDataConsent(undefined)).toBe(true);
    expect(needsAiDataConsent(null)).toBe(true);
  });

  it('does not ask once consent is recorded (Date or ISO string)', () => {
    expect(needsAiDataConsent({ aiDataConsentAt: new Date() })).toBe(false);
    expect(needsAiDataConsent({ aiDataConsentAt: '2026-09-26T10:00:00.000Z' })).toBe(false);
  });

  it('never asks for an action that does not use AI', () => {
    expect(needsAiDataConsent({ aiDataConsentAt: null }, false)).toBe(false);
  });
});

describe('aiConsentRequiredFor', () => {
  it('skips free plan generation and swaps (curated pool, no AI call)', () => {
    expect(aiConsentRequiredFor('meal-plan', false)).toBe(false);
    expect(aiConsentRequiredFor('meal-swap', false)).toBe(false);
  });

  it('asks for premium or unknown tier generation and swaps', () => {
    expect(aiConsentRequiredFor('meal-plan', true)).toBe(true);
    expect(aiConsentRequiredFor('meal-swap', undefined)).toBe(true);
  });

  it('always asks for the AI-only features', () => {
    for (const f of ['meal-scan', 'recipe-import', 'chat', 'shopping-list'] as const) {
      expect(aiConsentRequiredFor(f, false)).toBe(true);
    }
  });
});

describe('aiConsentIntro', () => {
  it('names the provider and the action for every feature', () => {
    for (const f of AI_CONSENT_FEATURES) {
      const intro = aiConsentIntro(f);
      expect(intro).toContain('Google Gemini');
      expect(intro).toContain(AI_CONSENT_FEATURE_DATA[f].action);
      expect(intro).not.toContain('{action}');
      expect(AI_CONSENT_FEATURE_DATA[f].data.length).toBeGreaterThan(0);
    }
  });
});
