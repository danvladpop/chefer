import { describe, expect, it } from 'vitest';
import { isHealthTopic, isSafetyTopic } from './health-topic';

// UX-22 (T-22.2). A representative EN + RO table, not exhaustive — the
// classifier is a belt on top of the prompt guardrail, not the primary
// control (it will miss paraphrases by design).

describe('isHealthTopic', () => {
  it.each([
    'Is this okay for someone with diabetes?',
    'What should I eat for my blood sugar?',
    "I'm pregnant, can I eat this?",
    'My doctor told me to watch my cholesterol',
    'Este bine pentru diabet?',
    'Sunt gravidă, ce pot mânca?',
    'Am o afecțiune cronică',
  ])('flags a health question: %s', (text) => {
    expect(isHealthTopic(text)).toBe(true);
  });

  it.each(['What should I cook tonight?', 'Swap my lunch for something else', 'Scale this for 4'])(
    'does not flag an ordinary cooking question: %s',
    (text) => {
      expect(isHealthTopic(text)).toBe(false);
    },
  );
});

describe('isSafetyTopic', () => {
  it.each([
    'Is this gluten-free?',
    'Does this recipe contain nuts?',
    'I have a peanut allergy, is this safe?',
    'Este fără gluten?',
    'Am o alergie la arahide',
  ])('flags an allergen/safety question: %s', (text) => {
    expect(isSafetyTopic(text)).toBe(true);
  });

  it('does not flag an ordinary cooking question', () => {
    expect(isSafetyTopic('What should I cook tonight?')).toBe(false);
  });
});
