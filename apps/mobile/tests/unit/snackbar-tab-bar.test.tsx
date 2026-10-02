import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { resetSnackbarForTests, Snackbar, useSnackbar } from '@chefer/ui-mobile';
import { SnackbarAwareTabBar } from '../../src/components/snackbar-tab-bar';

// App Review R-11: the layouts' tab bar publishes its measured height so the
// global snackbar rides above it. The stock bar reports through
// BottomTabBarHeightCallbackContext; the wrapper must forward to BOTH the
// original callback (screen padding) and the snackbar.

const mockParentHeight = jest.fn();
let mockReport: (height: number) => void = () => undefined;

jest.mock('expo-router/js-tabs', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't reference imports
  const React = require('react') as typeof import('react');
  const Ctx = React.createContext<unknown>(undefined);
  function BottomTabBar() {
    const cb = React.useContext(Ctx);
    mockReport = (value: number) => {
      if (typeof cb === 'function') Reflect.apply(cb, undefined, [value]);
    };
    return null;
  }
  return { BottomTabBar, BottomTabBarHeightCallbackContext: Ctx };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Show() {
  const { show } = useSnackbar();
  // Fire once on mount.
  useShowOnce(() => show({ message: 'Swapped to Salmon Poke Bowl', actionLabel: 'Undo' }));
  return null;
}

function useShowOnce(fn: () => void) {
  useEffect(fn, []); // eslint-disable-line react-hooks/exhaustive-deps
}

beforeEach(() => {
  resetSnackbarForTests();
  mockParentHeight.mockClear();
});

it('publishes the measured tab bar height to the snackbar and clears it on unmount', async () => {
  const Ctx = jest.requireMock<{
    BottomTabBarHeightCallbackContext: React.Context<((h: number) => void) | undefined>;
  }>('expo-router/js-tabs').BottomTabBarHeightCallbackContext;

  const tree = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Ctx.Provider value={mockParentHeight}>
        <SnackbarAwareTabBar {...({} as BottomTabBarProps)} />
      </Ctx.Provider>
      <Show />
      <Snackbar />
    </SafeAreaProvider>,
  );

  await act(() => {
    mockReport(83);
  });
  expect(mockParentHeight).toHaveBeenCalledWith(83);
  const wrapper = screen.getByTestId('snackbar').parent;
  expect((StyleSheet.flatten(wrapper?.props.style as never) as { bottom?: number }).bottom).toBe(
    91,
  );

  await tree.unmount();
});
