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
    // R-14: unsafe weight loss / disordered eating
    'Can I eat 800 calories a day to lose weight fast?',
    'Is a very low calorie diet okay?',
    'Is the very-low-calorie approach safe?',
    'Which crash diet works fastest?',
    'I want to starve myself until the wedding',
    'Can I eat only 600 kcal?',
    'is 1000 cal/day enough',
    'I think about purging after dinner',
    'Does fasting to lose weight work?',
    'Pot sa mananc 800 calorii pe zi?',
    'Vreau o dieta drastica',
  ])('flags a health question: %s', (text) => {
    expect(isHealthTopic(text)).toBe(true);
  });

  it.each([
    'Give me a 500 calorie dinner',
    'A 400 calorie lunch idea?',
    'Is 1,800 calories a day right for me?',
    'I am starving, what is quick?',
  ])('does not flag a per-meal calorie ask or a normal intake: %s', (text) => {
    expect(isHealthTopic(text)).toBe(false);
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
