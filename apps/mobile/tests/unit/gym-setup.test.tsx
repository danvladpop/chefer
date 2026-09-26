import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { CompleteSetupInput } from '@chefer/types';
import { defaultUnitFromLocale } from '../../src/features/gym/setup/locale-unit';
import { SetupWizard } from '../../src/features/gym/setup/setup-wizard';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult, queryResult } from './gym-trpc-mock';

// `SetupWizard` (imported above) transitively imports `../../src/lib/trpc`
// BEFORE this file's own `./gym-trpc-mock` import would run, so the factory
// can't reference an imported binding (it would still be undefined the first
// time Jest calls it) — it has to `require()` lazily, right when Jest first
// asks for the mocked module.
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() },
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');
const { router } = jest.requireMock<{
  router: { replace: jest.Mock; back: jest.Mock; canGoBack: jest.Mock; push: jest.Mock };
}>('expo-router');

const RECOMMEND_RESULT = {
  recommendedKey: 'fb3-beginner',
  reason: 'Full Body 3× is the best start.',
  alternatives: [
    {
      key: 'fb2-beginner',
      name: 'Full Body 2×',
      daysPerWeek: 2,
      experience: 'BEGINNER',
      description: 'A lighter start.',
    },
  ],
  preview: { key: 'fb3-beginner', name: 'Full Body 3×', days: [] },
  volume: [],
  hints: [],
};

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function renderWizard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <SetupWizard />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

async function goToPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.press(screen.getByTestId('gym-setup-next')); // step 1 → 2
  await user.press(screen.getByTestId('gym-setup-next')); // step 2 → 3
  await user.press(screen.getByTestId('gym-setup-next')); // step 3 → 4
  await user.press(screen.getByTestId('gym-setup-skip')); // step 4 → 5
}

beforeEach(() => {
  jest.clearAllMocks();
  trpc.gym.profile.recommend.useQuery.mockReturnValue(queryResult({ data: RECOMMEND_RESULT }));
  trpc.gym.profile.save.useMutation.mockReturnValue(mutationResult());
});

describe('SetupWizard', () => {
  it('walks the 7 steps and submits completeSetup with known weights converted to kg', async () => {
    const mutate = jest.fn();
    trpc.gym.profile.completeSetup.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderWizard();

    // Step 1: days (default 3 is fine — just confirm the chip is selectable).
    await user.press(screen.getByTestId('gym-setup-days-3'));
    await user.press(screen.getByTestId('gym-setup-next'));

    // Step 2: experience.
    expect(screen.getByTestId('gym-setup-experience-beginner')).toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-setup-next'));

    // Step 3: equipment + unit — pick lb so the kg-conversion path is exercised.
    await user.press(screen.getByTestId('gym-setup-unit-lb'));
    await user.press(screen.getByTestId('gym-setup-next'));

    // Step 4: weekdays — skippable.
    await user.press(screen.getByTestId('gym-setup-skip'));

    // Step 5: preview — the recommended program renders with day cards.
    await waitFor(() => expect(screen.getByTestId('gym-setup-preview-day-0')).toBeOnTheScreen());
    await user.press(screen.getByTestId('gym-setup-next'));

    // Step 6: starting weights — "I know my weights", enter one in lb.
    await user.press(screen.getByTestId('gym-setup-weights-know'));
    const [firstWeightInput] = screen.getAllByPlaceholderText('lb');
    if (!firstWeightInput) throw new Error('expected at least one weight input');
    await user.type(firstWeightInput, '135');
    await user.press(screen.getByTestId('gym-setup-next'));

    // Step 7: finish.
    expect(screen.getByTestId('gym-setup-expectation')).toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-setup-finish'));

    expect(mutate).toHaveBeenCalledTimes(1);
    const calls = mutate.mock.calls as [CompleteSetupInput][];
    const payload = calls[0]?.[0];
    if (!payload) throw new Error('completeSetup was not called');
    expect(payload.templateKey).toBe('fb3-beginner');
    expect(payload.unit).toBe('LB');
    expect(payload.days).toBe(3);
    expect(payload.experience).toBe('BEGINNER');
    expect(payload.plannedWeekdays).toEqual([]);
    expect(payload.reminderTime).toBeNull();
    const knownWeightsKg = payload.knownWeightsKg ?? {};
    expect(Object.keys(knownWeightsKg)).toHaveLength(1);
    const [kg] = Object.values(knownWeightsKg);
    // 135 lb → ~61.2 kg
    expect(kg).toBeGreaterThan(61);
    expect(kg).toBeLessThan(61.5);
  });

  it('writes the fresh bootstrap into the cache and navigates to Today on success', async () => {
    let onSuccess: ((bootstrap: unknown) => void) | undefined;
    const mutate = jest.fn();
    trpc.gym.profile.completeSetup.useMutation.mockImplementation(
      (opts: { onSuccess: typeof onSuccess }) => {
        onSuccess = opts.onSuccess;
        return mutationResult({ mutate });
      },
    );
    const user = userEvent.setup();
    await renderWizard();
    await goToPreview(user);
    await waitFor(() => expect(screen.getByTestId('gym-setup-preview-day-0')).toBeOnTheScreen());
    await user.press(screen.getByTestId('gym-setup-next')); // → step 6
    await user.press(screen.getByTestId('gym-setup-weights-help'));
    await user.press(screen.getByTestId('gym-setup-next')); // → step 7
    await user.press(screen.getByTestId('gym-setup-finish'));

    expect(onSuccess).toBeDefined();
    onSuccess?.({ profile: { setupCompletedAt: '2026-09-24T00:00:00.000Z' } });
    expect(router.replace).toHaveBeenCalledWith('/today');
  });

  it('defaults the unit to the saved unit preference (P2-6)', async () => {
    trpc.preferences.get.useQuery.mockReturnValue(
      queryResult({ data: { chefProfile: { preferredUnits: 'IMPERIAL' } } }),
    );
    const mutate = jest.fn();
    trpc.gym.profile.completeSetup.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderWizard();
    await goToPreview(user);
    await waitFor(() => expect(screen.getByTestId('gym-setup-preview-day-0')).toBeOnTheScreen());
    await user.press(screen.getByTestId('gym-setup-next')); // → step 6
    await user.press(screen.getByTestId('gym-setup-weights-help'));
    await user.press(screen.getByTestId('gym-setup-next')); // → step 7
    await user.press(screen.getByTestId('gym-setup-finish'));

    const payload = (mutate.mock.calls as [CompleteSetupInput][])[0]?.[0];
    expect(payload?.unit).toBe('LB');
    trpc.preferences.get.useQuery.mockReturnValue(queryResult());
  });

  it('back on the first step leaves setup', async () => {
    const user = userEvent.setup();
    trpc.gym.profile.completeSetup.useMutation.mockReturnValue(mutationResult());
    await renderWizard();
    await user.press(screen.getByTestId('gym-setup-title-back'));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('defaultUnitFromLocale', () => {
  const originalNumberFormat = Intl.NumberFormat;

  afterEach(() => {
    Intl.NumberFormat = originalNumberFormat;
  });

  it('defaults to lb for a US locale', () => {
    // @ts-expect-error partial mock is enough for resolvedOptions().locale
    Intl.NumberFormat = () => ({ resolvedOptions: () => ({ locale: 'en-US' }) });
    expect(defaultUnitFromLocale()).toBe('LB');
  });

  it('defaults to kg for a non-US locale', () => {
    // @ts-expect-error partial mock is enough for resolvedOptions().locale
    Intl.NumberFormat = () => ({ resolvedOptions: () => ({ locale: 'en-GB' }) });
    expect(defaultUnitFromLocale()).toBe('KG');
  });
});
