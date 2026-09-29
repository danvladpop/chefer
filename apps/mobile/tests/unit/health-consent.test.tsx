import { useState } from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { GoalBodyCard } from '../../src/features/preferences/goal-body-card';
import { useHealthConsent } from '../../src/features/privacy/use-health-consent';

// UX-26 (T-26.2): health information is stored only after "Allow and save".
// AC1 — the sheet asks first and nothing runs before the answer;
// AC2 — "Don't save it" stores nothing health-related (the save never runs)
//       and shows the amber notice; the sheet is never pre-selected.

let mockUser: { healthDataConsentAt: Date | null } | undefined;
const mockGrant = jest.fn();

jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      user: {
        me: {
          setData: jest.fn(),
          getData: () => mockUser,
          fetch: () => Promise.resolve(mockUser),
        },
      },
    }),
    user: { me: { useQuery: () => ({ data: mockUser }) } },
    privacy: {
      grantHealthConsent: {
        useMutation: () => ({
          mutate: (_input: unknown, opts?: { onSuccess?: () => void }) => {
            mockGrant(_input);
            opts?.onSuccess?.();
          },
          reset: jest.fn(),
          isPending: false,
          isError: false,
        }),
      },
    },
    preferences: {
      computeTargets: { useQuery: jest.fn(() => ({ data: undefined })) },
    },
  },
}));

const save = jest.fn();
const declined = jest.fn();
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function SaveButton({ hasHealthData }: { hasHealthData?: boolean }) {
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  return (
    <>
      <Pressable
        testID="save"
        onPress={() =>
          requestHealthConsent(save, {
            ...(hasHealthData !== undefined && { hasHealthData }),
            onDeclined: declined,
          })
        }
      >
        <Text>Save</Text>
      </Pressable>
      {healthConsentSheet}
    </>
  );
}

const wrap = (node: React.ReactNode) => (
  <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { healthDataConsentAt: null };
});

// The sheet reports "fully gone" through Modal.onDismiss on iOS, which the
// test renderer never fires; Android's path (Modal unmounted) is observable.
beforeAll(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
});

describe('useHealthConsent', () => {
  it('runs straight away when consent is on record', async () => {
    mockUser = { healthDataConsentAt: new Date() };
    await render(wrap(<SaveButton />));
    await userEvent.setup().press(screen.getByTestId('save'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
  });

  it('runs straight away when nothing health-related is being stored', async () => {
    await render(wrap(<SaveButton hasHealthData={false} />));
    await userEvent.setup().press(screen.getByTestId('save'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
  });

  it('asks first: nothing is saved and nothing is recorded before an answer, and neither button is pre-selected', async () => {
    await render(wrap(<SaveButton />));
    await userEvent.setup().press(screen.getByTestId('save'));

    expect(screen.getByText('Can Chefer use this to plan your food?')).toBeTruthy();
    expect(screen.getByTestId('health-consent-allow')).toBeTruthy();
    expect(screen.getByTestId('health-consent-decline')).toBeTruthy();
    expect(screen.queryByRole('radio', { checked: true })).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('"Allow and save" records consent, then saves', async () => {
    await render(wrap(<SaveButton />));
    const user = userEvent.setup();
    await user.press(screen.getByTestId('save'));
    await user.press(screen.getByTestId('health-consent-allow'));

    expect(mockGrant).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(declined).not.toHaveBeenCalled();
  });

  it('"Don\'t save it" stores nothing health-related: no save, no consent, and the caller is told', async () => {
    await render(wrap(<SaveButton />));
    const user = userEvent.setup();
    await user.press(screen.getByTestId('save'));
    await user.press(screen.getByTestId('health-consent-decline'));

    expect(save).not.toHaveBeenCalled();
    expect(mockGrant).not.toHaveBeenCalled();
    expect(declined).toHaveBeenCalledTimes(1);
  });
});

describe("GoalBodyCard — Don't save it (AC2)", () => {
  function Card({ onSave }: { onSave: () => void }) {
    const [, setN] = useState(0);
    return (
      <GoalBodyCard
        initial={{
          goal: null,
          biologicalSex: null,
          age: null,
          heightCm: null,
          weightKg: null,
          activityLevel: null,
        }}
        onSave={() => {
          onSave();
          setN((n) => n + 1);
        }}
        isSaving={false}
        isSaved={false}
      />
    );
  }

  it('sends nothing to the server and shows the amber notice', async () => {
    const onSave = jest.fn();
    await render(wrap(<Card onSave={onSave} />));
    const user = userEvent.setup();
    await user.press(screen.getByTestId('goal-LOSE_WEIGHT'));
    await user.press(screen.getByTestId('prefs-save-goal-body'));
    await user.press(screen.getByTestId('health-consent-decline'));

    expect(onSave).not.toHaveBeenCalled();
    expect(mockGrant).not.toHaveBeenCalled();
    expect(screen.getByTestId('prefs-goal-body-declined')).toBeTruthy();
  });

  it('saves after "Allow and save"', async () => {
    const onSave = jest.fn();
    await render(wrap(<Card onSave={onSave} />));
    const user = userEvent.setup();
    await user.press(screen.getByTestId('goal-LOSE_WEIGHT'));
    await user.press(screen.getByTestId('prefs-save-goal-body'));
    await user.press(screen.getByTestId('health-consent-allow'));

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
