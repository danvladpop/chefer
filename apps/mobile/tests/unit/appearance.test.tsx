import { Appearance } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { colorRoles } from '@chefer/tokens';
import { useThemeColors } from '@chefer/ui-mobile';
import { AppearanceRow, AppearanceScreen } from '../../src/features/appearance/appearance-screen';
import {
  applyStoredAppearance,
  getAppearance,
  resetAppearanceStoreForTests,
  setAppearance,
} from '../../src/features/appearance/appearance-store';
import { kv } from '../../src/features/gym/offline/kv';

// Night mode (mobile UX revamp, phase 4): You › Appearance offers Automatic,
// Day and Night. The choice is saved on the phone, applied at once, and
// every colour read through useThemeColors() follows it.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => {
      mockPush(...args);
    },
    canGoBack: () => true,
    back: jest.fn(),
  },
  usePathname: () => '/settings/appearance',
}));

const mockTrack = jest.fn();
jest.mock('../../src/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

const setColorScheme = jest.spyOn(Appearance, 'setColorScheme');

beforeEach(async () => {
  kv.remove('appearance.mode');
  resetAppearanceStoreForTests();
  // Back to Day: NativeWind's scheme is module state shared across tests.
  await act(() => setAppearance('light'));
  kv.remove('appearance.mode');
  resetAppearanceStoreForTests();
  setColorScheme.mockClear();
  mockPush.mockClear();
  mockTrack.mockClear();
});

describe('appearance store', () => {
  it('is Automatic until the person picks', () => {
    expect(getAppearance()).toBe('system');
  });

  it('saves the choice on the phone and survives a restart', () => {
    setAppearance('dark');
    resetAppearanceStoreForTests();
    expect(getAppearance()).toBe('dark');
  });

  it('applies a pinned Night at launch, and leaves Automatic to the phone', () => {
    kv.setString('appearance.mode', 'dark');
    resetAppearanceStoreForTests();
    applyStoredAppearance();
    expect(setColorScheme).toHaveBeenCalledWith('dark');

    setColorScheme.mockClear();
    kv.setString('appearance.mode', 'system');
    resetAppearanceStoreForTests();
    applyStoredAppearance();
    expect(setColorScheme).not.toHaveBeenCalled();
  });

  it('ignores a garbled saved value', () => {
    kv.setString('appearance.mode', 'sepia');
    resetAppearanceStoreForTests();
    expect(getAppearance()).toBe('system');
  });
});

describe('colours follow the scheme', () => {
  it('useThemeColors gives the night values on Night and the day values on Day', async () => {
    const { result } = await renderHook(() => useThemeColors());
    await act(() => setAppearance('dark'));
    expect(result.current.canvas).toBe(colorRoles.canvas.dark);
    await act(() => setAppearance('light'));
    expect(result.current.canvas).toBe(colorRoles.canvas.light);
  });
});

describe('Appearance screen', () => {
  it('ticks the current choice and switches on tap', async () => {
    await render(<AppearanceScreen />);
    expect(screen.getByTestId('appearance-system').props.accessibilityHint).toMatch(/^Selected/);

    await fireEvent.press(screen.getByTestId('appearance-dark'));

    expect(getAppearance()).toBe('dark');
    expect(setColorScheme).toHaveBeenCalledWith('dark');
    expect(mockTrack).toHaveBeenCalledWith('appearance_changed', { mode: 'dark' });
    expect(screen.getByTestId('appearance-dark').props.accessibilityHint).toMatch(/^Selected/);
  });

  it('does nothing when the current choice is tapped again', async () => {
    await render(<AppearanceScreen />);
    await fireEvent.press(screen.getByTestId('appearance-system'));
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('the You row shows the choice and opens the screen', async () => {
    await act(() => setAppearance('dark'));
    await render(<AppearanceRow />);
    expect(screen.getByText('Night')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('you-appearance'));
    expect(mockPush).toHaveBeenCalledWith('/settings/appearance');
  });
});
