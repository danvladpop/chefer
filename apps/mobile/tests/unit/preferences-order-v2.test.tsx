import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PreferencesScreen from '../../app/preferences';
import type { createTrpcPreferencesMock } from './preferences-trpc-mock';
import { mutationResult, queryResult } from './preferences-trpc-mock';

// 10 Oct redesign, board "Preferences" ("Goals & diet"): in the new shell
// Goal & body comes first and the allergies/diets card second (owner: "Move
// this Goals section first and Allergies afterwards"); the old shell keeps
// its order. `?section=` deep links still land on the right card in both.

let mockShellV2 = true;
jest.mock('../../src/features/shell/shell-store', () => ({
  ...jest.requireActual<object>('../../src/features/shell/shell-store'),
  useShellV2: () => mockShellV2,
}));
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
let mockParams: { section?: string } = {};
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockParams,
}));

const { trpc } =
  jest.requireMock<ReturnType<typeof createTrpcPreferencesMock>>('../../src/lib/trpc');
const { router } = jest.requireMock<{ router: { replace: jest.Mock; back: jest.Mock } }>(
  'expo-router',
);

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <PreferencesScreen />
    </SafeAreaProvider>,
  );
}

/** Section anchor ids in on-screen order. */
function sectionOrder(): string[] {
  const json = JSON.stringify(screen.toJSON());
  return [...json.matchAll(/"testID":"section-([a-z-]+)"/g)].map((m) => m[1] ?? '');
}

const utilsFake = {
  preferences: { get: { invalidate: jest.fn() }, invalidate: jest.fn() },
  gym: { invalidate: jest.fn() },
  mealPlan: { invalidate: jest.fn() },
  dashboard: { invalidate: jest.fn(), summary: { invalidate: jest.fn() } },
  targets: {
    invalidate: jest.fn(),
    get: { invalidate: jest.fn() },
    changes: { invalidate: jest.fn() },
  },
  user: { me: { setData: jest.fn(), invalidate: jest.fn() } },
  tracker: { getDay: { invalidate: jest.fn() } },
};

const layoutEvent = { nativeEvent: { layout: { x: 0, y: 400, width: 300, height: 120 } } };

beforeEach(() => {
  jest.clearAllMocks();
  mockShellV2 = true;
  mockParams = {};
  trpc.useUtils.mockReturnValue(utilsFake);
  trpc.auth.me.useQuery.mockReturnValue(
    queryResult({ data: { planTier: 'PREMIUM', role: 'USER' } }),
  );
  trpc.preferences.get.useQuery.mockReturnValue(
    queryResult({
      data: {
        chefProfile: {
          preferredUnits: 'METRIC',
          deliveryCurrency: 'EUR',
          weeklyBudgetEur: 60,
          goal: null,
          dailyCalorieTarget: 2100,
        },
        dietaryPreferences: null,
      },
    }),
  );
  trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.setDisplayPreferences.useMutation.mockReturnValue(mutationResult());
});

describe('Preferences in the new shell ("Goals & diet")', () => {
  it('is titled Goals & diet', async () => {
    await renderScreen();
    expect(screen.getByTestId('preferences-title')).toHaveTextContent('Goals & diet');
  });

  it('puts Goal & body first, then food safety, then the rest in the old order', async () => {
    await renderScreen();
    expect(sectionOrder()).toEqual([
      'goal-body',
      'safety',
      'targets',
      'auto-plan',
      'weekly-updates',
      'display',
      'budget',
    ]);
  });

  it('shows the current target above Goal & body', async () => {
    await renderScreen();
    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf('current target')).toBeLessThan(json.indexOf('"section-goal-body"'));
  });

  it('?section=safety still scrolls to and tints the safety card, titled after the row', async () => {
    mockParams = { section: 'safety' };
    await renderScreen();
    expect(screen.getByTestId('preferences-title')).toHaveTextContent('Allergies & diets');
    await fireEvent(screen.getByTestId('section-safety'), 'layout', layoutEvent);
    expect(String(screen.getByTestId('section-safety').props.className)).toMatch(/bg-primary/);
    expect(String(screen.getByTestId('section-goal-body').props.className)).not.toMatch(
      /bg-primary/,
    );
  });

  it('Back falls back to You without history', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('preferences-back'));
    expect(router.replace).toHaveBeenCalledWith('/you');
  });
});

describe('Preferences in the old shell', () => {
  beforeEach(() => {
    mockShellV2 = false;
  });

  it('keeps its title and order: food safety first, then Goal & body', async () => {
    await renderScreen();
    expect(screen.getByTestId('preferences-title')).toHaveTextContent('Preferences');
    expect(sectionOrder()).toEqual([
      'safety',
      'goal-body',
      'targets',
      'auto-plan',
      'weekly-updates',
      'display',
      'budget',
    ]);
    expect(screen.queryByTestId('preferences-back')).toBeNull();
  });

  it('?section=goal-body still lands on Goal & body', async () => {
    mockParams = { section: 'goal-body' };
    await renderScreen();
    await fireEvent(screen.getByTestId('section-goal-body'), 'layout', layoutEvent);
    expect(String(screen.getByTestId('section-goal-body').props.className)).toMatch(/bg-primary/);
  });
});
