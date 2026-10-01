import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { FRIENDS_COPY } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import FriendsHomeRoute from '../../app/friends/index';
import FriendsSuggestionsRoute from '../../app/friends/suggestions';
import { resetRememberedSegment } from '../../src/features/friends/home/home-screen';
import { suggestionReasonText } from '../../src/features/friends/home/suggestion-row';
import { meDto, renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { homeHandlers, personId, settle, who } from './friends-home-fixtures';

// F2.1 · Suggested for you (UX §5.1, PRD FR-09): the reasons, dismiss (optimistic
// removal, rollback + Retry on failure, analytics with the reason only), following
// keeps the row in place, the empty invite card, and the 30-row See all screen.

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    Redirect: () => null,
    useFocusEffect: (effect: () => void) => {
      useEffect(effect, [effect]);
    },
  };
});
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

const SUGGESTIONS = [
  { ...who(1), reason: 'mutual' as const, mutualCount: 3, reasonName: 'Maria Pop' },
  { ...who(2), reason: 'follows_you' as const, mutualCount: 0, followsYou: true },
  { ...who(3), reason: 'popular' as const, mutualCount: 0 },
];

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  resetRememberedSegment();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

async function renderHome(overrides: Handlers = {}) {
  const r = await renderWithTrpc(<FriendsHomeRoute />, homeHandlers(overrides, meDto()));
  await settle();
  return r;
}

describe('suggestion reasons', () => {
  it.each([
    [{ reason: 'mutual', mutualCount: 1, reasonName: 'Maria Pop' }, 'Followed by Maria Pop'],
    [
      { reason: 'mutual', mutualCount: 3, reasonName: 'Maria Pop' },
      'Followed by Maria Pop and 2 others',
    ],
    [
      { reason: 'mutual', mutualCount: 2, reasonName: 'Maria Pop' },
      'Followed by Maria Pop and 1 other',
    ],
    [{ reason: 'follows_you', mutualCount: 0 }, 'Follows you'],
    [{ reason: 'popular', mutualCount: 0 }, 'Popular on Chefer'],
  ] as const)('%j → %s', (extra, text) => {
    expect(suggestionReasonText({ ...who(1), ...extra })).toBe(text);
  });
});

describe('the home section', () => {
  it('lists the suggestions with their reasons, a dismiss × per row and See all', async () => {
    const suggestions = jest.fn(() => SUGGESTIONS);
    await renderHome({ 'friends.suggestions': suggestions });
    expect(suggestions).toHaveBeenCalledWith({ limit: 5 });
    expect(screen.getByText('Followed by Maria Pop and 2 others')).toBeTruthy();
    expect(screen.getByText('Follows you')).toBeTruthy();
    expect(screen.getByText('Popular on Chefer')).toBeTruthy();
    expect(screen.getByLabelText('Hide suggestion Elena Radu')).toBeTruthy();
    expect(screen.getByTestId('friends-suggestions-see-all')).toBeTruthy();
  });

  it('dismiss removes the row at once, calls dismissSuggestion and reports only the reason', async () => {
    const dismiss = jest.fn(() => ({ ok: true }));
    await renderHome({
      'friends.suggestions': () => SUGGESTIONS,
      'friends.dismissSuggestion': dismiss,
    });
    await userEvent.setup().press(screen.getByTestId(`friends-suggestion-${personId(3)}-dismiss`));
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith({ userId: personId(3) }));
    expect(screen.queryByTestId(`friends-suggestion-${personId(3)}`)).toBeNull();
    expect(screen.getByTestId(`friends-suggestion-${personId(1)}`)).toBeTruthy();
    expect(track).toHaveBeenCalledWith('friend_suggestion_dismissed', { reason: 'popular' });
  });

  it('a failed dismiss puts the row back with Retry', async () => {
    let calls = 0;
    const dismiss = jest.fn(() => {
      calls += 1;
      if (calls === 1) throw trpcError('INTERNAL_SERVER_ERROR', 500);
      return { ok: true };
    });
    await renderHome({
      'friends.suggestions': () => SUGGESTIONS,
      'friends.dismissSuggestion': dismiss,
    });
    const user = userEvent.setup();
    await user.press(screen.getByTestId(`friends-suggestion-${personId(3)}-dismiss`));
    expect(await screen.findByText(FRIENDS_COPY.relation.error)).toBeTruthy();
    expect(screen.getByTestId(`friends-suggestion-${personId(3)}`)).toBeTruthy();
    expect(track).not.toHaveBeenCalled();
    await user.press(screen.getByText(FRIENDS_COPY.relation.errorAction));
    await waitFor(() => expect(dismiss).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByTestId(`friends-suggestion-${personId(3)}`)).toBeNull(),
    );
  });

  it('following keeps the row in place with its new state', async () => {
    const follow = jest.fn(() => ({ relation: 'requested' }));
    await renderHome({ 'friends.suggestions': () => SUGGESTIONS, 'friends.follow': follow });
    await userEvent.setup().press(screen.getByTestId(`friends-suggestion-${personId(3)}-relation`));
    await waitFor(() => expect(follow).toHaveBeenCalledWith({ userId: personId(3) }));
    expect(screen.getByTestId(`friends-suggestion-${personId(3)}`)).toBeTruthy();
    expect(screen.getByTestId(`friends-suggestion-${personId(3)}-relation`)).toHaveTextContent(
      'Requested',
    );
  });

  it('shows the invite card when there are no suggestions', async () => {
    await renderHome();
    expect(screen.getByText('Chefer is better together')).toBeTruthy();
    expect(screen.getByText('Invite someone you cook or train with.')).toBeTruthy();
    expect(screen.getByTestId('friends-invite-card-cta')).toHaveTextContent('Invite someone');
    expect(screen.queryByTestId('friends-suggestions-see-all')).toBeNull();
  });
});

describe('Suggested for you, See all', () => {
  async function renderAll(overrides: Handlers = {}) {
    const r = await renderWithTrpc(<FriendsSuggestionsRoute />, homeHandlers(overrides, meDto()));
    await settle();
    return r;
  }

  it('asks for up to 30 and lists them with the title Suggested for you', async () => {
    const suggestions = jest.fn(() => SUGGESTIONS);
    await renderAll({ 'friends.suggestions': suggestions });
    expect(suggestions).toHaveBeenCalledWith({ limit: 30 });
    expect(screen.getByTestId('friends-suggestions-header-title')).toHaveTextContent(
      'Suggested for you',
    );
    expect(screen.getByTestId(`friends-suggestion-${personId(1)}`)).toBeTruthy();
    expect(screen.getByTestId(`friends-suggestion-${personId(3)}`)).toBeTruthy();
  });

  it('dismisses from the See all screen too', async () => {
    const dismiss = jest.fn(() => ({ ok: true }));
    await renderAll({
      'friends.suggestions': () => SUGGESTIONS,
      'friends.dismissSuggestion': dismiss,
    });
    await userEvent.setup().press(screen.getByTestId(`friends-suggestion-${personId(2)}-dismiss`));
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith({ userId: personId(2) }));
    expect(screen.queryByTestId(`friends-suggestion-${personId(2)}`)).toBeNull();
    expect(track).toHaveBeenCalledWith('friend_suggestion_dismissed', { reason: 'follows_you' });
  });

  it('shows the invite card when there are none', async () => {
    await renderAll();
    expect(screen.getByText('Chefer is better together')).toBeTruthy();
  });

  it('shows a compact error, never the empty state, on failure', async () => {
    await renderAll({
      'friends.suggestions': () => {
        throw new Error('boom');
      },
    });
    expect(screen.getByText('Couldn’t load suggestions.')).toBeTruthy();
    expect(screen.queryByText('Chefer is better together')).toBeNull();
  });
});
