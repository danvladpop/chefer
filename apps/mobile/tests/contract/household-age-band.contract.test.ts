import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// UX-PLAN-12 — optional kid age band on household members. Additive: a 1.0.1
// client never sends `ageBand`, and must keep adding / editing members exactly
// as before. A throwaway user per file (the seeded accounts are read-only here).

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('household-age-band'),
    password: 'Contract@123!',
    ...CONTRACT_CONSENT,
    firstName: 'Household',
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
});

describe('household.add / update / list — ageBand (UX-PLAN-12)', () => {
  it('a 1.0.1-shaped add (no ageBand) still works and reads back ageBand null', async () => {
    const added = await client.household.add.mutate({
      name: 'Partner',
      portionFactor: 1,
      isKid: false,
    });
    expect(added.ageBand).toBeNull();
    const list = await client.household.list.query();
    expect(list.find((m) => m.id === added.id)?.ageBand).toBeNull();
    await client.household.remove.mutate({ id: added.id });
  });

  it('stores a kid age band, changes it, clears it, and drops it when the kid flag goes', async () => {
    const kid = await client.household.add.mutate({
      name: 'Sam',
      portionFactor: 0.75,
      isKid: true,
      ageBand: 'CHILD',
    });
    expect(kid.ageBand).toBe('CHILD');

    const changed = await client.household.update.mutate({ id: kid.id, ageBand: 'TEEN' });
    expect(changed.ageBand).toBe('TEEN');

    // An ordinary edit from an older client leaves the band untouched.
    const renamed = await client.household.update.mutate({ id: kid.id, name: 'Samuel' });
    expect(renamed.ageBand).toBe('TEEN');

    const cleared = await client.household.update.mutate({ id: kid.id, ageBand: null });
    expect(cleared.ageBand).toBeNull();

    await client.household.update.mutate({ id: kid.id, ageBand: 'TODDLER' });
    const grownUp = await client.household.update.mutate({ id: kid.id, isKid: false });
    expect(grownUp.ageBand).toBeNull();

    await client.household.remove.mutate({ id: kid.id });
  });

  it('a non-kid never stores a band, and an unknown band is rejected', async () => {
    const adult = await client.household.add.mutate({
      name: 'Grandpa',
      isKid: false,
      ageBand: 'TEEN',
    });
    expect(adult.ageBand).toBeNull();
    await client.household.remove.mutate({ id: adult.id });

    await expect(
      // @ts-expect-error — deliberately outside the enum
      client.household.add.mutate({ name: 'X', isKid: true, ageBand: 'GIANT' }),
    ).rejects.toBeDefined();
  });
});
