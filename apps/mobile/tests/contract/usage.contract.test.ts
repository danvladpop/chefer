import { describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// T-10.8 (bug B-49, delta rule 6): `profile.getAiUsage` reports what the
// server actually reserves. Mutates state, so every test registers its own
// throwaway account. The three new fields are additive + optional for old
// readers; `today` and `geminiTotal` keep their shape.

async function freshUser(prefix: string) {
  const c = makeContractClient();
  const user = await c.client.auth.register.mutate({
    email: uniqueEmail(prefix),
    password: 'Contract@123!',
    firstName: 'Usage',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  c.setToken(user.session.token);
  return c.client;
}

describe('profile.getAiUsage — honest counters', () => {
  it('carries the additive fields, all zero for a new account', async () => {
    const client = await freshUser('usage-empty');
    const usage = await client.profile.getAiUsage.query();
    expect(usage.aiMealPlans).toBe(0);
    expect(usage.curatedPlans).toBe(0);
    expect(usage.importsSaved).toBe(0);
    // Shipped clients still read these.
    expect(usage.today.MEAL_PLAN).toBe(0);
    expect(usage.geminiTotal).toBe(0);
  });

  it('a free curated generate raises curatedPlans and leaves aiMealPlans + the AI total alone', async () => {
    const client = await freshUser('usage-free');
    await client.mealPlan.generate.mutate({ weekOffset: 1 });

    const usage = await client.profile.getAiUsage.query();
    expect(usage.curatedPlans).toBe(1);
    expect(usage.aiMealPlans).toBe(0);
    expect(usage.today.CURATED_PLAN).toBe(1);
    expect(usage.today.MEAL_PLAN).toBe(0);
    expect(usage.geminiTotal).toBe(0);
  });

  it('a premium generate is one AI-plan reservation; resumeTailoring changes no count', async () => {
    const client = await freshUser('usage-premium');
    await client.user.upgradePlan.mutate();
    await client.user.grantAiDataConsent.mutate();

    const plan = await client.mealPlan.generate.mutate({ weekOffset: 1 });
    const afterGenerate = await client.profile.getAiUsage.query();
    expect(afterGenerate.aiMealPlans).toBe(1);
    // The instant curated week is not a second, curated count.
    expect(afterGenerate.curatedPlans).toBe(0);

    // Whatever it answers (nothing left to tailor, or a resume), it reserves nothing.
    await client.mealPlan.resumeTailoring.mutate({ planId: plan.planId }).catch(() => undefined);
    const afterResume = await client.profile.getAiUsage.query();
    expect(afterResume.aiMealPlans).toBe(afterGenerate.aiMealPlans);
    expect(afterResume.curatedPlans).toBe(afterGenerate.curatedPlans);
    expect(afterResume.geminiTotal).toBe(afterGenerate.geminiTotal);
  }, 60_000);
});
