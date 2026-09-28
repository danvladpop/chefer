import { onlineManager } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { useComputedNutrition } from '../../src/features/ingredients/use-computed-nutrition';

// T-40.9 (UX-40 slice 2): debounces the ingredient list before computing,
// keeps the last result while offline (query disabled, cached data stays),
// and never fetches while `enabled` is false (manual mode).

let mockQueryArgs: unknown;
let mockQueryOpts: { enabled: boolean } | undefined;
const mockData = {
  perServing: { calories: 300, protein: 10, carbs: 40, fat: 5, fiber: 2 },
  unmatched: [] as string[],
  matchedCount: 1,
  totalCount: 1,
};

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    ingredients: {
      computeNutrition: {
        useQuery: (args: unknown, opts: { enabled: boolean }) => {
          mockQueryArgs = args;
          mockQueryOpts = opts;
          return { data: opts.enabled ? mockData : undefined, isFetching: false };
        },
      },
    },
  },
}));

function Probe({
  ingredients,
  servings,
  enabled,
  onResult,
}: {
  ingredients: { name: string; quantity: number; unit: string }[];
  servings: number;
  enabled: boolean;
  onResult: (r: ReturnType<typeof useComputedNutrition>) => void;
}) {
  onResult(useComputedNutrition(ingredients, servings, enabled));
  return null;
}

beforeEach(() => {
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('useComputedNutrition', () => {
  it('never fetches when disabled (manual nutrition mode)', async () => {
    let last: ReturnType<typeof useComputedNutrition> | undefined;
    await render(
      <Probe
        ingredients={[{ name: 'flour', quantity: 200, unit: 'g' }]}
        servings={2}
        enabled={false}
        onResult={(r) => (last = r)}
      />,
    );
    expect(mockQueryOpts?.enabled).toBe(false);
    expect(last?.data).toBeUndefined();
  });

  it('does not compute while offline', async () => {
    onlineManager.setOnline(false);
    let last: ReturnType<typeof useComputedNutrition> | undefined;
    await render(
      <Probe
        ingredients={[{ name: 'flour', quantity: 200, unit: 'g' }]}
        servings={2}
        enabled
        onResult={(r) => (last = r)}
      />,
    );
    expect(last?.online).toBe(false);
    expect(mockQueryOpts?.enabled).toBe(false);
  });

  it('debounces a CHANGE to the ingredient list before it counts as "has ingredients"', async () => {
    let last: ReturnType<typeof useComputedNutrition> | undefined;
    const view = await render(
      <Probe ingredients={[]} servings={2} enabled onResult={(r) => (last = r)} />,
    );
    expect(last?.hasIngredients).toBe(false);

    await view.rerender(
      <Probe
        ingredients={[{ name: 'flour', quantity: 200, unit: 'g' }]}
        servings={2}
        enabled
        onResult={(r) => (last = r)}
      />,
    );
    // The 600ms debounce hasn't elapsed yet — still reads the old (empty) list.
    expect(last?.hasIngredients).toBe(false);

    await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
    await view.rerender(
      <Probe
        ingredients={[{ name: 'flour', quantity: 200, unit: 'g' }]}
        servings={2}
        enabled
        onResult={(r) => (last = r)}
      />,
    );
    expect(last?.hasIngredients).toBe(true);
    expect(mockQueryArgs).toEqual({
      ingredients: [{ name: 'flour', quantity: 200, unit: 'g' }],
      servings: 2,
    });
  });
});
