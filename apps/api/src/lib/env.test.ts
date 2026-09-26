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

describe('validateEnv — free-only mode (docs/ai-providers.md "Free-only mode")', () => {
  // The exact AI lines documented for .env.production — no GEMINI_API_KEY,
  // AI_PROVIDER left at its default.
  const FREE_ONLY = {
    AI_MOCK_ENABLED: 'false',
    AI_FREE_ONLY: 'true',
    AI_SECONDARY_API_KEY: 'gsk_test',
    CF_ACCOUNT_ID: 'acct',
    CF_API_TOKEN: 'cf_test',
  };

  it('accepts free-only with no GEMINI_API_KEY and fills the Cloudflare defaults', () => {
    const env = validateEnv({ ...BASE, ...FREE_ONLY });
    expect(env.AI_FREE_ONLY).toBe(true);
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.AI_PROVIDER).toBe('gemini'); // ignored in free-only mode
    expect(env.CF_TEXT_MODEL).toBe('@cf/openai/gpt-oss-120b');
    expect(env.CF_VISION_MODEL).toBe('@cf/google/gemma-4-26b-a4b-it');
    expect(env.CF_TEXT_NEURON_BUDGET).toBe(8_000);
    expect(env.AI_SECONDARY_FAST_MODEL).toBeUndefined();
  });

  it('accepts explicit groq>cloudflare routes and an empty GEMINI_API_KEY line', () => {
    const env = validateEnv({
      ...BASE,
      ...FREE_ONLY,
      GEMINI_API_KEY: '',
      AI_ROUTE_PRICES: 'groq>cloudflare',
      AI_SHADOW_ROUTE: 'mealPlan:cloudflare',
    });
    expect(env.AI_ROUTE_PRICES).toBe('groq>cloudflare');
  });

  it('refuses to start when a route or the shadow route still names gemini', () => {
    expect(() => validateEnv({ ...BASE, ...FREE_ONLY, AI_ROUTE_CHAT: 'groq>gemini' })).toThrow(
      /AI_FREE_ONLY=true .*AI_ROUTE_CHAT=groq>gemini/,
    );
    expect(() =>
      validateEnv({ ...BASE, ...FREE_ONLY, AI_SHADOW_ROUTE: 'mealPlan:gemini' }),
    ).toThrow(/AI_SHADOW_ROUTE=mealPlan:gemini/);
  });

  it('requires the Groq key, and only warns without Cloudflare', () => {
    const { AI_SECONDARY_API_KEY: _omit, ...noGroq } = FREE_ONLY;
    expect(() => validateEnv({ ...BASE, ...noGroq })).toThrow(/AI_SECONDARY_API_KEY \(Groq\)/);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { CF_ACCOUNT_ID: _a, CF_API_TOKEN: _t, ...noCf } = FREE_ONLY;
    expect(validateEnv({ ...BASE, ...noCf }).AI_FREE_ONLY).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Groq only'));
    warn.mockRestore();
  });

  it('is off by default, so the standard config is unchanged', () => {
    const env = validateEnv({ ...BASE, AI_MOCK_ENABLED: 'false', GEMINI_API_KEY: 'g' });
    expect(env.AI_FREE_ONLY).toBe(false);
    expect(() => validateEnv({ ...BASE, AI_MOCK_ENABLED: 'false' })).toThrow(
      /GEMINI_API_KEY is required/,
    );
  });

  it('rejects a budget above the free 10,000 neurons', () => {
    expect(() => validateEnv({ ...BASE, ...FREE_ONLY, CF_TEXT_NEURON_BUDGET: '12000' })).toThrow(
      /CF_TEXT_NEURON_BUDGET/,
    );
  });
});
