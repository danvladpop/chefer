import { describe, expect, it } from 'vitest';
import { AI_CONSENT_FEATURE_DATA } from './ai-consent';

describe('AI consent data disclosure', () => {
  it('does not claim the AI receives pantry items (the pantry is retired, WP-24)', () => {
    for (const { data } of Object.values(AI_CONSENT_FEATURE_DATA)) {
      for (const line of data) expect(line).not.toMatch(/pantry/i);
    }
  });
});
