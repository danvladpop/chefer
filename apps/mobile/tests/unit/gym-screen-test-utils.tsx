import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from '../../src/lib/trpc';

// Same fixed frame/insets as ui-gym-primitives.test.tsx: every gym screen
// uses Screen (SafeAreaView) or Sheet (useSafeAreaInsets, which throws
// without a provider), so tests need a SafeAreaProvider ancestor.
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// Shared render helper for G2-D's gym screens (exercises tab, exercise
// detail/form, session detail, stats tab): same trpc-Provider-over-a-dummy-
// URL trick as gym-mode-switch.test.tsx, so screens whose queries are either
// pre-seeded in the cache or gated on `online` never make a real request.

export function makeGymQueryClient(): QueryClient {
  // `gcTime: Infinity` on mutations too: the 5-minute default schedules a GC
  // timer for every mutation a test fires, which keeps Jest from exiting.
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { gcTime: Infinity, retry: false },
    },
  });
}

// RNTL's `render` resolves asynchronously under React 19's concurrent root
// (mirrors gym-mode-switch.test.tsx's `await renderSwitch(...)`), so this
// helper is async too — callers must `await` it.
export async function renderWithGym(
  ui: ReactElement,
  queryClient: QueryClient = makeGymQueryClient(),
) {
  // The trpc client below points at a dummy, unreachable port: screens under
  // test either read pre-seeded cache data or gate their queries on
  // `online`, so nothing should ever need a real response. Letting a real
  // `fetch` reach for that port can hang the whole run on the OS connection
  // timeout instead of failing fast (observed with a mutation's `.mutate()`
  // call), so `fetch` is re-stubbed on every render — re-applied here rather
  // than once at module load, since a test file's own `jest.restoreAllMocks`
  // between tests would otherwise silently bring back the real one.
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline (test)'));

  const client = trpc.createClient({
    links: [httpBatchLink({ url: 'http://127.0.0.1:9/trpc', transformer: superjson })],
  });
  const result = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <trpc.Provider client={client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </trpc.Provider>
    </SafeAreaProvider>,
  );
  return { queryClient, ...result };
}
