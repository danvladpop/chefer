import { onlineManager } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { useComputedNutrition } from '../../src/features/ingredients/use-computed-nutrition';

// plan-ingredient-catalog §10 (P9): the live preview runs the shared engine
// over `ingredients.getMany` rows. Only ids it hasn't seen are fetched, and
// a line whose row is unknown makes the result PARTIAL (never a guess).

const mockCalls: { ids: string[]; enabled: boolean }[] = [];
const EGG = {
  id: 'egg',
  name: 'Egg, whole, raw',
  category: 'EGG',
  owner: 'global',
  portions: [{ unit: 'piece', grams: 50 }],
  hasDensity: true,
  nutritionSource: 'USDA_FDC',
  status: 'ACTIVE',
  per100g: {
    calories: 148,
    protein: 12.4,
    carbs: 1,
    fat: 10,
    fiber: 0,
    sugar: null,
    satFat: null,
    sodiumMg: null,
  },
  densityGPerMl: 1.03,
  edibleFraction: 1,
  sourceRef: 'fdc:1',
};

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    ingredients: {
      getMany: {
        useQuery: (args: { ids: string[] }, opts: { enabled: boolean }) => {
          mockCalls.push({ ids: args.ids, enabled: opts.enabled });
          return {
            data: opts.enabled ? [EGG].filter((r) => args.ids.includes(r.id)) : undefined,
            isFetching: false,
          };
        },
      },
    },
  },
}));

type Result = ReturnType<typeof useComputedNutrition>;
function Probe({
  lines,
  servings,
  onResult,
}: {
  lines: { ingredientId: string | null; quantity: number; unit: string }[];
  servings: number;
  onResult: (r: Result) => void;
}) {
  onResult(useComputedNutrition(lines, servings));
  return null;
}

beforeEach(() => {
  mockCalls.length = 0;
  onlineManager.setOnline(true);
});
afterEach(() => onlineManager.setOnline(true));

describe('useComputedNutrition', () => {
  it('computes with the shared engine from the fetched rows', async () => {
    let last: Result | undefined;
    await render(
      <Probe
        lines={[{ ingredientId: 'egg', quantity: 2, unit: 'piece' }]}
        servings={1}
        onResult={(r) => (last = r)}
      />,
    );
    expect(mockCalls[0]).toEqual({ ids: ['egg'], enabled: true });
    expect(last?.result?.status).toBe('COMPUTED');
    expect(last?.result?.perServing.calories).toBe(148);
    expect(last?.details.get('egg')?.name).toBe('Egg, whole, raw');
  });

  it('divides by servings and flags an unlinked line as PARTIAL', async () => {
    let last: Result | undefined;
    await render(
      <Probe
        lines={[
          { ingredientId: 'egg', quantity: 2, unit: 'piece' },
          { ingredientId: null, quantity: 1, unit: 'g' },
        ]}
        servings={2}
        onResult={(r) => (last = r)}
      />,
    );
    expect(last?.result?.status).toBe('PARTIAL');
    expect(last?.result?.perServing.calories).toBe(74);
  });

  it('never fetches with no linked lines, and offline it does not fetch', async () => {
    let last: Result | undefined;
    await render(<Probe lines={[]} servings={1} onResult={(r) => (last = r)} />);
    expect(mockCalls.every((c) => !c.enabled)).toBe(true);
    expect(last?.result).toBeUndefined();
    expect(last?.hasIngredients).toBe(false);

    mockCalls.length = 0;
    onlineManager.setOnline(false);
    await render(
      <Probe
        lines={[{ ingredientId: 'egg', quantity: 1, unit: 'piece' }]}
        servings={1}
        onResult={(r) => (last = r)}
      />,
    );
    expect(mockCalls.every((c) => !c.enabled)).toBe(true);
    expect(last?.result?.status).toBe('PARTIAL');
  });
});
