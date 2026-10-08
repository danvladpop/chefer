import { describe, expect, it, vi } from 'vitest';
import {
  AI_CONSENT_COPY,
  AI_CONSENT_FEATURE_DATA,
  AI_CONSENT_FEATURES,
  DEFAULT_AI_PROVIDER_DISCLOSURE,
  FREE_ONLY_AI_PROVIDER_DISCLOSURE,
  LEGACY_AI_PROVIDER_DISCLOSURE,
} from '@chefer/types';
import {
  aiConsentBackupLine,
  aiConsentFeatureForPath,
  aiConsentIntro,
  aiConsentRequiredFor,
  aiConsentToggleOn,
  formatAiProviderNames,
  handleAiConsentRequiredError,
  isAiConsentRequiredError,
  needsAiDataConsent,
  notifyAiConsentRequired,
  onAiConsentRequired,
  toAiProviderDisclosure,
} from './ai-consent';

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
    for (const f of [
      'meal-scan',
      'recipe-import',
      'chat',
      'shopping-list',
      'ingredient-estimate',
    ] as const) {
      expect(aiConsentRequiredFor(f, false)).toBe(true);
    }
  });
});

describe('aiConsentIntro', () => {
  it('names the provider and the action for every feature (the production set by default)', () => {
    for (const f of AI_CONSENT_FEATURES) {
      const intro = aiConsentIntro(f);
      expect(intro).toContain('Groq');
      expect(intro).not.toContain('Gemini');
      expect(intro).toContain(AI_CONSENT_FEATURE_DATA[f].action);
      expect(intro).not.toMatch(/\{\w+\}/);
      expect(AI_CONSENT_FEATURE_DATA[f].data.length).toBeGreaterThan(0);
    }
  });

  it('names Groq and never Gemini in free-only mode', () => {
    for (const f of AI_CONSENT_FEATURES) {
      const intro = aiConsentIntro(f, FREE_ONLY_AI_PROVIDER_DISCLOSURE);
      expect(intro).toContain('Groq');
      expect(intro).not.toMatch(/Gemini|\{\w+\}/);
    }
  });
});

describe('provider lines', () => {
  it('names the backup and every provider, per mode', () => {
    expect(aiConsentBackupLine(LEGACY_AI_PROVIDER_DISCLOSURE)).toBe(
      'If Gemini is busy, a request may be handled by Groq, a backup AI service, instead.',
    );
    expect(aiConsentBackupLine(FREE_ONLY_AI_PROVIDER_DISCLOSURE)).toBe(
      'If Groq is busy, a request may be handled by Cloudflare Workers AI, a backup AI service, instead.',
    );
    expect(aiConsentToggleOn(FREE_ONLY_AI_PROVIDER_DISCLOSURE)).toContain(
      'send the data they need to Groq and Cloudflare Workers AI.',
    );
    expect(aiConsentToggleOn(LEGACY_AI_PROVIDER_DISCLOSURE)).toContain('Google Gemini and Groq');
  });

  it('has no backup line without a backup', () => {
    expect(aiConsentBackupLine({ primary: 'groq', backups: [] })).toBeNull();
  });

  it('formats lists', () => {
    expect(formatAiProviderNames(['groq'])).toBe('Groq');
    expect(formatAiProviderNames(['gemini', 'groq', 'cloudflare'])).toBe(
      'Google Gemini, Groq and Cloudflare Workers AI',
    );
  });

  it('accepts a known server answer and falls back on anything else', () => {
    expect(toAiProviderDisclosure({ primary: 'groq', backups: ['cloudflare'] })).toEqual(
      FREE_ONLY_AI_PROVIDER_DISCLOSURE,
    );
    expect(toAiProviderDisclosure({ primary: 'openai', backups: [] })).toEqual(
      DEFAULT_AI_PROVIDER_DISCLOSURE,
    );
    expect(toAiProviderDisclosure(undefined)).toEqual(DEFAULT_AI_PROVIDER_DISCLOSURE);
  });

  it('R-10: the default (no answer / a failed request) is what production runs, not the legacy Gemini set', () => {
    expect(DEFAULT_AI_PROVIDER_DISCLOSURE).toEqual(FREE_ONLY_AI_PROVIDER_DISCLOSURE);
    expect(aiConsentBackupLine()).toBe(
      'If Groq is busy, a request may be handled by Cloudflare Workers AI, a backup AI service, instead.',
    );
    expect(aiConsentToggleOn()).not.toContain('Gemini');
  });
});

describe('R-10 copy', () => {
  it('the ingredient fill-in says what it sends: only the typed name', () => {
    expect(AI_CONSENT_FEATURE_DATA['ingredient-estimate'].data).toEqual([
      'The ingredient name you typed',
    ]);
  });

  it('the toggle lists every feature that may send data, including the coach review and the shopping-list tidy-up', () => {
    const on = aiConsentToggleOn();
    for (const word of [
      'meal plans',
      'swaps',
      'photo scans',
      'recipe',
      'chat',
      'ingredient',
      'shopping-list',
      'weekly coach review',
    ]) {
      expect(on.toLowerCase()).toContain(word);
    }
    expect(AI_CONSENT_COPY.coachReviewNote).toMatch(/weight trend, goal and average calories/);
  });
});

describe('server-side consent rejection (R-10)', () => {
  it('recognises the tRPC reason and a plain-HTTP error carrying it', () => {
    expect(isAiConsentRequiredError({ data: { reason: 'AI_CONSENT_REQUIRED' } })).toBe(true);
    expect(isAiConsentRequiredError({ reason: 'AI_CONSENT_REQUIRED' })).toBe(true);
    expect(isAiConsentRequiredError({ data: { reason: null, code: 'FORBIDDEN' } })).toBe(false);
    expect(isAiConsentRequiredError(new Error('nope'))).toBe(false);
    expect(isAiConsentRequiredError(null)).toBe(false);
  });

  it('maps a refused procedure to its consent-sheet copy', () => {
    expect(aiConsentFeatureForPath('mealPlan.swapRecipe')).toBe('meal-swap');
    expect(aiConsentFeatureForPath('recipe.importVideoPreview')).toBe('recipe-import');
    expect(aiConsentFeatureForPath('shoppingList.regenerate')).toBe('shopping-list');
    expect(aiConsentFeatureForPath('ingredients.estimateNutrition')).toBe('ingredient-estimate');
    expect(aiConsentFeatureForPath(undefined)).toBe('meal-plan');
  });

  it('notifies subscribers only for a consent rejection, with the right feature', () => {
    const listener = vi.fn();
    const off = onAiConsentRequired(listener);
    handleAiConsentRequiredError({ data: { reason: 'AI_CONSENT_REQUIRED' } }, [
      ['mealPlan', 'swapRecipe'],
    ]);
    expect(listener).toHaveBeenCalledWith('meal-swap');
    handleAiConsentRequiredError({ data: { code: 'FORBIDDEN', reason: null } }, [['x', 'y']]);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    notifyAiConsentRequired('chat');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
