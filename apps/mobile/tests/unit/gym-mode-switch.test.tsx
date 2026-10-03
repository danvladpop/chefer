// Aliased with a `mock`-prefixed name: babel-plugin-jest-hoist only allows a
// jest.mock() factory to close over out-of-scope identifiers named
// `mock*`, so these can be used below without an inline require().
import { useEffect as mockUseEffect, useState as mockUseState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { modeFromSegments, ModeSwitch } from '../../src/features/gym/components/mode-switch';
import {
  getMode,
  hasChosenMode,
  hasPendingGymMode,
  resetModeForTests,
  setMode,
} from '../../src/features/gym/mode-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import {
  resetLandingCacheForTests,
  setCachedHasGymProfile,
  setCachedJobs,
} from '../../src/features/navigation/landing-cache';
import { landingSurfaceSync } from '../../src/features/navigation/use-landing';
import { trpc } from '../../src/lib/trpc';
import { makeBootstrap } from './gym-fixtures';

// The pill is route-derived (bug B-14) — `usePathname` is faked as a tiny
// reactive store (like the real expo-router hook) that tracks the last path
// `router.replace`/`push` was called with, so pressing a segment actually
// re-renders the pill instead of leaving a static stub in place.
jest.mock('expo-router', () => {
  let currentPath = '/';
  const listeners = new Set<() => void>();
  function setPath(path: string) {
    currentPath = path;
    listeners.forEach((listener) => listener());
  }
  return {
    router: {
      replace: jest.fn((href: string) => setPath(href)),
      push: jest.fn((href: string) => setPath(href)),
    },
    usePathname: () => {
      const [path, setLocalPath] = mockUseState(currentPath);
      mockUseEffect(() => {
        const listener = () => setLocalPath(currentPath);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }, []);
      return path;
    },
    // The real hook returns the route SEGMENTS; the group is the first one. Gym
    // tab roots live in `(gym)`, deeper Gym screens under `gym/`, the Food tab
    // roots in `(food)`, and root-level screens (history, profile…) by name.
    useSegments: () => {
      const [path, setLocalPath] = mockUseState(currentPath);
      mockUseEffect(() => {
        const listener = () => setLocalPath(currentPath);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }, []);
      const parts = path.split('/').filter(Boolean);
      const GYM_TABS = ['today', 'routine', 'exercises', 'stats'];
      const FOOD_TABS = ['meal-plan', 'recipes', 'shopping-list', 'more'];
      if (parts[0] && GYM_TABS.includes(parts[0])) return ['(gym)', ...parts];
      if (parts.length === 0) return ['(food)'];
      if (parts[0] && FOOD_TABS.includes(parts[0])) return ['(food)', ...parts];
      return parts;
    },
    __setPathname: setPath,
  };
});

const { router, __setPathname } = jest.requireMock<{
  router: { replace: jest.Mock; push: jest.Mock };
  __setPathname: (path: string) => void;
}>('expo-router');

function renderSwitch(queryClient: QueryClient) {
  // No request is made in these tests: the bootstrap is always pre-cached.
  const client = trpc.createClient({
    links: [httpBatchLink({ url: 'http://127.0.0.1:9/trpc', transformer: superjson })],
  });
  return render(
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ModeSwitch />
      </QueryClientProvider>
    </trpc.Provider>,
  );
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetModeForTests();
  resetLandingCacheForTests();
  router.replace.mockClear();
  router.push.mockClear();
  __setPathname('/');
});

describe('ModeSwitch', () => {
  it('large text: the switch grows with its labels instead of truncating them (WP-04)', async () => {
    await renderSwitch(makeClient());
    const cls = String(screen.getByTestId('mode-switch').props.className);
    expect(cls).toMatch(/\bmin-w-36\b/);
    expect(cls).not.toMatch(/(^|\s)w-36\b/);
  });

  it('switches to Gym Today and persists the mode', async () => {
    const user = userEvent.setup();
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    await renderSwitch(queryClient);

    expect(screen.getByTestId('mode-switch-food')).toBeSelected();
    await user.press(screen.getByTestId('mode-switch-gym'));

    expect(getMode()).toBe('gym');
    expect(router.replace).toHaveBeenCalledWith('/today');
    expect(screen.getByTestId('mode-switch-gym')).toBeSelected();
    await waitFor(() => expect(router.push).not.toHaveBeenCalled());
  });

  it('opens Setup on top of Today when the cached bootstrap has no gym profile', async () => {
    const user = userEvent.setup();
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ profile: null }));
    await renderSwitch(queryClient);

    await user.press(screen.getByTestId('mode-switch-gym'));
    expect(router.replace).toHaveBeenCalledWith('/today');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/gym/setup'));
  });

  it('switches back to the food dashboard', async () => {
    const user = userEvent.setup();
    setMode('gym');
    // The pill is route-derived (bug B-14): pressing an already-selected
    // segment is a no-op (SegmentedControl), so this starts on a Gym route.
    __setPathname('/today');
    await renderSwitch(makeClient());

    await user.press(screen.getByTestId('mode-switch-food'));
    expect(getMode()).toBe('food');
    expect(router.replace).toHaveBeenCalledWith('/(food)');
  });

  // Owner dogfood 2026-09-30 (iPhone): a TRAIN-only account lands on Gym by
  // the jobs default while the stored mode is still the implicit 'food' — so
  // tapping Food must still record the choice, and the choice must win.
  it('Food on a jobs-based Gym landing is recorded as an explicit choice that wins the landing', async () => {
    const user = userEvent.setup();
    setCachedJobs(['TRAIN']);
    setCachedHasGymProfile(true);
    expect(hasChosenMode()).toBe(false);
    expect(landingSurfaceSync()).toBe('gym');

    __setPathname('/today');
    await renderSwitch(makeClient());
    await user.press(screen.getByTestId('mode-switch-food'));

    expect(router.replace).toHaveBeenCalledWith('/(food)');
    expect(hasChosenMode()).toBe(true);
    expect(landingSurfaceSync()).toBe('food');
  });

  // UX-X-11: the mode is persisted only once that side is set up. A food-only
  // user who taps Gym just to look must not reopen on "Set up your training".
  describe('UX-X-11: the Gym choice is persisted only once Gym is set up', () => {
    it('peeking at an un-set-up Gym leaves the persisted choice untouched (lands by jobs)', async () => {
      const user = userEvent.setup();
      setCachedJobs(['PLAN_MEALS']);
      const queryClient = makeClient();
      queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ profile: null }));
      await renderSwitch(queryClient);

      await user.press(screen.getByTestId('mode-switch-gym'));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/gym/setup'));

      expect(hasChosenMode()).toBe(false);
      expect(getMode()).toBe('food');
      expect(landingSurfaceSync()).toBe('food');
    });

    it('keeps an earlier explicit Food choice', async () => {
      const user = userEvent.setup();
      setMode('food');
      const queryClient = makeClient();
      queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ profile: null }));
      await renderSwitch(queryClient);

      await user.press(screen.getByTestId('mode-switch-gym'));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/gym/setup'));

      expect(hasChosenMode()).toBe(true);
      expect(getMode()).toBe('food');
    });

    it('records Gym the moment setup completes (the profile appears)', async () => {
      const user = userEvent.setup();
      const queryClient = makeClient();
      queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ profile: null }));
      await renderSwitch(queryClient);

      await user.press(screen.getByTestId('mode-switch-gym'));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/gym/setup'));
      expect(hasPendingGymMode()).toBe(true);
      expect(hasChosenMode()).toBe(false);

      await act(() => {
        queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
      });
      expect(getMode()).toBe('gym');
      expect(hasChosenMode()).toBe(true);
      expect(hasPendingGymMode()).toBe(false);
    });

    it('switching back to Food drops the pending Gym choice, so setup finishing later does not flip it', async () => {
      const user = userEvent.setup();
      const queryClient = makeClient();
      queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ profile: null }));
      await renderSwitch(queryClient);

      await user.press(screen.getByTestId('mode-switch-gym'));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/gym/setup'));
      await user.press(screen.getByTestId('mode-switch-food'));
      expect(hasPendingGymMode()).toBe(false);

      await act(() => {
        queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
      });
      expect(getMode()).toBe('food');
    });

    it('a set-up Gym is still persisted at once', async () => {
      const user = userEvent.setup();
      const queryClient = makeClient();
      queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
      await renderSwitch(queryClient);

      await user.press(screen.getByTestId('mode-switch-gym'));
      expect(getMode()).toBe('gym');
      expect(hasChosenMode()).toBe(true);
    });
  });

  describe('bug B-14: the pill reflects the route, not the persisted mode', () => {
    it('shows Gym selected on a Gym tab-root route even when the persisted mode is food', async () => {
      setMode('food');
      __setPathname('/routine');
      await renderSwitch(makeClient());

      expect(screen.getByTestId('mode-switch-gym')).toBeSelected();
      expect(screen.getByTestId('mode-switch-food')).not.toBeSelected();
    });

    it('shows Gym selected under a deep /gym/* stack route', async () => {
      setMode('food');
      __setPathname('/gym/settings');
      await renderSwitch(makeClient());

      expect(screen.getByTestId('mode-switch-gym')).toBeSelected();
    });

    it('shows Food selected on a Food route even when the persisted mode is gym', async () => {
      setMode('gym');
      __setPathname('/meal-plan');
      await renderSwitch(makeClient());

      expect(screen.getByTestId('mode-switch-food')).toBeSelected();
    });
  });

  describe('UX-GYM-20: the pill follows the route group, not the pathname', () => {
    it.each(['/today', '/routine', '/exercises', '/stats'])(
      'shows Gym on the Gym tab root %s',
      async (path) => {
        __setPathname(path);
        await renderSwitch(makeClient());
        expect(screen.getByTestId('mode-switch-gym')).toBeSelected();
      },
    );

    it('a Gym screen that passes mode="gym" stays on Gym whatever the route says', async () => {
      __setPathname('/'); // a stale, Food-looking route
      const client = makeClient();
      const trpcClient = trpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:9/trpc', transformer: superjson })],
      });
      await render(
        <trpc.Provider client={trpcClient} queryClient={client}>
          <QueryClientProvider client={client}>
            <ModeSwitch mode="gym" />
          </QueryClientProvider>
        </trpc.Provider>,
      );
      expect(screen.getByTestId('mode-switch-gym')).toBeSelected();
      expect(screen.getByTestId('mode-switch-food')).not.toBeSelected();
    });

    it('modeFromSegments maps the groups', () => {
      expect(modeFromSegments(['(gym)', 'stats'])).toBe('gym');
      expect(modeFromSegments(['gym', 'settings'])).toBe('gym');
      expect(modeFromSegments(['(food)'])).toBe('food');
      expect(modeFromSegments(['history'])).toBe('food');
      expect(modeFromSegments([])).toBe('food');
    });
  });

  describe('settings gear (T-00.9, UX-36 (1))', () => {
    it('opens gym/settings from a Gym route', async () => {
      const user = userEvent.setup();
      __setPathname('/today');
      await renderSwitch(makeClient());

      await user.press(screen.getByTestId('mode-switch-settings'));
      expect(router.push).toHaveBeenCalledWith('/gym/settings');
    });

    it('opens the Settings hub from a Food route', async () => {
      const user = userEvent.setup();
      __setPathname('/');
      await renderSwitch(makeClient());

      await user.press(screen.getByTestId('mode-switch-settings'));
      expect(router.push).toHaveBeenCalledWith('/settings');
    });
  });
});
