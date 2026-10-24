import { beforeAll, describe, expect, it } from 'vitest';
import { makeUser, type ContractUser } from './friends-helpers';

// Packaged products (ADR 0005): the free path a shipped-or-next app uses —
// save your own product, find it by barcode and by name, log it by servings,
// see it in Recents — plus privacy (another user can't see or log it) and the
// premium label scan's gate. Throwaway users only; nothing touches alice.
// Nothing here reaches Open Food Facts: every barcode looked up is the user's
// own product, which the lookup answers before ever calling OFF.

const TODAY = new Date().toISOString().slice(0, 10);
// A 64×64 white PNG: decodes fine and holds no barcode.
const BLANK_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAeklEQVR4nNXOQREAAAyDMPybZiL62BEFwTiMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwziMwzi+A6sDylPSwv6dS34AAAAASUVORK5CYII=';

/** A valid EAN-13 in the "20" in-store range, random per run. */
function inStoreEan13(): string {
  const body = `20${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[11 - i]) * (i % 2 === 0 ? 3 : 1);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

let owner: ContractUser;
let other: ContractUser;
const barcode = inStoreEan13();
const name = `Contract granola ${barcode.slice(-5)}`;

beforeAll(async () => {
  owner = await makeUser({ prefix: 'products-contract' });
  other = await makeUser({ prefix: 'products-contract-other' });
}, 60_000);

describe('products (ADR 0005)', () => {
  let productId = '';

  it('create saves a private USER product; lookupBarcode finds it as `own` with allergen info', async () => {
    const created = await owner.api.products.create.mutate({
      source: 'USER',
      barcode,
      name,
      brand: 'Contract Mills',
      per100g: {
        kcal: 450,
        protein: 10,
        carbs: 60,
        fat: 18,
        fiber: null,
        sugar: null,
        saturatedFat: null,
        salt: null,
      },
      servingSizeG: 45,
      allergens: { known: true, contains: ['tree-nuts'] },
    });
    productId = created.product.id;
    expect(created.product).toMatchObject({
      barcode,
      source: 'USER',
      isOwn: true,
      allergens: { status: 'listed', contains: [{ id: 'tree-nuts', label: 'Tree nuts' }] },
    });

    const found = await owner.api.products.lookupBarcode.query({ barcode });
    expect(found).toMatchObject({ status: 'found', origin: 'own', product: { id: productId } });
  });

  it('search finds it by name for its owner only', async () => {
    const mine = await owner.api.products.search.query({ query: name });
    expect(mine.map((r) => r.product.id)).toContain(productId);
    const theirs = await other.api.products.search.query({ query: name });
    expect(theirs.map((r) => r.product.id)).not.toContain(productId);
  });

  it('logProduct logs 2 servings as a custom entry with a product ref, and Recents carries it', async () => {
    const logged = await owner.api.tracker.logProduct.mutate({
      date: TODAY,
      productId,
      amount: { unit: 'serving', servings: 2 },
      mealType: 'breakfast',
      rebalanceMode: 'preview',
    });
    expect(logged.entryId).toBeTruthy();
    const day = await owner.api.tracker.getDay.query({ date: TODAY });
    const entry = day.log?.loggedMeals.find((m) => m.entryId === logged.entryId);
    expect(entry).toMatchObject({
      custom: { name: `Contract Mills ${name}, 2 servings (90 g)`, estimatedBy: 'manual' },
      kcal: 405,
      protein: 9,
      carbs: 54,
      fat: 16.2,
      product: { id: productId, grams: 90 },
    });
    const recents = await owner.api.tracker.recents.query({ limit: 15 });
    expect(recents.find((r) => r.productId === productId)).toBeTruthy();
  });

  it("another user can't log someone else's private product", async () => {
    await expect(
      other.api.tracker.logProduct.mutate({
        date: TODAY,
        productId,
        amount: { unit: 'g', grams: 100 },
        mealType: 'snack',
      }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
  });

  it('a barcode photo with no barcode answers `unreadable`', async () => {
    await expect(
      owner.api.products.lookupBarcodePhoto.mutate({
        imageBase64: BLANK_PNG,
        mimeType: 'image/png',
      }),
    ).resolves.toEqual({ status: 'unreadable' });
  });

  it('the label scan is premium: a free user is refused', async () => {
    await expect(
      owner.api.products.scanLabel.mutate({ imageBase64: BLANK_PNG, mimeType: 'image/png' }),
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
  });
});
