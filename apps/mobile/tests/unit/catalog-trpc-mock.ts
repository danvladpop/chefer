// plan-ingredient-catalog §10 (P9): a minimal `trpc.ingredients` namespace
// for screens that embed the catalog picker (search sheet, private-ingredient
// sheet, live preview) but whose tests aren't about it. Every query answers
// empty and every mutation is idle. Use inside a jest.mock factory:
//   jest.mock('../../src/lib/trpc', () => ({ trpc: { ...require('./catalog-trpc-mock').catalogTrpc() } }))

export interface CatalogTrpcOptions {
  /** Rows `ingredients.getMany` returns (filtered by the requested ids). */
  details?: { id: string }[];
  search?: unknown[];
}

const idleMutation = {
  mutate: () => undefined,
  reset: () => undefined,
  isPending: false,
  isError: false,
  error: null,
  data: undefined,
};

export function catalogTrpc(options: CatalogTrpcOptions = {}) {
  return {
    useUtils: () => ({
      ingredients: { resolve: { fetch: () => Promise.resolve([]) } },
      recipe: { list: { invalidate: () => undefined } },
    }),
    ingredients: {
      search: { useQuery: () => ({ data: options.search ?? [], isFetching: false }) },
      resolve: { useQuery: () => ({ data: undefined, isError: false }) },
      getMany: {
        useQuery: (args: { ids: string[] }, opts: { enabled: boolean }) => ({
          data: opts.enabled
            ? (options.details ?? []).filter((d) => args.ids.includes(d.id))
            : undefined,
          isFetching: false,
        }),
      },
      createCustom: { useMutation: () => idleMutation },
      estimateNutrition: { useMutation: () => idleMutation },
    },
    auth: { me: { useQuery: () => ({ data: { planTier: 'PREMIUM', role: 'USER' } }) } },
  };
}
