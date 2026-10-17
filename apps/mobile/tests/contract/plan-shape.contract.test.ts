import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// The saved "Fit meals to training days" (2026-10-10): `mealPlan.getShape`
// returns it, `mealPlan.setShape` takes it as an OPTIONAL field — a client that
// predates it (every shipped binary, onboarding, Settings) never resets it.
// Registers ONE throwaway user.

const { client, setToken } = makeContractClient();

const shape = {
  slots: ['breakfast', 'lunch', 'dinner'] as ('breakfast' | 'lunch' | 'dinner' | 'snack')[],
  days: [0, 1, 2, 3, 4, 5, 6],
  timeCapMins: null,
  weekendNoLimit: false,
  cookingFor: null,
  leftovers: false,
};

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('plan-shape'),
    password: 'Contract@123!',
    firstName: 'Shape',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
});

describe('mealPlan.getShape / setShape — fitTrainingDays', () => {
  it('starts as null (never chosen) next to the legacy shape', async () => {
    const fresh = await client.mealPlan.getShape.query();
    expect(fresh).toMatchObject({ ...shape, fitTrainingDays: null });
  });

  it('saves a choice, and an old-client save without the field keeps it', async () => {
    const saved = await client.mealPlan.setShape.mutate({ ...shape, fitTrainingDays: false });
    expect(saved.fitTrainingDays).toBe(false);
    expect((await client.mealPlan.getShape.query()).fitTrainingDays).toBe(false);

    // Exactly what a shipped binary sends: the shape + leftovers, nothing else.
    const old = await client.mealPlan.setShape.mutate({ ...shape, slots: ['dinner'] });
    expect(old.fitTrainingDays).toBe(false);
    const read = await client.mealPlan.getShape.query();
    expect(read.slots).toEqual(['dinner']);
    expect(read.fitTrainingDays).toBe(false);
  });

  it('null clears it back to "not chosen"; true is stored as is', async () => {
    expect(
      (await client.mealPlan.setShape.mutate({ ...shape, fitTrainingDays: true })).fitTrainingDays,
    ).toBe(true);
    expect(
      (await client.mealPlan.setShape.mutate({ ...shape, fitTrainingDays: null })).fitTrainingDays,
    ).toBeNull();
    expect((await client.mealPlan.getShape.query()).fitTrainingDays).toBeNull();
  });
});
