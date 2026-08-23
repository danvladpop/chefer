import { describe, expect, it } from 'vitest';
import { parseMealPhotoResponse } from './gemini.js';
import { MEAL_PHOTO_SYSTEM_PROMPT } from './prompts.js';

// ─── F4 Snap-to-Log — fixture-based response validation ──────────────────────
// The vision call itself is exercised in the integrator's acceptance run with
// real Gemini; these tests pin the parsing/validation layer so prompt/schema
// iteration doesn't burn live calls (premium_plan.md §8).

const validFixture = {
  dishName: 'Grilled chicken with rice and vegetables',
  confidence: 'med',
  kcal: 520.4,
  protein: 38.2,
  carbs: 55.0,
  fat: 13.7,
  portionNote: 'assuming a ~350 g plate, cooked with 1 tbsp oil',
};

describe('parseMealPhotoResponse', () => {
  it('parses a valid response and rounds macros to whole numbers', () => {
    const result = parseMealPhotoResponse(JSON.stringify(validFixture));
    expect(result).toEqual({
      dishName: 'Grilled chicken with rice and vegetables',
      confidence: 'med',
      kcal: 520,
      protein: 38,
      carbs: 55,
      fat: 14,
      portionNote: 'assuming a ~350 g plate, cooked with 1 tbsp oil',
    });
  });

  it('accepts every confidence level and nothing else', () => {
    for (const confidence of ['low', 'med', 'high']) {
      expect(
        parseMealPhotoResponse(JSON.stringify({ ...validFixture, confidence })).confidence,
      ).toBe(confidence);
    }
    expect(() =>
      parseMealPhotoResponse(JSON.stringify({ ...validFixture, confidence: 'certain' })),
    ).toThrow(/failed validation/);
  });

  it('rejects malformed JSON (truncated output)', () => {
    expect(() => parseMealPhotoResponse('{"dishName": "Pasta", "kcal"')).toThrow(/malformed/);
  });

  it('rejects missing fields and out-of-range numbers', () => {
    const { portionNote: _omitted, ...missing } = validFixture;
    expect(() => parseMealPhotoResponse(JSON.stringify(missing))).toThrow(/failed validation/);
    expect(() => parseMealPhotoResponse(JSON.stringify({ ...validFixture, kcal: -10 }))).toThrow(
      /failed validation/,
    );
    expect(() => parseMealPhotoResponse(JSON.stringify({ ...validFixture, kcal: 99_999 }))).toThrow(
      /failed validation/,
    );
  });

  it('accepts the not-a-meal shape the prompt mandates for non-food photos', () => {
    const result = parseMealPhotoResponse(
      JSON.stringify({
        dishName: 'Not a meal',
        confidence: 'low',
        kcal: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        portionNote: 'no food visible',
      }),
    );
    expect(result.kcal).toBe(0);
    expect(result.confidence).toBe('low');
  });
});

describe('MEAL_PHOTO_SYSTEM_PROMPT', () => {
  it('demands range honesty and confidence discipline', () => {
    expect(MEAL_PHOTO_SYSTEM_PROMPT).toMatch(/hidden oil/i);
    expect(MEAL_PHOTO_SYSTEM_PROMPT).toMatch(/LOWER confidence/);
    expect(MEAL_PHOTO_SYSTEM_PROMPT).toMatch(/portionNote/);
  });
});
