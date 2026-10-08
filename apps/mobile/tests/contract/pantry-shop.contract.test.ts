import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// WP-11 (UX-SHOP-05): the pantry's remove / edit / Undo are open to EVERY tier
// (the free "In my kitchen" list used to only grow), and `removeItem` hands the
// removed row back for the Undo — additively: shipped clients that read only
// `ok` keep working. A throwaway FREE account proves the tier.

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('pantry'),
    password: 'Contract#12345',
    firstName: 'Pantry',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);
});

describe('pantry: manage your own kitchen on the free tier', () => {
  it('restore → edit → remove (with the removed row back) → restore again', async () => {
    const restored = await client.pantry.restoreItem.mutate({
      ingredientName: 'Rice',
      quantity: 800,
      unit: 'g',
      source: 'PURCHASE',
    });
    expect(restored).toMatchObject({ ingredientName: 'rice', quantity: 800, unit: 'g' });

    const edited = await client.pantry.updateItem.mutate({
      id: restored.id,
      quantity: 500,
      unit: 'g',
    });
    expect(edited).toMatchObject({ id: restored.id, quantity: 500 });

    const some = await client.pantry.updateItem.mutate({
      id: restored.id,
      quantity: null,
      unit: 'g',
    });
    expect(some.quantity).toBeNull();

    const removed = await client.pantry.removeItem.mutate({ id: restored.id });
    expect(removed.ok).toBe(true);
    expect(removed.removed).toMatchObject({ ingredientName: 'rice', unit: 'g' });
    expect((await client.pantry.list.query()).items).toHaveLength(0);

    const undone = await client.pantry.restoreItem.mutate({
      ingredientName: 'rice',
      unit: 'g',
      source: 'PURCHASE',
    });
    expect(undone.ingredientName).toBe('rice');
    expect((await client.pantry.list.query()).items).toHaveLength(1);
    await client.pantry.removeItem.mutate({ id: undone.id });
  });

  it('a unit change moves the row instead of duplicating it', async () => {
    const row = await client.pantry.restoreItem.mutate({
      ingredientName: 'flour',
      quantity: 1,
      unit: 'kg',
      source: 'MANUAL',
    });
    const moved = await client.pantry.updateItem.mutate({ id: row.id, quantity: 2.2, unit: 'lb' });
    expect(moved.unit).toBe('lb');
    const items = (await client.pantry.list.query()).items.filter(
      (i) => i.ingredientName === 'flour',
    );
    expect(items).toHaveLength(1);
    await client.pantry.removeItem.mutate({ id: moved.id });
  });

  it('refuses a zero or negative amount, and removing a gone row is not an error', async () => {
    const row = await client.pantry.restoreItem.mutate({
      ingredientName: 'oats',
      quantity: 100,
      unit: 'g',
      source: 'PURCHASE',
    });
    await expect(
      client.pantry.updateItem.mutate({ id: row.id, quantity: -5, unit: 'g' }),
    ).rejects.toThrow();
    await expect(
      client.pantry.updateItem.mutate({ id: row.id, quantity: 0, unit: 'g' }),
    ).rejects.toThrow();
    await client.pantry.removeItem.mutate({ id: row.id });
    const again = await client.pantry.removeItem.mutate({ id: row.id });
    expect(again).toEqual({ ok: true, removed: null });
  });

  it('adding by hand and the weekly confirm stay premium', async () => {
    await expect(
      client.pantry.addItem.mutate({ name: 'lentils', quantity: 1, unit: 'kg' }),
    ).rejects.toThrow();
  });
});
