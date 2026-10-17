import * as ReactNative from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { readableGutter } from '@chefer/ui-mobile';
import { WorkoutMiniBar } from '../../src/features/shell/workout-mini-bar';

// The active-workout mini bar rides above the new shell's tab bar. On a wide
// window (a 1280 pt tablet) the orange bar sits in the screens' readable
// column instead of running edge to edge; on a phone it keeps its own `px-3`
// and gets no inline padding at all (pixel-identical to before the cap).
// RNTL v14: render / act are async — always await them.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/features/gym/offline/owner', () => ({ getGymOwner: () => null }));
jest.mock('../../src/features/gym/offline/active-session-store', () => ({
  useActiveSessionRecord: () => ({
    ownerId: null,
    pausedAt: null,
    doc: {
      name: 'Full Body B',
      startedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
      exercises: [{ sets: [{ completedAt: null }] }],
    },
  }),
}));

const initialWindow = ReactNative.Dimensions.get('window');

async function mockWindow(width: number, height: number) {
  const window = { width, height, scale: 2, fontScale: 1 };
  await act(() => {
    ReactNative.Dimensions.set({ window, screen: window });
  });
}

/** The inline style of the bar's outer (padding) container, flattened. */
function outerStyle(): ReactNative.ViewStyle {
  const bar = screen.getByTestId('workout-mini-bar');
  // The PressableScale is the bar; its parent chain leads to the Animated.View.
  let node = bar.parent;
  while (node && node.props.style === undefined) node = node.parent;
  return ReactNative.StyleSheet.flatten(node?.props.style ?? {}) as ReactNative.ViewStyle;
}

afterEach(async () => {
  await mockWindow(initialWindow.width, initialWindow.height);
});

describe('WorkoutMiniBar on large screens', () => {
  it('sits in the readable column on a 1280 pt tablet', async () => {
    await mockWindow(1280, 800);
    await render(<WorkoutMiniBar />);
    const gutter = readableGutter(1280);
    expect(gutter).toBeGreaterThan(0);
    const style = outerStyle();
    expect(style.paddingLeft).toBe(gutter + 12);
    expect(style.paddingRight).toBe(gutter + 12);
  });

  it.each([320, 390, 430])('adds no inline padding on a %i pt phone', async (width) => {
    await mockWindow(width, 844);
    await render(<WorkoutMiniBar />);
    const style = outerStyle();
    expect(style.paddingLeft).toBeUndefined();
    expect(style.paddingRight).toBeUndefined();
  });
});
