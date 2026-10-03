import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import PreferencesScreen from '../../app/preferences';
import type { createTrpcPreferencesMock } from './preferences-trpc-mock';
import { mutationResult, queryResult } from './preferences-trpc-mock';

// AC4 (UX-10, B-10): on a free plan the weekly budget field is read-only and
// says why — it never accepts input that a missing Save button then drops.

// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in health-consent.test.tsx, so here consent is always on record.
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- factory runs before imports resolve
  const mock = require('./preferences-trpc-mock') as typeof import('./preferences-trpc-mock');
  return mock.createTrpcPreferencesMock();
});
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

const { trpc } =
  jest.requireMock<ReturnType<typeof createTrpcPreferencesMock>>('../../src/lib/trpc');

it('free: the budget field is not editable, has no Save, and the helper says it is Premium', async () => {
  trpc.auth.me.useQuery.mockReturnValue(queryResult({ data: { planTier: 'FREE', role: 'USER' } }));
  trpc.preferences.get.useQuery.mockReturnValue(
    queryResult({
      data: {
        chefProfile: {
          preferredUnits: 'METRIC',
          deliveryCurrency: 'EUR',
          weeklyBudgetEur: null,
          goal: null,
        },
        dietaryPreferences: null,
      },
    }),
  );
  trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.setDisplayPreferences.useMutation.mockReturnValue(mutationResult());

  await render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <PreferencesScreen />
    </SafeAreaProvider>,
  );

  expect(screen.getByTestId('prefs-budget').props.editable).toBe(false);
  expect(screen.queryByTestId('prefs-save-extras')).not.toBeOnTheScreen();
  expect(screen.getByText('Saving a weekly budget is part of Premium.')).toBeOnTheScreen();
});
