import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// FB7-10 (WP-24): "In my kitchen" and the AI list are retired on the server
// while every procedure and field stays, so shipped binaries keep parsing. A
// throwaway FREE account proves the shape: the list is always the derived one
// (`aiGenerated: false`), the pantry summary is the neutral zero value even
// when the account still has pantry rows, and `regenerate` keeps its gate.

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('shoplist'),
    password: 'Contract#12345',
    firstName: 'Shop',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);
});

describe('shoppingList: derived list, no pantry', () => {
  it('getForWeek keeps its shape and reports the neutral pantry summary', async () => {
    const row = await client.pantry.restoreItem.mutate({
      ingredientName: 'rice',
      quantity: 800,
      unit: 'g',
      source: 'PURCHASE',
    });
    const list = await client.shoppingList.getForWeek.query({ weekOffset: 0 });
    expect(typeof list.hasPlan).toBe('boolean');
    expect(Array.isArray(list.items)).toBe(true);
    expect(Array.isArray(list.checkedKeys)).toBe(true);
    expect(list.aiGenerated).toBe(false);
    expect(list.pantry).toEqual({ entitled: false, itemCount: 0, savedEur: 0 });
    expect(typeof list.weekStartDate).toBe('string');
    expect(typeof list.weekEndDate).toBe('string');
    await client.pantry.removeItem.mutate({ id: row.id });
  });

  it('regenerate is still callable by name and still premium-gated for free accounts', async () => {
    await expect(client.shoppingList.regenerate.mutate({ weekOffset: 0 })).rejects.toThrow();
  });
});
