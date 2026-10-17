import { describe, expect, it } from 'vitest';
import {
  CHAT_SYSTEM_PROMPT,
  DISORDERED_EATING_RULE,
  REVIEW_SYSTEM_PROMPT,
  TRAINING_NOT_PHYSIO_RULE,
} from './prompts.js';

// T-00.14 (UX-22 AC3, Art. 50 floor): the chat prompt used to invite
// "nutritional advice" and carried no medical-topic guardrail at all — the
// weekly review already had the "chef, not a doctor" rule (prompts.ts
// L459-460), chat didn't. This locks both in with a snapshot so a future
// prompt edit can't silently drop either.

describe('CHAT_SYSTEM_PROMPT — guardrail (T-00.14)', () => {
  it('never invites "nutritional advice"', () => {
    expect(CHAT_SYSTEM_PROMPT.toLowerCase()).not.toContain('nutritional advice');
  });

  it('carries the "chef, not a doctor" rule', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('You are a chef, not a doctor');
    expect(CHAT_SYSTEM_PROMPT).toContain('no medical claims');
  });

  it('refuses to endorse very-low-calorie or disordered-eating advice and refers out (R-14)', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain(DISORDERED_EATING_RULE);
    const rule = DISORDERED_EATING_RULE.toLowerCase();
    for (const term of [
      'very-low-calorie',
      '1,200',
      'crash diets',
      'fasting',
      'purging',
      'doctor or dietitian',
      'eating disorder',
      'self-harm',
      'emergency services',
    ]) {
      expect(rule).toContain(term);
    }
  });

  // WP-06 (Food 2): eating out or skipping is ordinary — the chat reports
  // numbers neutrally and never judges.
  it('uses neutral eating copy: no "off-plan", "honestly" or "stays honest"', () => {
    for (const prompt of [CHAT_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT]) {
      expect(prompt).not.toMatch(/off-plan|honestly|stays honest/i);
    }
    expect(CHAT_SYSTEM_PROMPT).toContain('never scold');
  });

  // Ask Chef helps with training (2026-10-10).
  it('is a chef AND training helper that answers training from getMyTraining, never invented', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('training helper');
    expect(CHAT_SYSTEM_PROMPT).toContain('workouts and workout routines');
    expect(CHAT_SYSTEM_PROMPT).toContain('call getMyTraining');
    expect(CHAT_SYSTEM_PROMPT).toContain('never invent');
    expect(CHAT_SYSTEM_PROMPT).toMatch(/weights, reps, sets, dates or sessions/);
    expect(CHAT_SYSTEM_PROMPT).toContain('point them to the Train tab');
  });

  it('cannot edit routines from chat — it explains the in-app path', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('You cannot create or edit routines or log');
    expect(CHAT_SYSTEM_PROMPT).toContain('Train → Routines → Edit');
  });

  it('extends chef-not-doctor to training: not a physiotherapist, no injury advice, refer out', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain(TRAINING_NOT_PHYSIO_RULE);
    const rule = TRAINING_NOT_PHYSIO_RULE.toLowerCase();
    for (const term of [
      'not a doctor or physiotherapist',
      'no injury diagnosis',
      'rehab',
      'never suggest training through pain',
      'pain or an injury',
      'see a doctor or physiotherapist',
    ]) {
      expect(rule).toContain(term);
    }
    // The review prompt stays food-only.
    expect(REVIEW_SYSTEM_PROMPT).not.toContain(TRAINING_NOT_PHYSIO_RULE);
  });

  it('matches the known-good snapshot', () => {
    expect(CHAT_SYSTEM_PROMPT).toMatchSnapshot();
  });
});

describe('REVIEW_SYSTEM_PROMPT — shares the same guardrail wording', () => {
  it('carries the identical "chef, not a doctor" rule as chat (no drift between the two prompts)', () => {
    const rule =
      "You are a chef, not a doctor: no medical claims, no diagnoses, no advice about health conditions. Food, habits and next week's cooking only.";
    expect(CHAT_SYSTEM_PROMPT).toContain(rule);
    expect(REVIEW_SYSTEM_PROMPT).toContain(rule);
  });
});
