import type { ReactNode } from 'react';
import type { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Input } from '@chefer/ui-mobile';
import MoreScreen from '../../app/(food)/more';
import HouseholdScreen from '../../app/household';
import PreferencesScreen from '../../app/preferences';
import SettingsJobsScreen from '../../app/settings/jobs';
import {
  mutationResult,
  queryResult,
  type createTrpcPreferencesMock,
} from './preferences-trpc-mock';

// WP-03 lane B: keyboard-aware scrolling on Preferences (UX-X-05), Household
// (UX-X-05), More → Feedback (UX-X-05, UX-ACC-25), and the jobs screen's
// scroll / back row / unsaved-work guard (UX-ACC-05).

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const Safe = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
);

// ── navigation (router + the guard's React Navigation hooks) ────────────────
type PreventRemoveCallback = (options: { data: { action: unknown } }) => void;
const mockPrevent: { value: boolean; callback: PreventRemoveCallback | null } = {
  value: false,
  callback: null,
};
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({ dispatch: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (prevent: boolean, callback: PreventRemoveCallback) => {
    mockPrevent.value = prevent;
    mockPrevent.callback = callback;
  },
}));

// ── collaborators ────────────────────────────────────────────────────────────
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/features/friends/api/use-friends-badge', () => ({
  useFriendsBadge: () => ({ available: false, badgeCount: 0 }),
}));
jest.mock('../../src/features/settings/use-sign-out', () => ({
  useSignOut: () => ({ request: jest.fn(), isPending: false, warningSheet: null }),
}));
jest.mock('../../src/features/household/household-editor', () => ({
  HouseholdEditor: () => {
    /* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports */
    const { createElement } = require('react') as typeof import('react');
    const { Input } = require('@chefer/ui-mobile') as typeof import('@chefer/ui-mobile');
    /* eslint-enable @typescript-eslint/no-require-imports */
    return createElement(Input, { testID: 'household-name-stub' });
  },
}));
const mockJobsSave = jest.fn();
let mockSavedJobs: string[] = ['PLAN_MEALS'];
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- factory runs before imports resolve
  const mock = require('./preferences-trpc-mock') as typeof import('./preferences-trpc-mock');
  const base = mock.createTrpcPreferencesMock();
  return {
    trpc: {
      ...base.trpc,
      preferences: {
        ...base.trpc.preferences,
        get: { useQuery: jest.fn() },
        setJobs: { useMutation: jest.fn() },
      },
      feedback: { submit: { useMutation: jest.fn() } },
    },
  };
});
const { trpc } = jest.requireMock<{
  trpc: ReturnType<typeof createTrpcPreferencesMock>['trpc'] & {
    feedback: { submit: { useMutation: jest.Mock } };
    preferences: { setJobs: { useMutation: jest.Mock } };
  };
}>('../../src/lib/trpc');

/** The mock TextInput class' prototype: spying on it intercepts every field's measureLayout. */
async function textInputPrototype(): Promise<TextInput> {
  const holder: { node: TextInput | null } = { node: null };
  await render(
    <Input
      ref={(n) => {
        holder.node = n;
      }}
    />,
  );
  if (!holder.node) throw new Error('no TextInput ref');
  return Object.getPrototypeOf(holder.node) as TextInput;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrevent.value = false;
  mockPrevent.callback = null;
  mockSavedJobs = ['PLAN_MEALS'];
  trpc.auth.me.useQuery.mockReturnValue(queryResult({ data: { planTier: 'FREE', role: 'USER' } }));
  trpc.preferences.get.useQuery.mockImplementation(() =>
    queryResult({
      data: {
        chefProfile: { preferredUnits: 'METRIC', deliveryCurrency: 'EUR', weeklyBudgetEur: null },
        dietaryPreferences: null,
        jobs: mockSavedJobs,
      },
    }),
  );
  trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.setDisplayPreferences.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.setJobs.useMutation.mockReturnValue(mutationResult({ mutate: mockJobsSave }));
  trpc.feedback.submit.useMutation.mockReturnValue(mutationResult());
});
afterEach(() => jest.restoreAllMocks());

describe('Preferences (UX-X-05)', () => {
  it('scrolls in a keyboard-aware view that lets the first tap through', async () => {
    await render(
      <Safe>
        <PreferencesScreen />
      </Safe>,
    );
    expect(screen.getByTestId('preferences-scroll').props.keyboardShouldPersistTaps).toBe(
      'handled',
    );
  });

  it('the budget field scrolls clear of the keyboard and has its own Done bar', async () => {
    // Premium: the budget is editable (free is read-only and cannot take focus).
    trpc.auth.me.useQuery.mockReturnValue(
      queryResult({ data: { planTier: 'PREMIUM', role: 'USER' } }),
    );
    const proto = await textInputPrototype();
    const measure = jest.spyOn(proto, 'measureLayout').mockImplementation(() => undefined);
    await render(
      <Safe>
        <PreferencesScreen />
      </Safe>,
    );
    const budget = screen.getByTestId('prefs-budget');
    expect(budget.props.inputAccessoryViewID).toBe('prefs-budget-numeric-bar-0');
    expect(screen.getByTestId('prefs-budget-numeric-bar-0')).toHaveTextContent('Done');
    await fireEvent(budget, 'focus');
    expect(measure).toHaveBeenCalled();
  });
});

describe('Household (UX-X-05)', () => {
  it('scrolls in a keyboard-aware view, and its name field scrolls itself into view', async () => {
    const proto = await textInputPrototype();
    const measure = jest.spyOn(proto, 'measureLayout').mockImplementation(() => undefined);
    await render(
      <Safe>
        <HouseholdScreen />
      </Safe>,
    );
    expect(screen.getByTestId('household-scroll').props.keyboardShouldPersistTaps).toBe('handled');
    await fireEvent(screen.getByTestId('household-name-stub'), 'focus');
    expect(measure).toHaveBeenCalled();
  });
});

describe('More → Feedback (UX-X-05, UX-ACC-25)', () => {
  it('scrolls in a keyboard-aware view and the feedback field scrolls itself into view', async () => {
    const proto = await textInputPrototype();
    const measure = jest.spyOn(proto, 'measureLayout').mockImplementation(() => undefined);
    await render(
      <Safe>
        <MoreScreen />
      </Safe>,
    );
    expect(screen.getByTestId('more-scroll').props.keyboardShouldPersistTaps).toBe('handled');
    await fireEvent(screen.getByTestId('feedback-input'), 'focus');
    expect(measure).toHaveBeenCalled();
  });

  it('Send is disabled while the message is empty and enables once something is typed', async () => {
    await render(
      <Safe>
        <MoreScreen />
      </Safe>,
    );
    const send = () => screen.getByTestId('feedback-submit');
    expect(send()).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('feedback-input'), '   ');
    expect(send()).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('feedback-input'), 'The plan is great');
    expect(send()).toBeEnabled();
  });
});

describe('Settings → What you use Chefer for (UX-ACC-05)', () => {
  it('has a back row and a scrolling list above a pinned Save', async () => {
    const { router } = jest.requireMock<{ router: { back: jest.Mock } }>('expo-router');
    await render(
      <Safe>
        <SettingsJobsScreen />
      </Safe>,
    );
    expect(screen.getByTestId('settings-jobs-scroll')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-job-TRAIN')).toBeOnTheScreen();
    expect(screen.getByTestId('settings-jobs-save')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('settings-jobs-back'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('guards leaving only once the selection changed, and Keep editing keeps it', async () => {
    await render(
      <Safe>
        <SettingsJobsScreen />
      </Safe>,
    );
    // Untouched: nothing to lose, removal is not prevented.
    expect(mockPrevent.value).toBe(false);

    await fireEvent.press(screen.getByTestId('onboarding-job-TRAIN'));
    expect(mockPrevent.value).toBe(true);
    await act(() => {
      mockPrevent.callback?.({ data: { action: { type: 'GO_BACK' } } });
    });
    expect(screen.getByText('Discard your changes?')).toBeOnTheScreen();
    expect(screen.getByText('Keep editing')).toBeOnTheScreen();

    // Putting the selection back to what is saved lifts the guard again.
    await fireEvent.press(screen.getByText('Keep editing'));
    await fireEvent.press(screen.getByTestId('onboarding-job-TRAIN'));
    expect(mockPrevent.value).toBe(false);
  });
});
