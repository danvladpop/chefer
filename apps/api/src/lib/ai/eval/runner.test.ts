import { describe, expect, it, vi } from 'vitest';
import type { IAIService } from '../types.js';
import { logAiUsage } from '../usage.js';
import { buildEvalService, parseEvalArgs } from './cli.js';
import { loadGoldenSet, swapCases } from './golden.js';
import { buildEvalCases, EVAL_WORKLOADS, runEval, runEvalCases } from './runner.js';

// The golden set is checked in; loading it validates every file.
const golden = loadGoldenSet();

describe('golden set', () => {
  it('has ~20 preference profiles covering allergies, diets, budgets and households', () => {
    expect(golden.profiles).toHaveLength(20);
    const inputs = golden.profiles.map((p) => p.input);
    expect(inputs.some((i) => i.allergies.length > 1)).toBe(true);
    expect(inputs.some((i) => i.dietaryRestrictions.includes('vegan'))).toBe(true);
    expect(inputs.some((i) => i.weeklyBudgetEur !== undefined)).toBe(true);
    expect(inputs.some((i) => (i.householdContext?.portionSum ?? 1) >= 3)).toBe(true);
    expect(inputs.some((i) => i.trainingDays !== undefined)).toBe(true);
  });

  it('stores recipe texts locally (no live fetching) and photos as committed files', () => {
    expect(golden.imports.length).toBeGreaterThanOrEqual(8);
    expect(golden.imports.every((c) => c.text.length > 50)).toBe(true);
    expect(golden.imports.some((c) => c.expected.noRecipe)).toBe(true);
    expect(golden.photos.length).toBeGreaterThanOrEqual(3);
    expect(golden.photos.every((p) => p.imageBase64.length > 0)).toBe(true);
  });

  it('derives one swap case per profile with that profile’s safety prefs', () => {
    const cases = swapCases(golden);
    expect(cases).toHaveLength(20);
    const peanut = cases.find((c) => c.id === 'peanut-allergy');
    expect(peanut?.input.preferences.allergies).toEqual(['peanuts']);
  });

  it('builds cases for every evaluable workload, never chat', () => {
    for (const w of EVAL_WORKLOADS) expect(buildEvalCases(w, golden).length).toBeGreaterThan(0);
    expect(EVAL_WORKLOADS).not.toContain('chat');
    expect(() => buildEvalCases('chat', golden)).toThrow(/not evaluated/);
  });
});

describe('runEvalCases', () => {
  it('times each case, attributes its tokens and never throws on a failing call', async () => {
    let t = 0;
    const cases = [
      {
        id: 'ok',
        call: () => {
          logAiUsage({
            provider: 'p',
            model: 'm',
            op: 'x',
            inputTokens: 7,
            outputTokens: 3,
            ms: 1,
          });
          return Promise.resolve('fine');
        },
        score: () => ({
          schemaValid: true,
          allergenViolations: 0,
          restrictionViolations: 0,
          checks: {},
        }),
      },
      {
        id: 'broken',
        call: () => Promise.reject(new Error('HTTP 500')),
        score: () => {
          throw new Error('never scored');
        },
      },
    ];
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const results = await runEvalCases(cases, {} as IAIService, { now: () => (t += 50) });
    vi.mocked(console.info).mockRestore();

    expect(results[0]).toMatchObject({
      id: 'ok',
      ok: true,
      ms: 50,
      inputTokens: 7,
      outputTokens: 3,
    });
    expect(results[1]).toMatchObject({ id: 'broken', ok: false, error: 'HTTP 500' });
    expect(results[1]?.scores.schemaValid).toBe(false);
  });

  const valid = () => ({
    schemaValid: true,
    allergenViolations: 0,
    restrictionViolations: 0,
    checks: {},
  });

  it('waits out a 429 (Retry-After or "try again in") and retries the case', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const rateLimited = Object.assign(new Error('HTTP 429 — rate limited'), {
      status: 429,
      retryAfterMs: 4000,
    });
    const bodyHint = new Error('failed with HTTP 429 — Please try again in 2.5s.');
    const call = vi
      .fn()
      .mockRejectedValueOnce(rateLimited)
      .mockRejectedValueOnce(bodyHint)
      .mockResolvedValueOnce('ok');
    const [result] = await runEvalCases([{ id: 'a', call, score: valid }], {} as IAIService, {
      sleep,
    });
    expect(result).toMatchObject({ id: 'a', ok: true });
    expect(sleep.mock.calls).toEqual([[4250], [2750]]);
  });

  it('scores a 429 as an error after the retries, or at once for a daily-quota wait', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const daily = Object.assign(new Error('HTTP 429'), { status: 429, retryAfterMs: 3_600_000 });
    const [result] = await runEvalCases(
      [{ id: 'a', call: () => Promise.reject(daily), score: valid }],
      {} as IAIService,
      { sleep },
    );
    expect(result).toMatchObject({ ok: false });
    expect(sleep).not.toHaveBeenCalled();

    const always = Object.assign(new Error('HTTP 429'), { status: 429, retryAfterMs: 100 });
    const call = vi.fn().mockRejectedValue(always);
    const [again] = await runEvalCases([{ id: 'b', call, score: valid }], {} as IAIService, {
      sleep,
      rateLimitRetries: 2,
    });
    expect(again).toMatchObject({ ok: false });
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('never retries a non-rate-limit error', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const call = vi.fn().mockRejectedValue(new Error('HTTP 400 json_validate_failed'));
    await runEvalCases([{ id: 'a', call, score: valid }], {} as IAIService, { sleep });
    expect(call).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('runs cases concurrently, keeps order and attributes tokens per case', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    let inFlight = 0;
    let peak = 0;
    const cases = [1, 2, 3, 4].map((i) => ({
      id: String(i),
      call: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5 * (5 - i)));
        logAiUsage({
          provider: 'p',
          model: 'm',
          op: 'x',
          inputTokens: i,
          outputTokens: i * 10,
          ms: 1,
        });
        inFlight--;
        return i;
      },
      score: valid,
    }));
    const results = await runEvalCases(cases, {} as IAIService, { concurrency: 2 });
    vi.mocked(console.info).mockRestore();
    expect(peak).toBe(2);
    expect(results.map((r) => [r.id, r.inputTokens, r.outputTokens])).toEqual([
      ['1', 1, 10],
      ['2', 2, 20],
      ['3', 3, 30],
      ['4', 4, 40],
    ]);
  });

  it('pauses --delay-ms between cases', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const cases = [1, 2, 3].map((i) => ({
      id: String(i),
      call: () => Promise.resolve(i),
      score: valid,
    }));
    await runEvalCases(cases, {} as IAIService, { sleep, delayMs: 5000 });
    expect(sleep.mock.calls).toEqual([[5000], [5000]]);
  });

  it('respects --limit', async () => {
    const calls = vi.fn().mockResolvedValue('x');
    const cases = [1, 2, 3].map((i) => ({
      id: String(i),
      call: calls,
      score: () => ({
        schemaValid: true,
        allergenViolations: 0,
        restrictionViolations: 0,
        checks: {},
      }),
    }));
    await runEvalCases(cases, {} as IAIService, { limit: 2 });
    expect(calls).toHaveBeenCalledTimes(2);
  });
});

describe('pnpm ai:eval against the mock provider (no keys)', () => {
  it('runs a workload end to end and summarises it', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const service = buildEvalService(['mock'], {
      geminiModel: 'g',
      geminiFastModel: 'f',
      secondaryBaseUrl: 'https://x.test/v1',
      secondaryModel: 's',
      visionModel: 'v',
    });
    const { summary, results } = await runEval('review', 'mock', service, golden, { limit: 2 });
    vi.mocked(console.info).mockRestore();

    expect(results).toHaveLength(2);
    expect(summary).toMatchObject({
      workload: 'review',
      provider: 'mock',
      cases: 2,
      errors: 0,
      schemaValidPct: 100,
      allergenViolations: 0,
      gatePassed: true,
    });
  });
});

describe('parseEvalArgs', () => {
  it('parses --route/--provider in = and space forms', () => {
    expect(parseEvalArgs(['--route=mealPlan', '--provider', 'groq>gemini', '--limit=3'])).toEqual({
      workloads: ['mealPlan'],
      chain: ['groq', 'gemini'],
      limit: 3,
      concurrency: 1,
      delayMs: 0,
      gate: { minSchemaValidPct: 95 },
      out: undefined,
      golden: undefined,
      verbose: false,
    });
    expect(parseEvalArgs(['--route=all', '--provider=mock', '--verbose']).workloads).toEqual([
      ...EVAL_WORKLOADS,
    ]);
    expect(parseEvalArgs(['--route=swap,vision', '--provider=mock']).workloads).toEqual([
      'swap',
      'vision',
    ]);
  });

  it('rejects chat, unknown providers and bad limits', () => {
    expect(() => parseEvalArgs(['--route=chat', '--provider=mock'])).toThrow(/evaluable/);
    expect(() => parseEvalArgs(['--route=swap', '--provider=claude'])).toThrow(/unknown/);
    expect(() => parseEvalArgs(['--route=swap', '--provider=mock', '--limit=0'])).toThrow(/limit/);
    expect(() => parseEvalArgs(['--provider=mock'])).toThrow(/usage/);
    expect(() => parseEvalArgs(['--route=swap', '--provider=mock', '--concurrency=0'])).toThrow(
      /concurrency/,
    );
    expect(() => parseEvalArgs(['--route=swap', '--provider=mock', '--min-schema=101'])).toThrow(
      /min-schema/,
    );
  });

  it('parses pacing and the gate threshold', () => {
    expect(
      parseEvalArgs([
        '--route=swap',
        '--provider=groq',
        '--concurrency=2',
        '--delay-ms=5000',
        '--min-schema=98',
      ]),
    ).toMatchObject({ concurrency: 2, delayMs: 5000, gate: { minSchemaValidPct: 98 } });
  });

  it('refuses a live provider without its key', () => {
    const config = {
      geminiModel: 'g',
      geminiFastModel: 'f',
      secondaryBaseUrl: 'https://x.test/v1',
      secondaryModel: 's',
      visionModel: 'v',
    };
    expect(() => buildEvalService(['groq'], config)).toThrow(/AI_SECONDARY_API_KEY/);
    expect(() => buildEvalService(['gemini'], config)).toThrow(/GEMINI_API_KEY/);
  });
});
