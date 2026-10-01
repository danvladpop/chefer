import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { FRIENDS_COPY, LEGAL_VERSIONS } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import FriendsHomeRoute from '../../app/friends/index';
import { ACTIVATED_SNACKBAR_GAP_MS } from '../../src/features/friends/home/friends-entry';
import { resetRememberedSegment } from '../../src/features/friends/home/home-screen';
import { meDto, renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { homeHandlers, settle } from './friends-home-fixtures';

// F2.1 · the intro (UX §4.1, PRD FR-02, E1): `/friends` for someone who hasn't
// turned Following on. Names prefilled and required, Private preselected, the
// name-rejected message, the Public confirm, the success snackbars, no email.

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    Redirect: () => null,
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void) => {
      useEffect(effect, [effect]);
    },
  };
});
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { router } = jest.requireMock<{
  router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock };
}>('expo-router');
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

const NOT_ACTIVATED = meDto({
  activated: false,
  firstName: 'Dan',
  lastName: 'Pop',
  settings: null,
  counts: { followers: 0, following: 0, pendingRequests: 0, unreadActivity: 0, blocked: 0 },
  badgeCount: 0,
});
const ACTIVATED = meDto({
  counts: { followers: 0, following: 0, pendingRequests: 0, unreadActivity: 0, blocked: 0 },
  badgeCount: 0,
});

/**
 * `friends.me` answers not-activated until `friends.activate` succeeds, like the
 * server. `activate` defaults to a success with `filterHiddenRecipes: 0`.
 */
function introHandlers(overrides: Handlers = {}): Handlers {
  let activated = false;
  const activate = overrides['friends.activate'];
  return homeHandlers(
    {
      'friends.me': () => (activated ? ACTIVATED : NOT_ACTIVATED),
      ...overrides,
      'friends.activate': (input) => {
        const result = activate ? activate(input) : { ...ACTIVATED, filterHiddenRecipes: 0 };
        activated = true;
        return result;
      },
    },
    NOT_ACTIVATED,
  );
}

async function renderIntro(overrides: Handlers = {}) {
  const r = await renderWithTrpc(<FriendsHomeRoute />, introHandlers(overrides));
  await settle();
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  resetRememberedSegment();
  onlineManager.setOnline(true);
  // Android path of the kit Sheet: onExited fires when the Modal unmounts
  // (iOS waits for the native Modal.onDismiss, which the test renderer never sends).
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('the intro', () => {
  it('shows the copy, prefills the names and preselects Private', async () => {
    await renderIntro();
    expect(screen.getByTestId('friends-intro')).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.intro.title)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.intro.body)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.intro.never)).toBeTruthy();
    expect(screen.getByTestId('friends-intro-first-input').props.value).toBe('Dan');
    expect(screen.getByTestId('friends-intro-last-input').props.value).toBe('Pop');
    expect(
      screen.getByTestId('friends-intro-visibility-private').props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(
      screen.getByTestId('friends-intro-visibility-public').props.accessibilityState,
    ).toMatchObject({ checked: false });
    expect(screen.getByText(FRIENDS_COPY.visibility.private)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.visibility.public)).toBeTruthy();
    expect(screen.getByTestId('friends-intro-turn-on')).toBeTruthy();
  });

  it('has exactly two inputs (first and last name) and no email field', async () => {
    await renderIntro();
    // The two name fields are the only text inputs on the screen.
    expect(screen.getAllByDisplayValue(/.*/)).toHaveLength(2);
    expect(screen.queryByLabelText(/e-?mail/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/e-?mail/i)).toBeNull();
  });

  it('requires both names (1–50 chars) and sends nothing while one is empty', async () => {
    const r = await renderIntro({ 'friends.me': () => ({ ...NOT_ACTIVATED, firstName: '' }) });
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-intro-turn-on'));
    expect(screen.getByText(FRIENDS_COPY.intro.firstNameError)).toBeTruthy();
    expect(screen.queryByText(FRIENDS_COPY.intro.lastNameError)).toBeNull();
    expect(r.paths()).not.toContain('friends.activate');

    await user.clear(screen.getByTestId('friends-intro-last-input'));
    await user.press(screen.getByTestId('friends-intro-turn-on'));
    expect(screen.getByText(FRIENDS_COPY.intro.lastNameError)).toBeTruthy();
    expect(r.paths()).not.toContain('friends.activate');
  });

  it('Private: activates with the names, PRIVATE and the privacy version, then shows the home and the snackbar', async () => {
    const activate = jest.fn(() => ({ ...ACTIVATED, filterHiddenRecipes: 0 }));
    const r = await renderIntro({ 'friends.activate': activate });
    const user = userEvent.setup();
    await user.clear(screen.getByTestId('friends-intro-first-input'));
    await user.type(screen.getByTestId('friends-intro-first-input'), '  Daniel ');
    await user.press(screen.getByTestId('friends-intro-turn-on'));
    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
    expect(activate).toHaveBeenCalledWith({
      visibility: 'PRIVATE',
      firstName: 'Daniel',
      lastName: 'Pop',
      documentVersion: LEGAL_VERSIONS.privacy,
    });
    await settle();
    expect(screen.getByTestId('friends-home')).toBeTruthy();
    expect(screen.queryByTestId('friends-intro')).toBeNull();
    expect(track).toHaveBeenCalledWith('friends_activated', { visibility: 'private' });
    expect(r.paths()).toContain('friends.me');
  });

  it('shows the Private success snackbar (and mounts it above the home)', async () => {
    await renderIntro({ 'friends.activate': () => ({ ...ACTIVATED, filterHiddenRecipes: 0 }) });
    await userEvent.setup().press(screen.getByTestId('friends-intro-turn-on'));
    await settle();
    // The Snackbar host lives in renderWithTrpc.
    expect(await screen.findByText(FRIENDS_COPY.activated.private)).toBeTruthy();
  });

  it('queues the filter-hidden line after the first snackbar when recipes were hidden', async () => {
    const delayed: { fn: () => void; ms: number }[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const spy = jest
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((fn: () => void, ms?: number) => {
        if (ms === ACTIVATED_SNACKBAR_GAP_MS) {
          delayed.push({ fn, ms });
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(fn, ms);
      });
    try {
      await renderIntro({ 'friends.activate': () => ({ ...ACTIVATED, filterHiddenRecipes: 2 }) });
      // `setTimeout` is spied on, which user-event would mistake for fake timers.
      const user = userEvent.setup({ advanceTimers: () => undefined });
      await user.press(screen.getByTestId('friends-intro-turn-on'));
      await settle();
      expect(await screen.findByText(FRIENDS_COPY.activated.private)).toBeTruthy();
      expect(screen.queryByText(FRIENDS_COPY.activated.filterHidden(2))).toBeNull();
      expect(delayed).toHaveLength(1);
      await act(() => {
        delayed[0]?.fn();
      });
      expect(await screen.findByText(FRIENDS_COPY.activated.filterHidden(2))).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it('shows the plain name-rejected message under the fields and reports it (no id, no text)', async () => {
    await renderIntro({
      'friends.activate': () => {
        throw trpcError('BAD_REQUEST', 400, { textRejected: 'name' });
      },
    });
    await userEvent.setup().press(screen.getByTestId('friends-intro-turn-on'));
    expect(await screen.findByText(FRIENDS_COPY.intro.nameRejected)).toBeTruthy();
    expect(screen.queryByTestId('friends-intro-error')).toBeNull();
    expect(screen.getByTestId('friends-intro')).toBeTruthy();
    expect(track).toHaveBeenCalledWith('friend_text_rejected', { field: 'name' });
  });

  it('shows the generic error above the footer for any other failure', async () => {
    await renderIntro({
      'friends.activate': () => {
        throw trpcError('INTERNAL_SERVER_ERROR', 500);
      },
    });
    await userEvent.setup().press(screen.getByTestId('friends-intro-turn-on'));
    expect(await screen.findByText(FRIENDS_COPY.intro.error)).toBeTruthy();
    expect(screen.queryByText(FRIENDS_COPY.intro.nameRejected)).toBeNull();
  });

  it('Public: asks the Public confirm first, and activates only after it is confirmed', async () => {
    const activate = jest.fn(() => ({ ...ACTIVATED, filterHiddenRecipes: 0 }));
    await renderIntro({ 'friends.activate': activate });
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-intro-visibility-public'));
    await user.press(screen.getByTestId('friends-intro-turn-on'));
    expect(await screen.findByText(FRIENDS_COPY.public.confirm.title)).toBeTruthy();
    expect(activate).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('friends-intro-public-confirm-confirm'));
    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'PUBLIC' }));
    expect(track).toHaveBeenCalledWith('friends_activated', { visibility: 'public' });
  });

  it('Public: cancelling the confirm stores nothing', async () => {
    const activate = jest.fn();
    await renderIntro({ 'friends.activate': activate });
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-intro-visibility-public'));
    await user.press(screen.getByTestId('friends-intro-turn-on'));
    await user.press(await screen.findByTestId('friends-intro-public-confirm-cancel'));
    await settle();
    expect(activate).not.toHaveBeenCalled();
    expect(screen.getByTestId('friends-intro')).toBeTruthy();
  });

  it('Not now goes back and stores nothing', async () => {
    const activate = jest.fn();
    await renderIntro({ 'friends.activate': activate });
    await userEvent.setup().press(screen.getByTestId('friends-intro-not-now'));
    expect(router.back).toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('disables Turn on while offline', async () => {
    await renderIntro();
    await act(() => {
      onlineManager.setOnline(false);
    });
    expect(screen.getByTestId('friends-intro-turn-on').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});
