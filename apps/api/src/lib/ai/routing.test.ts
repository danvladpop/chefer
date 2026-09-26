import { describe, expect, it, vi } from 'vitest';
import {
  AI_PROVIDER_NAMES,
  AI_WORKLOADS,
  DEFAULT_AI_ROUTES,
  describeRoutes,
  FREE_ONLY_AI_ROUTES,
  isValidChain,
  nonFreeRouteSettings,
  parseChain,
  parseShadowRoutes,
  providersInRoutes,
  resolveRoutes,
} from './routing.js';

describe('DEFAULT_AI_ROUTES — today’s table, unchanged', () => {
  it('matches the pre-refactor failover routing exactly', () => {
    expect(DEFAULT_AI_ROUTES).toEqual({
      // primary-first (quality-sensitive)
      mealPlan: ['gemini', 'groq'],
      swap: ['gemini', 'groq'],
      cheferize: ['gemini', 'groq'],
      importText: ['gemini', 'groq'],
      review: ['gemini', 'groq'],
      // secondary-first (cheap, high-volume)
      chat: ['groq', 'gemini'],
      prices: ['groq', 'gemini'],
      shopping: ['groq', 'gemini'],
      // vision: Gemini only
      vision: ['gemini'],
    });
  });

  it('covers every workload', () => {
    expect(Object.keys(DEFAULT_AI_ROUTES).sort()).toEqual([...AI_WORKLOADS].sort());
  });
});

describe('parseChain', () => {
  it('parses ordered chains, trimming and lower-casing', () => {
    expect(parseChain('gemini>groq', AI_PROVIDER_NAMES)).toEqual(['gemini', 'groq']);
    expect(parseChain(' Groq > gemini ', AI_PROVIDER_NAMES)).toEqual(['groq', 'gemini']);
    expect(parseChain('groq', AI_PROVIDER_NAMES)).toEqual(['groq']);
  });

  it('rejects unknown providers, empty steps and repeats', () => {
    expect(() => parseChain('gemini>openai', AI_PROVIDER_NAMES)).toThrow(/unknown AI provider/);
    expect(() => parseChain('gemini>', AI_PROVIDER_NAMES)).toThrow(/not a provider chain/);
    expect(() => parseChain('groq>groq', AI_PROVIDER_NAMES)).toThrow(/twice/);
    expect(isValidChain('mock', AI_PROVIDER_NAMES)).toBe(false);
    expect(isValidChain('mock>groq', [...AI_PROVIDER_NAMES, 'mock'])).toBe(true);
  });
});

describe('resolveRoutes', () => {
  it('with both providers and no overrides, is the default table', () => {
    expect(resolveRoutes({}, ['gemini', 'groq'])).toEqual(DEFAULT_AI_ROUTES);
  });

  it('without a secondary key, everything is Gemini alone (no failover, as today)', () => {
    const table = resolveRoutes({}, ['gemini']);
    for (const w of AI_WORKLOADS) expect(table[w]).toEqual(['gemini']);
  });

  it('with AI_PROVIDER=openai, everything (vision included) goes to the secondary', () => {
    const table = resolveRoutes({}, ['groq']);
    for (const w of AI_WORKLOADS) expect(table[w]).toEqual(['groq']);
  });

  it('applies overrides per workload only', () => {
    const table = resolveRoutes({ mealPlan: ['groq', 'gemini'], vision: ['groq'] }, [
      'gemini',
      'groq',
    ]);
    expect(table.mealPlan).toEqual(['groq', 'gemini']);
    expect(table.vision).toEqual(['groq']);
    expect(table.swap).toEqual(['gemini', 'groq']);
  });

  it('drops unconfigured providers from an override and warns', () => {
    const warn = vi.fn();
    const table = resolveRoutes({ chat: ['groq', 'gemini'], swap: ['groq'] }, ['gemini'], warn);
    expect(table.chat).toEqual(['gemini']);
    // Nothing left → every configured provider.
    expect(table.swap).toEqual(['gemini']);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('AI_ROUTE_CHAT=groq>gemini'));
  });

  it('refuses to build a table with no provider at all', () => {
    expect(() => resolveRoutes({}, [])).toThrow(/no AI provider/);
  });

  it('describes the table for the startup log', () => {
    expect(describeRoutes(resolveRoutes({}, ['gemini', 'groq']))).toContain('mealPlan=gemini>groq');
  });
});

describe('parseShadowRoutes', () => {
  it('parses one or several workload:chain entries', () => {
    expect(parseShadowRoutes('mealPlan:groq')).toEqual(new Map([['mealPlan', ['groq']]]));
    expect(parseShadowRoutes('swap:groq>gemini, vision:groq')).toEqual(
      new Map([
        ['swap', ['groq', 'gemini']],
        ['vision', ['groq']],
      ]),
    );
  });

  it('rejects chat (tools write data), unknown workloads and bad chains', () => {
    expect(() => parseShadowRoutes('chat:groq')).toThrow(/cannot be shadowed/);
    expect(() => parseShadowRoutes('dessert:groq')).toThrow(/cannot be shadowed/);
    expect(() => parseShadowRoutes('mealPlan')).toThrow(/<workload>:<chain>/);
    expect(() => parseShadowRoutes('mealPlan:claude')).toThrow(/unknown AI provider/);
  });
});

describe('free-only mode', () => {
  it('routes every workload, vision included, groq first then cloudflare', () => {
    for (const w of AI_WORKLOADS) expect(FREE_ONLY_AI_ROUTES[w]).toEqual(['groq', 'cloudflare']);
  });

  it('resolves to groq>cloudflare with those defaults, and never falls back to gemini', () => {
    const table = resolveRoutes({}, ['groq', 'cloudflare'], undefined, FREE_ONLY_AI_ROUTES);
    expect(describeRoutes(table)).not.toContain('gemini');
    expect(providersInRoutes(table)).toEqual(['groq', 'cloudflare']);
    // Without the CF keys it is Groq alone — still no Gemini.
    const groqOnly = resolveRoutes({}, ['groq'], undefined, FREE_ONLY_AI_ROUTES);
    expect(providersInRoutes(groqOnly)).toEqual(['groq']);
  });

  it('flags every setting that names gemini, and nothing else', () => {
    expect(
      nonFreeRouteSettings({
        AI_ROUTE_CHAT: 'groq>gemini',
        AI_ROUTE_SWAP: 'groq>cloudflare',
        AI_ROUTE_VISION: undefined,
        AI_SHADOW_ROUTE: 'mealPlan:cloudflare,swap:Gemini',
      }),
    ).toEqual(['AI_ROUTE_CHAT=groq>gemini', 'AI_SHADOW_ROUTE=mealPlan:cloudflare,swap:Gemini']);
    expect(nonFreeRouteSettings({ AI_ROUTE_CHAT: '' })).toEqual([]);
  });

  it('accepts cloudflare in chains', () => {
    expect(AI_PROVIDER_NAMES).toContain('cloudflare');
    expect(parseChain('groq>cloudflare', AI_PROVIDER_NAMES)).toEqual(['groq', 'cloudflare']);
  });
});
