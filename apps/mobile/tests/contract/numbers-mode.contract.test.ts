import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// WP-08 protein-only mode (lane A): preferences.setNumbersMode, the additive
// numbersMode / proteinGuide / proteinWhy hints, and that the shapes older
// clients read stay exactly as they were. Registers ONE throwaway user.

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('numbers-mode'),
    password: 'Contract@123!',
    firstName: 'Numbers',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
});

describe('preferences.setNumbersMode (WP-08)', () => {
  it('defaults to FULL, switches to PROTEIN_ONLY, reads back everywhere, and switches back', async () => {
    const fresh = await client.preferences.get.query();
    expect(fresh.numbersMode).toBe('FULL');

    const set = await client.preferences.setNumbersMode.mutate({ numbersMode: 'PROTEIN_ONLY' });
    expect(set.numbersMode).toBe('PROTEIN_ONLY');

    const prefs = await client.preferences.get.query();
    expect(prefs.numbersMode).toBe('PROTEIN_ONLY');
    expect(prefs.chefProfile?.numbersMode).toBe('PROTEIN_ONLY');

    const summary = await client.dashboard.summary.query();
    expect(summary.numbersMode).toBe('PROTEIN_ONLY');
    expect(summary.proteinGuide.label).toMatch(/^\d+–\d+ g per meal$/);
    expect(summary.proteinGuide.proteinG).toBe(summary.nutrition.protein.targetG);

    const day = await client.tracker.getDay.query({ date: '2026-10-02' });
    expect(day.numbersMode).toBe('PROTEIN_ONLY');
    expect(day.proteinGuide?.proteinG).toBe(day.targets.proteinG);

    const targets = await client.targets.get.query();
    expect(targets.numbersMode).toBe('PROTEIN_ONLY');
    expect(targets.proteinWhy.effectiveG).toBe(targets.effective.proteinG);
    expect(targets.proteinWhy.referenceGPerKg).toBe(1.6);

    const back = await client.preferences.setNumbersMode.mutate({ numbersMode: 'FULL' });
    expect(back.numbersMode).toBe('FULL');
    expect((await client.dashboard.summary.query()).numbersMode).toBe('FULL');
  });

  it('accepts the reserved NONE and rejects unknown values', async () => {
    const none = await client.preferences.setNumbersMode.mutate({ numbersMode: 'NONE' });
    expect(none.numbersMode).toBe('NONE');
    await expect(
      client.preferences.setNumbersMode.mutate({
        numbersMode: 'KETO' as unknown as 'FULL',
      }),
    ).rejects.toBeTruthy();
    await client.preferences.setNumbersMode.mutate({ numbersMode: 'FULL' });
  });

  it('leaves what 1.0.1 clients read unchanged (full numbers, showNutritionOnToday independent)', async () => {
    await client.preferences.setNumbersMode.mutate({ numbersMode: 'PROTEIN_ONLY' });
    const summary = await client.dashboard.summary.query();
    // Old fields still present with their old types.
    expect(typeof summary.showNutrition).toBe('boolean');
    expect(typeof summary.showNutritionCards).toBe('boolean');
    expect(typeof summary.nutrition.dailyCalorieTarget).toBe('number');
    expect(typeof summary.nutrition.protein.targetG).toBe('number');
    const day = await client.tracker.getDay.query({ date: '2026-10-02' });
    expect(typeof day.targets.dailyCalorieTarget).toBe('number');
    expect(typeof day.targets.carbsG).toBe('number');

    // setHomeDisplay keeps working and does not change the numbers mode.
    const home = await client.preferences.setHomeDisplay.mutate({ showNutritionOnToday: false });
    expect(home.showNutritionOnToday).toBe(false);
    expect((await client.preferences.get.query()).numbersMode).toBe('PROTEIN_ONLY');

    await client.preferences.setNumbersMode.mutate({ numbersMode: 'FULL' });
    await client.preferences.setHomeDisplay.mutate({ showNutritionOnToday: true });
  });
});
