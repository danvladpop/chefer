import { AppState, type AppStateStatus } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { router, useSegments } from 'expo-router';
import { resetModeForTests, setMode } from '../../src/features/gym/mode-store';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  RELAND_AFTER_MS,
  relandTarget,
  shouldReland,
  useForegroundRelanding,
} from '../../src/features/navigation/foreground-landing';
import { resetLandingCacheForTests } from '../../src/features/navigation/landing-cache';
import { activeDoc } from './gym-workout-helpers';

// UX-PO-10 (T-04.3): after 30 minutes in the background, a foreground re-lands.

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useSegments: jest.fn(),
}));

describe('shouldReland', () => {
  it('needs the app to have been away for at least 30 minutes', () => {
    const left = 1_000_000;
    expect(shouldReland(null, left + RELAND_AFTER_MS)).toBe(false);
    expect(shouldReland(left, left + RELAND_AFTER_MS - 1)).toBe(false);
    expect(shouldReland(left, left + RELAND_AFTER_MS)).toBe(true);
  });
});

describe('relandTarget', () => {
  it('moves a food tab root to Gym Today, and a gym tab root to Food', () => {
    expect(relandTarget(['(food)', 'meal-plan'], 'gym')).toBe('/today');
    expect(relandTarget(['(food)'], 'gym')).toBe('/today');
    expect(relandTarget(['(gym)', 'routine'], 'food')).toBe('/(food)');
  });

  it('stays put on the right surface', () => {
    expect(relandTarget(['(food)'], 'food')).toBeNull();
    expect(relandTarget(['(gym)', 'today'], 'gym')).toBeNull();
  });

  it('never yanks the user out of a flow or a deep screen', () => {
    for (const segments of [
      ['gym', 'workout'],
      ['recipe', '[id]'],
      ['cook', '[id]'],
      ['onboarding'],
      ['legal', '[doc]'],
      [],
    ]) {
      expect(relandTarget(segments, 'gym')).toBeNull();
      expect(relandTarget(segments, 'food')).toBeNull();
    }
  });
});

describe('useForegroundRelanding', () => {
  let emit: (state: AppStateStatus) => void;
  const remove = jest.fn();
  let addListener: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date(2026, 8, 28, 12, 0, 0) });
    setKvBackendForTests(createMemoryKvBackend());
    resetLandingCacheForTests();
    resetModeForTests();
    activeSessionStore.clear();
    addListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      emit = listener;
      return { remove };
    });
    jest.mocked(useSegments).mockReturnValue(['(food)', 'meal-plan'] as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const awayFor = (ms: number) => {
    emit('background');
    jest.setSystemTime(Date.now() + ms);
    emit('active');
  };

  it('re-lands on Gym after 30 minutes away with a workout in progress', async () => {
    await renderHook(() => useForegroundRelanding(true));
    activeSessionStore.set(activeDoc(), null);
    awayFor(RELAND_AFTER_MS);
    expect(router.replace).toHaveBeenCalledWith('/today');
  });

  it('does nothing for a shorter absence', async () => {
    await renderHook(() => useForegroundRelanding(true));
    activeSessionStore.set(activeDoc(), null);
    awayFor(RELAND_AFTER_MS - 60_000);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('ignores a transient "inactive" (a call, Control Centre) as the start of an absence', async () => {
    await renderHook(() => useForegroundRelanding(true));
    activeSessionStore.set(activeDoc(), null);
    emit('inactive');
    jest.setSystemTime(Date.now() + RELAND_AFTER_MS * 2);
    emit('active');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('sends a Gym tab back to Food when Food is the choice and nothing is running', async () => {
    setMode('food');
    jest.mocked(useSegments).mockReturnValue(['(gym)', 'today'] as never);
    await renderHook(() => useForegroundRelanding(true));
    awayFor(RELAND_AFTER_MS);
    expect(router.replace).toHaveBeenCalledWith('/(food)');
  });

  it('does not move someone inside a flow', async () => {
    jest.mocked(useSegments).mockReturnValue(['recipe', '[id]'] as never);
    await renderHook(() => useForegroundRelanding(true));
    activeSessionStore.set(activeDoc(), null);
    awayFor(RELAND_AFTER_MS * 3);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('measures each absence on its own', async () => {
    await renderHook(() => useForegroundRelanding(true));
    activeSessionStore.set(activeDoc(), null);
    awayFor(RELAND_AFTER_MS);
    expect(router.replace).toHaveBeenCalledTimes(1);
    awayFor(60_000);
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it('is inert while signed out, and unsubscribes on unmount', async () => {
    const signedOut = await renderHook(() => useForegroundRelanding(false));
    expect(addListener).not.toHaveBeenCalled();
    await signedOut.unmount();
    const signedIn = await renderHook(() => useForegroundRelanding(true));
    await signedIn.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
