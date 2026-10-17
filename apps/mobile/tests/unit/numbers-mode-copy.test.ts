import { youHadText } from '../../src/features/tracker/slot-copy';

describe('numbers-mode copy (WP-08)', () => {
  it('"You had" names the protein in protein-only mode and the calories otherwise', () => {
    const entry = { custom: { name: 'Shawarma' }, kcal: 780, protein: 40 };
    expect(youHadText(entry)).toBe('You had: Shawarma (≈ 780 kcal)');
    expect(youHadText(entry, true)).toBe('You had: Shawarma (≈ 40 g protein)');
    expect(youHadText({ custom: { name: 'Shawarma' }, kcal: 780 }, true)).toBe('You had: Shawarma');
  });
});
