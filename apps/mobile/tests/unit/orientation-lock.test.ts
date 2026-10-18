// 1.0.2: phones (smallest window side < 600dp) stay portrait, large screens
// rotate — and a binary without expo-screen-orientation must never crash.

import { renderHook } from '@testing-library/react-native';
import {
  applyOrientationLock,
  LARGE_SCREEN_MIN_SIDE_DP,
  resetOrientationLockForTests,
  shouldLockPortrait,
  useOrientationLock,
} from '../../src/lib/orientation-lock';

const mockLock = jest.fn<Promise<void>, unknown[]>();
const mockUnlock = jest.fn<Promise<void>, unknown[]>();
jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT_UP: 3 },
  lockAsync: (...args: unknown[]) => mockLock(...args),
  unlockAsync: (...args: unknown[]) => mockUnlock(...args),
}));

// The window the hook sees (react-native's index re-exports this module).
const mockWindow = { width: 750, height: 1334, scale: 2, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...mockWindow }),
}));

beforeEach(() => {
  resetOrientationLockForTests();
  mockLock.mockReset().mockResolvedValue(undefined);
  mockUnlock.mockReset().mockResolvedValue(undefined);
});

describe('shouldLockPortrait', () => {
  it('uses the Android large-screen boundary', () => {
    expect(LARGE_SCREEN_MIN_SIDE_DP).toBe(600);
  });

  it.each([
    ['small phone portrait', 320, 568, true],
    ['Pixel 8 portrait', 412, 915, true],
    ['Pixel 8 landscape (same device, rotated)', 915, 412, true],
    ['largest iPhone', 440, 956, true],
    ['folded foldable', 360, 800, true],
    ['just under the boundary', 599, 900, true],
    ['exactly 600dp', 600, 960, false],
    ['unfolded foldable', 673, 841, false],
    ['10" tablet portrait', 800, 1280, false],
    ['10" tablet landscape', 1280, 800, false],
    ['freeform window resized narrow on a tablet', 500, 900, true],
  ])('%s (%i×%i) → lock %s', (_label, width, height, expected) => {
    expect(shouldLockPortrait({ width, height })).toBe(expected);
  });
});

describe('applyOrientationLock', () => {
  it('locks phones to portrait-up and unlocks large screens, once per change', async () => {
    await applyOrientationLock(true);
    await applyOrientationLock(true);
    expect(mockLock).toHaveBeenCalledTimes(1);
    expect(mockLock).toHaveBeenCalledWith(3);

    await applyOrientationLock(false);
    expect(mockUnlock).toHaveBeenCalledTimes(1);
    await applyOrientationLock(true);
    expect(mockLock).toHaveBeenCalledTimes(2);
  });

  it('never rejects when the native call fails, and retries next time', async () => {
    mockLock.mockRejectedValueOnce(new Error('unsupported'));
    await expect(applyOrientationLock(true)).resolves.toBeUndefined();
    await applyOrientationLock(true);
    expect(mockLock).toHaveBeenCalledTimes(2);
  });
});

describe('useOrientationLock', () => {
  it('follows the window: a foldable unfolding unlocks, folding locks again', async () => {
    const size = mockWindow;
    Object.assign(size, { width: 360, height: 800 });
    const hook = await renderHook(() => useOrientationLock());
    expect(mockLock).toHaveBeenCalledTimes(1);

    Object.assign(size, { width: 673, height: 841 });
    await hook.rerender(undefined);
    expect(mockUnlock).toHaveBeenCalledTimes(1);

    // Rotating the unfolded device changes nothing.
    Object.assign(size, { width: 841, height: 673 });
    await hook.rerender(undefined);
    expect(mockUnlock).toHaveBeenCalledTimes(1);

    Object.assign(size, { width: 360, height: 800 });
    await hook.rerender(undefined);
    expect(mockLock).toHaveBeenCalledTimes(2);
  });
});

describe('a binary without expo-screen-orientation', () => {
  it('loads and applies without crashing — there is simply no lock', async () => {
    // Last test in the file: it resets the module registry.
    jest.resetModules();
    jest.doMock('expo-screen-orientation', () => {
      throw new Error("Cannot find native module 'ExpoScreenOrientation'");
    });
    const mod =
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh copy under the failing mock
      require('../../src/lib/orientation-lock') as typeof import('../../src/lib/orientation-lock');
    expect(() => mod.applyInitialOrientationLock()).not.toThrow();
    await expect(mod.applyOrientationLock(true)).resolves.toBeUndefined();
    expect(mockLock).not.toHaveBeenCalled();
  });
});
