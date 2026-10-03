import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { OnboardingWizard } from '../../src/features/onboarding/onboarding-wizard';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
// UX-ONB-01: the wizard's "Leave setup?" sheet reads the safe-area insets.
function renderWizard() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <OnboardingWizard />
    </SafeAreaProvider>,
  );
}

// §2.4, T-03.8 (bug B-43): units follow typed values. Drives the wizard
// (food-only: jobs -> diet -> how you cook -> goal -> metrics), forces
// Imperial explicitly on the How you cook step (deterministic — sidesteps
// the device-region auto-detect), then types a metric-looking height/
// weight on the metrics step and checks it switches to metric with the
// notice + Undo (AC11).

// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in health-consent.test.tsx, so here consent is always on record.
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over top-of-file imports
  const { createElement, useEffect } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable } = require('react-native') as typeof import('react-native');
  return {
    // UX-ONB-01: the wizard registers its BACK handler with useFocusEffect; the
    // screen is always focused here, so run the effect on mount.
    useFocusEffect: (effect: () => (() => void) | undefined): void => {
      useEffect(effect, [effect]);
    },
    router: { push: jest.fn(), replace: jest.fn() },
    Link: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      createElement(Pressable, { testID }, children),
  };
});
jest.mock('../../src/features/gym/mode-store', () => ({ setMode: jest.fn() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => jest.fn(),
}));

const SHAPE = {
  slots: ['breakfast', 'lunch', 'dinner'],
  days: [0, 1, 2, 3, 4, 5, 6],
  timeCapMins: null,
  weekendNoLimit: false,
  cookingFor: null,
  leftovers: false,
};

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      preferences: { invalidate: jest.fn() },
      dashboard: { invalidate: jest.fn() },
    }),
    preferences: {
      get: {
        useQuery: () => ({
          data: { chefProfile: null, dietaryPreferences: null, jobs: [] },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        }),
      },
      setJobs: {
        useMutation: () => ({
          mutate: jest.fn(),
          mutateAsync: jest.fn().mockResolvedValue({ jobs: ['PLAN_MEALS'], intent: 'EAT_BETTER' }),
          isPending: false,
        }),
      },
      updateSafety: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      saveProfileBasics: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      updateTargets: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      setDisplayPreferences: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
    },
    training: { setDayKinds: { useMutation: () => ({ mutateAsync: jest.fn() }) } },
    household: { list: { useQuery: () => ({ data: [] }) } },
    mealPlan: {
      setShape: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      getShape: { useQuery: () => ({ data: SHAPE }) },
      generate: { useMutation: () => ({ mutate: jest.fn() }) },
    },
  },
}));

async function driveToMetrics() {
  const user = userEvent.setup();
  await renderWizard();
  await user.press(screen.getByTestId('onboarding-job-PLAN_MEALS'));
  await user.press(screen.getByTestId('onboarding-continue')); // jobs -> diet
  await waitFor(() => expect(screen.getByTestId('onboarding-continue')).toBeTruthy());
  await user.press(screen.getByTestId('onboarding-continue')); // diet -> how you cook
  await waitFor(() => expect(screen.getByTestId('how-you-cook-units-imperial')).toBeTruthy());
  // Force Imperial explicitly — deterministic, sidesteps the device-region default.
  await user.press(screen.getByTestId('how-you-cook-units-imperial'));
  await user.press(screen.getByTestId('onboarding-continue')); // how you cook -> goal
  await waitFor(() => expect(screen.getByTestId('onboarding-continue')).toBeTruthy());
  await user.press(screen.getByTestId('onboarding-continue')); // goal -> metrics
  await waitFor(() => expect(screen.getByTestId('metrics-height')).toBeTruthy());
}

describe('Onboarding metrics — units follow typed values (bug B-43, AC11)', () => {
  it('labels the fields in inches/lb once Imperial is picked', async () => {
    await driveToMetrics();
    expect(screen.getByText('Height (in)')).toBeTruthy();
    expect(screen.getByText('Weight (lb)')).toBeTruthy();
  });

  it('typing a metric-looking height/weight switches to metric, with the notice + Undo', async () => {
    await driveToMetrics();

    await fireEvent.changeText(screen.getByTestId('metrics-height'), '170');
    await fireEvent.changeText(screen.getByTestId('metrics-weight'), '65');

    await waitFor(() => expect(screen.getByText('Height (cm)')).toBeTruthy());
    expect(screen.getByText('Weight (kg)')).toBeTruthy();
    expect(screen.getByTestId('metrics-units-switch-notice')).toHaveTextContent(
      /Switched to metric because you entered cm and kg\./,
    );
    // The digits are re-interpreted under the new unit, not converted.
    expect(screen.getByTestId('metrics-height')).toHaveDisplayValue('170');
    expect(screen.getByTestId('metrics-weight')).toHaveDisplayValue('65');
  });

  it('Undo reverts to imperial', async () => {
    await driveToMetrics();
    await fireEvent.changeText(screen.getByTestId('metrics-height'), '170');
    await fireEvent.changeText(screen.getByTestId('metrics-weight'), '65');
    await waitFor(() => expect(screen.getByTestId('metrics-units-switch-undo')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('metrics-units-switch-undo'));

    await waitFor(() => expect(screen.getByText('Height (in)')).toBeTruthy());
    expect(screen.getByText('Weight (lb)')).toBeTruthy();
    expect(screen.queryByTestId('metrics-units-switch-notice')).toBeNull();
  });

  it('does not switch when the typed values already fit Imperial', async () => {
    await driveToMetrics();
    await fireEvent.changeText(screen.getByTestId('metrics-height'), '68');
    await fireEvent.changeText(screen.getByTestId('metrics-weight'), '160');

    expect(screen.getByText('Height (in)')).toBeTruthy();
    expect(screen.queryByTestId('metrics-units-switch-notice')).toBeNull();
  });
});

// R-02 (Guideline 1.4.1): a 13-year-old can't continue past body metrics.
describe('Onboarding metrics — minimum age (R-02)', () => {
  it('blocks Continue and shows the message for age 13; clearing or fixing the age unblocks it', async () => {
    await driveToMetrics();

    await fireEvent.changeText(screen.getByTestId('metrics-age'), '13');
    expect(screen.getByTestId('metrics-age-error')).toHaveTextContent(
      'Chefer is for people aged 16 and over.',
    );
    expect(screen.getByTestId('onboarding-continue')).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('metrics-age'), '16');
    expect(screen.queryByTestId('metrics-age-error')).toBeNull();
    expect(screen.getByTestId('onboarding-continue')).toBeEnabled();

    await fireEvent.changeText(screen.getByTestId('metrics-age'), '');
    expect(screen.getByTestId('onboarding-continue')).toBeEnabled();
  });
});
