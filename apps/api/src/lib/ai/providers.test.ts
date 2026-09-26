import { describe, expect, it } from 'vitest';
import { configuredProviders, resolveReasoningEffort, type ProviderConfig } from './providers.js';
import { resolveRoutes } from './routing.js';

describe('resolveReasoningEffort', () => {
  it('auto = low for gpt-oss, nothing for other models', () => {
    expect(resolveReasoningEffort(undefined, 'openai/gpt-oss-120b')).toBe('low');
    expect(resolveReasoningEffort('auto', 'openai/gpt-oss-20b')).toBe('low');
    expect(resolveReasoningEffort('auto', 'llama-3.3-70b-versatile')).toBeUndefined();
  });

  it('none never sends it; an explicit value always does', () => {
    expect(resolveReasoningEffort('none', 'openai/gpt-oss-120b')).toBeUndefined();
    expect(resolveReasoningEffort('medium', 'openai/gpt-oss-120b')).toBe('medium');
    expect(resolveReasoningEffort('high', 'some-other-model')).toBe('high');
  });
});

describe('running without Gemini', () => {
  it('routes every workload to groq when only the secondary key is set', () => {
    const config: ProviderConfig = {
      geminiApiKey: undefined, // AI_PROVIDER=openai drops it even if present
      geminiModel: 'g',
      geminiFastModel: 'f',
      secondaryApiKey: 'k',
      secondaryBaseUrl: 'https://api.groq.com/openai/v1',
      secondaryModel: 'openai/gpt-oss-120b',
      visionModel: 'qwen/qwen3.8-27b',
    };
    const available = configuredProviders(config);
    expect(available).toEqual(['groq']);
    const routes = resolveRoutes({}, available);
    expect(Object.values(routes).every((chain) => chain.join('>') === 'groq')).toBe(true);
  });
});
