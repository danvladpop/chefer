import { describe, expect, it } from 'vitest';
import { computeRecipeNutrition, type NutritionIngredient } from './compute';
import { FDC_GOLDEN, type FdcGoldenFood } from './fdc-golden.fixture';

// Golden tests (plan-ingredient-catalog §5.5). Inputs are USDA FDC SR Legacy
// values read by scripts/ingredients/golden-fixture.mjs. Densities come from
// each food's FDC "1 cup" weight ÷ 236.6 ml and portions from its FDC portion
// rows, the same rules the catalog build uses. Expected numbers were computed
// independently of this engine (grams × per-100 g, EU carbs = carbohydrate by
// difference − fiber, half-up rounding) and must match to ±0.5.

type Key = keyof typeof FDC_GOLDEN;

function portion(food: FdcGoldenFood, label: string): number {
  const p = food.portions.find((x) => x.label === label);
  if (!p) throw new Error(`${food.description}: no FDC portion "${label}"`);
  return p.gramWeight;
}

const SPEC: Record<Key, { density?: string; portions?: Record<string, string>; edible?: number }> =
  {
    chickenBreastRaw: {},
    chickenThighSkinOnRaw: { edible: 0.7 },
    riceWhiteDry: {},
    oliveOil: { density: '1 cup' },
    garlic: { portions: { clove: '1 clove' } },
    flourAllPurpose: { density: '1 cup' },
    egg: { portions: { large: '1 large', medium: '1 medium' } },
    onion: { portions: { medium: '1 medium (2-1/2" dia)' } },
    broccoli: {},
    butter: { density: '1 cup' },
    milkWhole: { density: '1 cup' },
    oatsDry: { density: '1 cup' },
    tomato: { portions: { medium: '1 medium whole (2-3/5" dia)' } },
    banana: { portions: { medium: '1 medium (7" to 7-7/8" long)' } },
    spinach: {},
    avocado: { portions: { piece: '1 avocado, NS as to Florida or California' } },
    lentilsDry: {},
    sugar: { density: '1 cup' },
    salt: { density: '1 cup' },
    potato: {},
    beefGround90: {},
    chickpeasDry: {},
    honey: { density: '1 cup' },
    almonds: {},
    carrot: { portions: { medium: '1 medium' } },
    greekYogurtLowfat: {},
    salmonFarmed: {},
    redPepper: { portions: { medium: '1 medium (approx 2-3/4" long, 2-1/2 dia.)' } },
    feta: {},
    lemonJuice: { density: '1 cup' },
    quinoaCooked: {},
  };

const CATALOG = new Map<string, NutritionIngredient>(
  (Object.keys(SPEC) as Key[]).map((key) => {
    const food: FdcGoldenFood = FDC_GOLDEN[key];
    const spec = SPEC[key];
    return [
      key,
      {
        id: key,
        kcalPer100g: food.kcal,
        proteinPer100g: food.protein,
        carbsPer100g: Math.max(0, food.carbsByDifference - food.fiber),
        fatPer100g: food.fat,
        fiberPer100g: food.fiber,
        densityGPerMl: spec.density ? portion(food, spec.density) / 236.6 : null,
        edibleFraction: spec.edible ?? 1,
        portions: Object.entries(spec.portions ?? {}).map(([unit, label]) => ({
          unit,
          grams: portion(food, label),
        })),
      },
    ];
  }),
);

const GOLDEN: {
  name: string;
  servings: number;
  lines: [Key, number, string][];
  perServing: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
}[] = [
  {
    name: 'chicken, rice and olive oil bowl (plan \u00a75.5 example)',
    servings: 1,
    lines: [
      ['chickenBreastRaw', 200, 'g'],
      ['riceWhiteDry', 100, 'g'],
      ['oliveOil', 10, 'g'],
    ],
    perServing: { calories: 693, protein: 52.1, carbs: 78.7, fat: 15.9, fiber: 1.3 },
  },
  {
    name: 'spinach and feta omelette',
    servings: 1,
    lines: [
      ['egg', 3, 'large'],
      ['spinach', 50, 'g'],
      ['feta', 30, 'g'],
      ['oliveOil', 1, 'tsp'],
    ],
    perServing: { calories: 345, protein: 24.5, carbs: 3.0, fat: 25.4, fiber: 1.1 },
  },
  {
    name: 'pancakes',
    servings: 4,
    lines: [
      ['flourAllPurpose', 1, 'cup'],
      ['milkWhole', 1, 'cup'],
      ['egg', 1, 'large'],
      ['butter', 1, 'tbsp'],
      ['sugar', 1, 'tbsp'],
    ],
    perServing: { calories: 206, protein: 6.7, carbs: 29.1, fat: 6.4, fiber: 0.8 },
  },
  {
    name: 'lentil soup',
    servings: 4,
    lines: [
      ['lentilsDry', 200, 'g'],
      ['onion', 1, 'medium'],
      ['carrot', 2, 'medium'],
      ['garlic', 2, 'clove'],
      ['oliveOil', 1, 'tbsp'],
      ['salt', 1, 'pinch'],
    ],
    perServing: { calories: 232, protein: 13.0, carbs: 31.0, fat: 4.0, fiber: 6.7 },
  },
  {
    name: 'overnight oats',
    servings: 1,
    lines: [
      ['oatsDry', 0.5, 'cup'],
      ['milkWhole', 1, 'cup'],
      ['banana', 1, 'medium'],
      ['honey', 1, 'tbsp'],
    ],
    perServing: { calories: 472, protein: 14.4, carbs: 76.3, fat: 11.0, fiber: 7.2 },
  },
  {
    name: 'beef and chickpea chili',
    servings: 4,
    lines: [
      ['beefGround90', 500, 'g'],
      ['chickpeasDry', 200, 'g'],
      ['tomato', 400, 'g'],
      ['redPepper', 1, 'medium'],
      ['onion', 1, 'medium'],
    ],
    perServing: { calories: 446, protein: 36.7, carbs: 31.3, fat: 15.8, fiber: 8.4 },
  },
  {
    name: 'salmon with potatoes',
    servings: 2,
    lines: [
      ['salmonFarmed', 300, 'g'],
      ['potato', 500, 'g'],
      ['oliveOil', 2, 'tbsp'],
      ['lemonJuice', 2, 'tbsp'],
    ],
    perServing: { calories: 627, protein: 35.8, carbs: 39.5, fat: 33.9, fiber: 5.3 },
  },
  {
    name: 'greek yogurt bowl',
    servings: 1,
    lines: [
      ['greekYogurtLowfat', 200, 'g'],
      ['almonds', 30, 'g'],
      ['honey', 1, 'tbsp'],
      ['banana', 1, 'medium'],
    ],
    perServing: { calories: 489, protein: 27.6, carbs: 51.9, fat: 19.2, fiber: 6.9 },
  },
  {
    name: 'guacamole',
    servings: 4,
    lines: [
      ['avocado', 2, 'piece'],
      ['tomato', 1, 'medium'],
      ['onion', 0.5, 'medium'],
      ['lemonJuice', 1, 'tbsp'],
      ['salt', 1, 'pinch'],
    ],
    perServing: { calories: 173, protein: 2.4, carbs: 4.0, fat: 14.8, fiber: 7.3 },
  },
  {
    name: 'roast chicken thighs, bone-in purchase weight (edibleFraction 0.7)',
    servings: 3,
    lines: [
      ['chickenThighSkinOnRaw', 600, 'g'],
      ['broccoli', 300, 'g'],
      ['oliveOil', 1, 'tbsp'],
    ],
    perServing: { calories: 383, protein: 25.9, carbs: 4.4, fat: 28.1, fiber: 2.6 },
  },
  {
    name: 'quinoa salad (cooked state row)',
    servings: 2,
    lines: [
      ['quinoaCooked', 185, 'g'],
      ['redPepper', 1, 'medium'],
      ['tomato', 150, 'g'],
      ['feta', 50, 'g'],
      ['oliveOil', 1, 'tbsp'],
      ['lemonJuice', 1, 'tbsp'],
    ],
    perServing: { calories: 268, protein: 8.9, carbs: 22.9, fat: 14.2, fiber: 4.8 },
  },
  {
    name: 'chicken stir fry in imperial units',
    servings: 3,
    lines: [
      ['chickenBreastRaw', 1, 'lb'],
      ['broccoli', 8, 'oz'],
      ['carrot', 1, 'medium'],
      ['garlic', 2, 'clove'],
      ['oliveOil', 1, 'tbsp'],
    ],
    perServing: { calories: 258, protein: 36.5, carbs: 5.1, fat: 8.8, fiber: 2.6 },
  },
  {
    name: 'banana bread',
    servings: 10,
    lines: [
      ['flourAllPurpose', 2, 'cup'],
      ['banana', 3, 'medium'],
      ['sugar', 0.5, 'cup'],
      ['egg', 2, 'large'],
      ['butter', 0.5, 'cup'],
    ],
    perServing: { calories: 257, protein: 4.3, carbs: 35.6, fat: 10.5, fiber: 1.6 },
  },
  {
    name: 'spinach and chickpeas in kg and ml',
    servings: 4,
    lines: [
      ['chickpeasDry', 0.25, 'kg'],
      ['spinach', 0.3, 'kg'],
      ['oliveOil', 30, 'ml'],
      ['garlic', 2, 'clove'],
      ['salt', 1, 'to taste'],
    ],
    perServing: { calories: 316, protein: 15.0, carbs: 33.3, fat: 10.9, fiber: 9.3 },
  },
  {
    name: 'breakfast plate',
    servings: 1,
    lines: [
      ['egg', 2, 'large'],
      ['tomato', 1, 'medium'],
      ['avocado', 0.5, 'piece'],
      ['butter', 10, 'g'],
    ],
    perServing: { calories: 398, protein: 15.7, carbs: 5.9, fat: 32.6, fiber: 8.2 },
  },
  {
    name: 'rice and lentils for six',
    servings: 6,
    lines: [
      ['riceWhiteDry', 300, 'g'],
      ['lentilsDry', 150, 'g'],
      ['onion', 2, 'medium'],
      ['oliveOil', 3, 'tbsp'],
      ['salt', 2, 'pinch'],
    ],
    perServing: { calories: 345, protein: 10.1, carbs: 55.3, fat: 7.4, fiber: 3.9 },
  },
];

describe('computeRecipeNutrition — golden recipes from FDC data', () => {
  it('covers at least 15 recipes', () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(15);
  });

  it.each(GOLDEN)('$name', ({ servings, lines, perServing }) => {
    const result = computeRecipeNutrition(
      lines.map(([ingredientId, quantity, unit]) => ({ ingredientId, quantity, unit })),
      CATALOG,
      servings,
    );
    expect(result.status).toBe('COMPUTED');
    for (const key of ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const) {
      expect(Math.abs(result.perServing[key] - perServing[key]), key).toBeLessThanOrEqual(0.5);
    }
  });
});
