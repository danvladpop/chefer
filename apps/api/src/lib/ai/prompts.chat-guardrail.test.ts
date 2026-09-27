import { describe, expect, it } from 'vitest';
import { CHAT_SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT } from './prompts.js';

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
