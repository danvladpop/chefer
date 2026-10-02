import { useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import type { SafetyPickerValue } from '@chefer/utils';
import PreferencesScreen from '../../app/preferences';
import { SafetyPicker, type SafetyPickerHandle } from '../../src/features/safety/safety-picker';
import type { createTrpcPreferencesMock } from './preferences-trpc-mock';
import { mutationResult, queryResult } from './preferences-trpc-mock';

// UX-ACC-01: a term typed in "Something else?" but never confirmed with "+"
// used to be dropped on Save while the button said "Saved ✓". Every host must
// flush the picker first. Covered here: the picker's flush(), the Preferences
// host (the household sheets are in household-editor.test.tsx, the onboarding
// diet step in onboarding-pending-term.test.tsx).

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
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

const { trpc } =
  jest.requireMock<ReturnType<typeof createTrpcPreferencesMock>>('../../src/lib/trpc');

const EMPTY: SafetyPickerValue = {
  allergies: [],
  dietaryRestrictions: [],
  dislikedIngredients: [],
};

/** A minimal host: the picker plus a Save button that saves what flush() returns. */
function Host({ onSave }: { onSave: (value: SafetyPickerValue) => void }) {
  const ref = useRef<SafetyPickerHandle>(null);
  const [value, setValue] = useState(EMPTY);
  return (
    <>
      <SafetyPicker ref={ref} value={value} onChange={setValue} testIDPrefix="h" />
      <Pressable
        testID="host-save"
        onPress={() => {
          const flushed = ref.current ? ref.current.flush() : value;
          if (flushed !== null) onSave(flushed);
        }}
      >
        <Text>Save</Text>
      </Pressable>
    </>
  );
}

describe('SafetyPicker.flush (UX-ACC-01)', () => {
  it('adds a recognised typed term ("sesame") to the value Save receives', async () => {
    const onSave = jest.fn();
    await render(<Host onSave={onSave} />);
    await fireEvent.changeText(screen.getByTestId('h-something-else-input'), 'sesame');
    await fireEvent.press(screen.getByTestId('host-save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [saved] = onSave.mock.calls[0] as [SafetyPickerValue];
    expect(saved.allergies).toContain('Sesame');
    // The field is emptied and the user sees what was added.
    expect(screen.getByTestId('h-something-else-input').props.value).toBe('');
    expect(screen.getByTestId('h-added-message')).toHaveTextContent('Added to Allergies: Sesame.');
  });

  it('keeps what was already ticked alongside the typed term', async () => {
    const onSave = jest.fn();
    await render(<Host onSave={onSave} />);
    await fireEvent.press(screen.getByText('Peanuts'));
    await fireEvent.changeText(screen.getByTestId('h-something-else-input'), 'sesame');
    await fireEvent.press(screen.getByTestId('host-save'));

    const [saved] = onSave.mock.calls[0] as [SafetyPickerValue];
    expect(saved.allergies).toEqual(expect.arrayContaining(['Peanuts', 'Sesame']));
  });

  it('saves the current value untouched when nothing is typed', async () => {
    const onSave = jest.fn();
    await render(<Host onSave={onSave} />);
    await fireEvent.press(screen.getByText('Peanuts'));
    await fireEvent.press(screen.getByTestId('host-save'));
    expect(onSave).toHaveBeenCalledWith({ ...EMPTY, allergies: ['Peanuts'] });
  });

  it('blocks Save on an unrecognised term and says what to do — then saves once it is kept', async () => {
    const onSave = jest.fn();
    await render(<Host onSave={onSave} />);
    await fireEvent.changeText(screen.getByTestId('h-something-else-input'), 'zzqqxx');
    await fireEvent.press(screen.getByTestId('host-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('h-unchecked-notice')).toBeOnTheScreen();
    expect(screen.getByTestId('h-save-blocked')).toHaveTextContent(/zzqqxx/);

    await fireEvent.press(screen.getByTestId('h-unchecked-notice-keep-note'));
    await fireEvent.press(screen.getByTestId('host-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onSave.mock.calls[0])).toContain('zzqqxx');
  });

  it('reports a pending edit to the host while the field holds un-added text', async () => {
    const onPendingChange = jest.fn();
    function Pending() {
      const [value, setValue] = useState(EMPTY);
      return (
        <SafetyPicker
          value={value}
          onChange={setValue}
          testIDPrefix="p"
          onPendingChange={onPendingChange}
        />
      );
    }
    await render(<Pending />);
    await fireEvent.changeText(screen.getByTestId('p-something-else-input'), 'ses');
    expect(onPendingChange).toHaveBeenLastCalledWith(true);
    await fireEvent.changeText(screen.getByTestId('p-something-else-input'), '');
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });
});

describe('Preferences — Save safety preferences (UX-ACC-01)', () => {
  const SAFE_AREA_METRICS = {
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
    frame: { x: 0, y: 0, width: 390, height: 844 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    trpc.auth.me.useQuery.mockReturnValue(
      queryResult({ data: { planTier: 'FREE', role: 'USER' } }),
    );
    trpc.preferences.get.useQuery.mockReturnValue(
      queryResult({
        data: {
          chefProfile: null,
          dietaryPreferences: {
            allergies: ['Peanuts'],
            dietaryRestrictions: [],
            dislikedIngredients: [],
          },
        },
      }),
    );
    trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult());
    trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult());
    trpc.preferences.setDisplayPreferences.useMutation.mockReturnValue(mutationResult());
  });

  function renderScreen() {
    return render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <PreferencesScreen />
      </SafeAreaProvider>,
    );
  }

  it('stores the typed "sesame" together with the ticked allergies', async () => {
    const mutate = jest.fn();
    trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderScreen();

    await user.type(screen.getByTestId('prefs-something-else-input'), 'sesame');
    await user.press(screen.getByTestId('prefs-save-safety'));

    expect(mutate).toHaveBeenCalledTimes(1);
    const [payload] = mutate.mock.calls[0] as [SafetyPickerValue];
    expect(payload.allergies).toEqual(expect.arrayContaining(['Peanuts', 'Sesame']));
  });

  it('does not save (and does not say "Saved ✓") while a typed term needs a choice', async () => {
    const mutate = jest.fn();
    trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderScreen();

    await user.type(screen.getByTestId('prefs-something-else-input'), 'zzqqxx');
    await user.press(screen.getByTestId('prefs-save-safety'));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('prefs-save-blocked')).toBeOnTheScreen();
    expect(screen.queryByText('Saved ✓')).toBeNull();
  });

  it('"Saved ✓" gives way to the save button again when more text is typed afterwards', async () => {
    trpc.preferences.updateSafety.useMutation.mockReturnValue(
      mutationResult({ mutate: jest.fn(), isSuccess: true }),
    );
    const user = userEvent.setup();
    await renderScreen();
    expect(screen.getByText('Saved ✓')).toBeOnTheScreen();

    await user.type(screen.getByTestId('prefs-something-else-input'), 'ses');
    expect(screen.getByText('Save safety preferences')).toBeOnTheScreen();
  });
});
