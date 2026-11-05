import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// Lane E2: recap.week and share.create / share.get, the contract the recap
// screen and the share buttons rely on. Registers ONE throwaway user.

const { client, setToken } = makeContractClient();
const anonymous = makeContractClient().client;

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('recap-share'),
    password: 'Contract@123!',
    firstName: 'Recap',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
});

describe('recap.week (lane E2)', () => {
  it('a fresh account gets last week, empty, with no training section', async () => {
    const recap = await client.recap.week.query({ localDate: '2026-10-21' });
    expect(recap).toMatchObject({
      weekStart: '2026-10-12',
      label: '12–18 Oct',
      food: { cookedFromPlan: 0, newRecipesTried: 0, newRecipes: [], proteinDays: null },
      gym: null,
      empty: true,
    });
  });
});

describe('share.create / share.get (lane E2)', () => {
  it('a recap card is public by its link and holds only what was picked', async () => {
    const link = await client.share.create.mutate({
      kind: 'recap',
      weekStart: '2026-10-12',
      localDate: '2026-10-21',
      include: { cooking: true, protein: true, training: true },
    });
    expect(link.url).toMatch(/\/s\/[a-f0-9]{20}$/);
    expect(link.imageUrl).toBe(`${link.url}/image`);

    // Signed out: the card is readable by its id.
    const card = await anonymous.share.get.query({ id: link.id });
    expect(card.payload).toEqual({
      kind: 'recap',
      label: '12–18 Oct',
      cooking: { cookedFromPlan: 0, newRecipesTried: 0 },
    });
  });

  it('a recipe the user cannot see is not shareable, and unknown ids are not found', async () => {
    await expect(
      client.share.create.mutate({ kind: 'recipe', recipeId: 'no-such-recipe' }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    await expect(anonymous.share.get.query({ id: 'abcdefabcdefabcdefab' })).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    });
  });
});
