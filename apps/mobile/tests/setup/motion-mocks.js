// Global Jest mocks for the motion stack (P2-1). Reanimated and worklets run
// their official mocks: shared values are plain objects, withTiming/withSpring
// return the target and fire their callback immediately, useAnimatedStyle and
// useAnimatedProps just call the updater — so component logic (exit → onClose,
// reduced-motion branches) is testable without a UI thread.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  // The official mock leaves useReducedMotion out ("ADD ME IF NEEDED").
  // Tests flip it through globalThis.__REDUCED_MOTION__.
  return {
    ...mock,
    useReducedMotion: () => globalThis.__REDUCED_MOTION__ === true,
  };
});

// Every haptic resolves; tests that care assert on the jest.fn()s. A test
// file's own jest.mock('expo-haptics', …) still wins.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
