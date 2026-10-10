// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildShopShareText,
  canNativeShare,
  DEFAULT_SHARE_PREFS,
  loadSharePrefs,
  offeredScopes,
  saveSharePrefs,
  scopeLabel,
  shareCounts,
  shareOrCopy,
  toShareItems,
  type ShopItemLike,
} from './share-list';

// T-13.3: the pure glue behind the Send-the-list dialog.

const items: ShopItemLike[] = [
  { key: 'a', ingredientName: 'Rice', category: 'grains', quantity: '500', unit: 'g' },
  { key: 'b', ingredientName: 'Tomatoes', category: 'produce', quantity: '4', unit: 'pcs' },
  {
    key: 'c',
    ingredientName: 'Chicken',
    category: 'proteins',
    quantity: '600',
    unit: 'g',
    pantryCovered: true,
  },
  {
    key: 'd',
    ingredientName: 'Mystery',
    category: 'weird',
    quantity: '1',
    unit: 'pcs',
    isCustom: true,
  },
];

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('items, counts and scopes', () => {
  it('orders items by the page aisle order, unknown aisles into other', () => {
    expect(toShareItems(items, ['b']).map((i) => [i.aisle, i.name, i.checked])).toEqual([
      ['produce', 'Tomatoes', true],
      ['proteins', 'Chicken', false],
      ['grains', 'Rice', false],
      ['other', 'Mystery', false],
    ]);
  });

  it('counts what each scope sends (ticked and pantry-covered drop out of What’s left)', () => {
    const counts = shareCounts(toShareItems(items, ['b']));
    expect(counts).toEqual({ everything: 4, whatsLeft: 2 });
    expect(offeredScopes(counts)).toEqual(['whatsLeft', 'everything']);
    expect(scopeLabel('whatsLeft', 2)).toBe('What’s left to buy · 2 items');
    expect(scopeLabel('everything', 1)).toBe('Everything · 1 item');
  });

  it('with nothing ticked or covered only Everything is offered', () => {
    const plain = items.filter((i) => !i.pantryCovered);
    const counts = shareCounts(toShareItems(plain, []));
    expect(offeredScopes(counts)).toEqual(['everything']);
  });
});

describe('buildShopShareText', () => {
  const base = {
    items,
    checkedKeys: ['b'],
    weekStart: new Date(2026, 8, 28),
    portions: 2,
    withAmounts: true,
    withDinners: true,
    dinners: [{ dayLabel: 'Mon', recipeName: 'Chicken Stir-fry' }],
    unitSystem: 'METRIC' as const,
    shareUrl: 'https://chefer.example',
  };

  it('writes title, subtitle, aisles in page order, dinners and the footer', () => {
    const text = buildShopShareText({ ...base, scope: 'whatsLeft' });
    expect(text.split('\n\n')).toEqual([
      'Shopping list · 28 Sep – 4 Oct\nFor 1 dinner · 2 portions',
      'GRAINS & PANTRY\n- Rice, 500 g',
      'OTHER\n- Mystery, 1 piece',
      'This week’s dinners\nMon: Chicken Stir-fry',
      'Made with Chefer · https://chefer.example',
    ]);
  });

  it('Everything keeps ticked lines and marks pantry-covered ones; no amounts when off', () => {
    const text = buildShopShareText({
      ...base,
      scope: 'everything',
      withAmounts: false,
      withDinners: false,
    });
    expect(text).toContain('PRODUCE\n- Tomatoes');
    expect(text).toContain('- Chicken (have it)');
    expect(text).not.toContain('500 g');
    expect(text).not.toContain('dinners');
  });
});

describe('remembered choice', () => {
  it('round-trips and falls back to defaults when storage is unavailable or malformed', () => {
    expect(loadSharePrefs()).toEqual(DEFAULT_SHARE_PREFS);
    saveSharePrefs({ scope: 'everything', withAmounts: false, withDinners: true });
    expect(loadSharePrefs()).toEqual({
      scope: 'everything',
      withAmounts: false,
      withDinners: true,
    });
    window.localStorage.setItem('chefer.share-list.prefs.v1', '{oops');
    expect(loadSharePrefs()).toEqual(DEFAULT_SHARE_PREFS);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveSharePrefs(DEFAULT_SHARE_PREFS)).not.toThrow();
  });
});

describe('shareOrCopy', () => {
  it('uses the native share sheet when the browser has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    expect(canNativeShare({ share })).toBe(true);
    expect(await shareOrCopy('hi', { share, writeText })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'hi' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to copying without navigator.share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(canNativeShare({ writeText })).toBe(false);
    expect(await shareOrCopy('hi', { writeText })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('hi');
  });

  it('dismissing the share sheet is a quiet cancel, other share errors copy instead', async () => {
    const abort = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareOrCopy('hi', { share: abort, writeText })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
    const broken = vi.fn().mockRejectedValue(new Error('nope'));
    expect(await shareOrCopy('hi', { share: broken, writeText })).toBe('copied');
  });

  it('reports failure when nothing can deliver the text', async () => {
    expect(await shareOrCopy('hi', {})).toBe('failed');
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    expect(await shareOrCopy('hi', { writeText })).toBe('failed');
  });
});
