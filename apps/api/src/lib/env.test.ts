import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { validateEnv as ValidateEnv } from './env.js';

// env.ts validates process.env when imported, so give the import a minimal
// valid env first; each test then validates its own plain-object source.
const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/chefer_test',
  JWT_SECRET: 'j'.repeat(32),
  REFRESH_TOKEN_SECRET: 'r'.repeat(32),
};

let validateEnv: typeof ValidateEnv;

beforeAll(async () => {
  for (const [k, v] of Object.entries(BASE)) vi.stubEnv(k, v);
  ({ validateEnv } = await import('./env.js'));
  vi.unstubAllEnvs();
});

describe('validateEnv — AI without Gemini (docs/ai-providers.md "Running without Gemini")', () => {
  // The exact AI lines documented for .env.production, no GEMINI_API_KEY.
  const GROQ_ONLY = {
    AI_MOCK_ENABLED: 'false',
    AI_PROVIDER: 'openai',
    AI_SECONDARY_API_KEY: 'gsk_test',
    AI_SECONDARY_BASE_URL: 'https://api.groq.com/openai/v1',
    AI_SECONDARY_MODEL: 'openai/gpt-oss-120b',
    AI_SECONDARY_REASONING_EFFORT: 'low',
    AI_VISION_MODEL: 'qwen/qwen3.8-27b',
    AI_ROUTE_MEAL_PLAN: 'groq',
    AI_ROUTE_SWAP: 'groq',
    AI_ROUTE_CHEFERIZE: 'groq',
    AI_ROUTE_IMPORT_TEXT: 'groq',
    AI_ROUTE_VISION: 'groq',
    AI_ROUTE_CHAT: 'groq',
    AI_ROUTE_REVIEW: 'groq',
    AI_ROUTE_PRICES: 'groq',
    AI_ROUTE_SHOPPING: 'groq',
  };

  it('accepts the Groq-only production config with no GEMINI_API_KEY', () => {
    const env = validateEnv({ ...BASE, ...GROQ_ONLY });
    expect(env.AI_PROVIDER).toBe('openai');
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.AI_ROUTE_MEAL_PLAN).toBe('groq');
    expect(env.AI_SECONDARY_REASONING_EFFORT).toBe('low');
  });

  it('accepts it with an empty GEMINI_API_KEY line and the reasoning effort left to auto', () => {
    const env = validateEnv({
      ...BASE,
      ...GROQ_ONLY,
      GEMINI_API_KEY: '',
      AI_SECONDARY_REASONING_EFFORT: '',
    });
    expect(env.AI_SECONDARY_REASONING_EFFORT).toBe('auto');
  });

  it('still requires the Groq key when Gemini is gone', () => {
    const { AI_SECONDARY_API_KEY: _omit, ...noKey } = GROQ_ONLY;
    expect(() => validateEnv({ ...BASE, ...noKey })).toThrow(/AI_SECONDARY_API_KEY is required/);
  });

  it('still requires the Gemini key when AI_PROVIDER=gemini', () => {
    expect(() => validateEnv({ ...BASE, ...GROQ_ONLY, AI_PROVIDER: 'gemini' })).toThrow(
      /GEMINI_API_KEY is required/,
    );
  });

  it('rejects an unknown reasoning effort', () => {
    expect(() =>
      validateEnv({ ...BASE, ...GROQ_ONLY, AI_SECONDARY_REASONING_EFFORT: 'max' }),
    ).toThrow(/AI_SECONDARY_REASONING_EFFORT/);
  });
});
