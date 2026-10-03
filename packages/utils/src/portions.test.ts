import { describe, expect, it } from 'vitest';
import { portionsFor, tableBreakdown } from './portions';

describe('portionsFor (UX-PLAN-02, UX-REC-02)', () => {
  it('solo: the eater is the whole table', () => {
    expect(portionsFor({ eaterPortion: 1.25 })).toEqual({
      eaterPortion: 1.25,
      cookServings: 1.25,
      shopMultiplier: 1.25,
      othersServings: 0,
    });
    expect(portionsFor()).toMatchObject({ eaterPortion: 1, cookServings: 1, shopMultiplier: 1 });
  });

  it('"two of us" keeps the eater portion and adds a standard partner to the table', () => {
    const p = portionsFor({ eaterPortion: 1, cookingFor: 2 });
    expect(p.eaterPortion).toBe(1);
    expect(p.cookServings).toBe(2);
    expect(p.shopMultiplier).toBe(2);
    // A 0.75x eater (weight loss) still only eats 0.75x; the partner adds one serving.
    const loss = portionsFor({ eaterPortion: 0.75, cookingFor: 2 });
    expect(loss.eaterPortion).toBe(0.75);
    expect(loss.cookServings).toBe(1.75);
  });

  it('cooking for 3+ adds N-1 standard portions, like the legacy placeholder members', () => {
    expect(portionsFor({ eaterPortion: 1, cookingFor: 4 }).cookServings).toBe(4);
  });

  it('owner 2x + Mia 1/2 + Noah 1 = 3.5 servings (not ceil(2.5) x 2)', () => {
    const p = portionsFor({
      eaterPortion: 2,
      members: [{ portionFactor: 0.5 }, { portionFactor: 1 }],
    });
    expect(p.eaterPortion).toBe(2);
    expect(p.cookServings).toBe(3.5);
    expect(p.shopMultiplier).toBe(3.5);
    expect(p.othersServings).toBe(1.5);
  });

  it('members describe the table exactly, so they win over "cooking for"', () => {
    const p = portionsFor({ eaterPortion: 1, members: [{ portionFactor: 1 }], cookingFor: 2 });
    expect(p.cookServings).toBe(2);
    expect(
      portionsFor({ eaterPortion: 1, members: [{ portionFactor: 0.5 }], cookingFor: 2 })
        .cookServings,
    ).toBe(1.5);
  });

  it('a members table scales Shop by servings the recipe was written for', () => {
    const members = [{ portionFactor: 1 }, { portionFactor: 1 }];
    expect(portionsFor({ eaterPortion: 1, members, recipeServings: 1 }).shopMultiplier).toBe(3);
    expect(portionsFor({ eaterPortion: 1, members, recipeServings: 3 }).shopMultiplier).toBe(1);
    // "cooking for" is a plain multiplier of the recipe as written
    expect(portionsFor({ eaterPortion: 1, cookingFor: 2, recipeServings: 4 }).shopMultiplier).toBe(
      2,
    );
  });

  it('ignores junk (negative factors, absurd or missing portions)', () => {
    expect(portionsFor({ eaterPortion: -3, members: [{ portionFactor: -1 }] }).cookServings).toBe(
      1,
    );
    expect(portionsFor({ eaterPortion: null, cookingFor: 1 }).cookServings).toBe(1);
  });

  it('does not drift on float noise', () => {
    const members = [{ portionFactor: 0.1 }, { portionFactor: 0.2 }];
    expect(portionsFor({ eaterPortion: 1, members }).cookServings).toBe(1.3);
  });
});

describe('tableBreakdown', () => {
  it('spells out "You 2 · Mia ½ · Noah 1 = 3½"', () => {
    expect(
      tableBreakdown(2, [
        { name: 'Mia', portionFactor: 0.5 },
        { name: 'Noah', portionFactor: 1 },
      ]),
    ).toBe('You 2 · Mia ½ · Noah 1 = 3½');
  });

  it('is null without members', () => {
    expect(tableBreakdown(1, [])).toBeNull();
  });
});
