import { beforeAll, describe, expect, it } from 'vitest';
import { PLAN_TAILORING_POLL_MS } from '@chefer/types';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// Premium "instant week, then the chef tailors it live": generate returns a
// complete week at once with `tailoring` RUNNING; getForWeek then shows days
// flipping to tailored until the job ends. Mutates state, so it runs on its
// own throwaway premium account (dev `user.upgradePlan`). The AI is whatever
// the local API runs — with AI_MOCK_ENABLED a day takes ~0.3 s (+ any
// AI_MOCK_DELAY_MS), so the whole week finishes well inside the timeout.

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const email = uniqueEmail('tailoring');
  const user = await client.auth.register.mutate({
    email,
    password: 'Contract@123!',
    firstName: 'Tailor',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);
  await client.user.upgradePlan.mutate();
  await client.user.grantAiDataConsent.mutate();
});

describe('mealPlan.generate (premium) — instant week + live tailoring', () => {
  it('returns a full week at once and tailors it day by day, today first', async () => {
    const started = Date.now();
    const plan = await client.mealPlan.generate.mutate({ weekOffset: 1 });
    const elapsed = Date.now() - started;

    // Instant: no whole-week AI wait (the old path blocked for minutes).
    expect(elapsed).toBeLessThan(10_000);
    expect(plan.days).toHaveLength(7);
    expect(plan.days.every((d) => d.meals.length > 0)).toBe(true);
    expect(plan.tailoring?.status).toBe('RUNNING');
    expect(plan.tailoring?.queuedDays[0]).toBe(0); // next week: Monday first

    let latest = plan.tailoring;
    const seen: number[][] = [];
    const deadline = Date.now() + 110_000;
    while (latest?.status === 'RUNNING' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, PLAN_TAILORING_POLL_MS));
      const read = await client.mealPlan.getForWeek.query({ weekOffset: 1 });
      latest = read?.tailoring ?? null;
      seen.push([...(latest?.tailoredDays ?? [])]);
    }

    expect(latest?.status).toBe('DONE');
    expect(latest?.tailoredDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Days only ever get added, in order.
    seen.forEach((days, i) => {
      const before = seen[i - 1] ?? [];
      expect(days.slice(0, before.length)).toEqual(before);
    });
  }, 120_000);

  it('a regeneration supersedes the old job (old plan never shows tailoring again)', async () => {
    const first = await client.mealPlan.generate.mutate({ weekOffset: 1 });
    const second = await client.mealPlan.generate.mutate({ weekOffset: 1 });
    expect(second.planId).not.toBe(first.planId);
    const old = await client.mealPlan.getById.query({ planId: first.planId });
    expect(old.tailoring ?? null).toBeNull();
  }, 30_000);

  it('resumeTailoring refuses a plan with nothing left to tailor', async () => {
    const plan = await client.mealPlan.getForWeek.query({ weekOffset: 1 });
    if (!plan) throw new Error('expected a plan for next week');
    await expect(
      client.mealPlan.resumeTailoring.mutate({ planId: plan.planId }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  });
});
