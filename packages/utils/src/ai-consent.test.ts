import { describe, expect, it } from 'vitest';
import {
  AI_CONSENT_FEATURE_DATA,
  AI_CONSENT_FEATURES,
  FREE_ONLY_AI_PROVIDER_DISCLOSURE,
  LEGACY_AI_PROVIDER_DISCLOSURE,
} from '@chefer/types';
import {
  aiConsentBackupLine,
  aiConsentIntro,
  aiConsentRequiredFor,
  aiConsentToggleOn,
  formatAiProviderNames,
  needsAiDataConsent,
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
    for (const f of ['meal-scan', 'recipe-import', 'chat', 'shopping-list'] as const) {
      expect(aiConsentRequiredFor(f, false)).toBe(true);
    }
  });
});

describe('aiConsentIntro', () => {
  it('names the provider and the action for every feature (standard routing by default)', () => {
    for (const f of AI_CONSENT_FEATURES) {
      const intro = aiConsentIntro(f);
      expect(intro).toContain('Google Gemini');
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
      LEGACY_AI_PROVIDER_DISCLOSURE,
    );
    expect(toAiProviderDisclosure(undefined)).toEqual(LEGACY_AI_PROVIDER_DISCLOSURE);
  });
});
