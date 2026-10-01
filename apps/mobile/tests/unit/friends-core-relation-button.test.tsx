import { StyleSheet } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import type { FriendUserSummary, Relation } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import {
  RelationButton,
  relationView,
  type RelationButtonProps,
} from '../../src/features/friends/components/relation-button';
import {
  deferred,
  makeQueryClient,
  person,
  renderWithTrpc,
  trpcError,
  type Handlers,
} from './friends-core-harness';

// RelationButton (UX §3.3, MO-08): every state's label, variant and
// accessibility label; the optimistic flip with haptics; the server's relation
// as the truth; rollback (state + cache) with shake, haptics.error and the
// `Retry` snackbar; the confirms; offline.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

const MARIA = person();
const SEARCH_KEY = [['friends', 'search'], { input: { query: 'ma' }, type: 'infinite' }];

function seededClient(p: FriendUserSummary = MARIA) {
  const qc = makeQueryClient();
  qc.setQueryData(SEARCH_KEY, { pages: [{ items: [p], nextCursor: null }], pageParams: [null] });
  return qc;
}

function cachedRelation(qc: ReturnType<typeof makeQueryClient>): Relation | undefined {
  return qc.getQueryData<{ pages: { items: FriendUserSummary[] }[] }>(SEARCH_KEY)?.pages[0]
    ?.items[0]?.relation;
}

function renderButton(
  props: Partial<RelationButtonProps>,
  handlers: Handlers = {},
  qc = seededClient(),
) {
  return renderWithTrpc(
    <RelationButton
      userId={MARIA.id}
      relation="none"
      followsYou={false}
      name="Maria Pop"
      source="search"
      testID="rb"
      {...props}
    />,
    handlers,
    qc,
  );
}

const label = () => screen.getByTestId('rb');

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
});

describe('states (UX §3.3)', () => {
  it.each<[Relation, boolean, string, string, string]>([
    ['none', false, 'Follow', 'default', 'Follow Maria Pop'],
    ['none', true, 'Follow back', 'default', 'Follow Maria Pop back'],
    [
      'requested',
      false,
      'Requested',
      'outline',
      'Requested. Double-tap to cancel your request to Maria Pop',
    ],
    ['following', true, 'Following', 'secondary', 'Following Maria Pop. Double-tap to unfollow'],
    ['self', false, 'Edit sharing', 'outline', 'Edit what followers see'],
  ])('%s (follows you: %s) → %s', async (relation, followsYou, text, variant, a11y) => {
    expect(relationView(relation, followsYou, 'Maria Pop')).toEqual({
      label: text,
      variant,
      a11yLabel: a11y,
    });
    await renderButton({ relation, followsYou });
    expect(label()).toHaveTextContent(text);
    expect(label().props.accessibilityLabel).toBe(a11y);
  });

  it('has a fixed width per size, so a label change never reflows the row', async () => {
    await renderButton({ size: 'sm' });
    expect(StyleSheet.flatten(screen.getByTestId('rb-frame').props.style)).toMatchObject({
      width: 112,
    });
    await renderButton({ size: 'md' });
    expect(StyleSheet.flatten(screen.getByTestId('rb-frame').props.style)).toMatchObject({
      width: 140,
    });
  });

  it('self → Sharing & privacy', async () => {
    await renderButton({ relation: 'self' });
    await userEvent.setup().press(label());
    expect(router.push).toHaveBeenCalledWith('/friends/settings');
  });
});

describe('follow (optimistic, MO-08)', () => {
  it('flips at once with haptics.selection, in the cache too; the server relation settles it', async () => {
    const pending = deferred<{ relation: Relation }>();
    const follow = jest.fn(() => pending.promise);
    const qc = seededClient();
    await renderButton({}, { 'friends.follow': follow }, qc);

    await userEvent.setup().press(label());
    // Unknown visibility → optimistic Requested, before the server answers.
    expect(label()).toHaveTextContent('Requested');
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(cachedRelation(qc)).toBe('requested');
    await waitFor(() => expect(follow).toHaveBeenCalledWith({ userId: MARIA.id }));

    // The profile was public after all: the server's relation is the truth.
    await act(() => {
      pending.resolve({ relation: 'following' });
    });
    await waitFor(() => expect(label()).toHaveTextContent('Following'));
    expect(cachedRelation(qc)).toBe('following');
    expect(track).toHaveBeenCalledWith('friend_follow', { source: 'search', outcome: 'following' });
  });

  it('a known-public profile flips straight to Following', async () => {
    const pending = deferred<{ relation: Relation }>();
    await renderButton({ visibility: 'PUBLIC' }, { 'friends.follow': () => pending.promise });
    await userEvent.setup().press(label());
    expect(label()).toHaveTextContent('Following');
    await act(() => {
      pending.resolve({ relation: 'following' });
    });
  });

  it('a profile that went private meanwhile settles on Requested', async () => {
    await renderButton(
      { visibility: 'PUBLIC' },
      { 'friends.follow': () => ({ relation: 'requested' }) },
    );
    await userEvent.setup().press(label());
    await waitFor(() => expect(label()).toHaveTextContent('Requested'));
  });

  it('rolls back on error: label + cache restored, haptics.error, snackbar with Retry', async () => {
    let attempts = 0;
    const follow = jest.fn(() => {
      attempts += 1;
      if (attempts === 1) throw trpcError('INTERNAL_SERVER_ERROR', 500);
      return { relation: 'requested' };
    });
    const qc = seededClient();
    await renderButton({}, { 'friends.follow': follow }, qc);
    const user = userEvent.setup();

    await user.press(label());
    await waitFor(() => expect(label()).toHaveTextContent('Follow'));
    expect(cachedRelation(qc)).toBe('none');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
    expect(await screen.findByText('Couldn’t update. Try again.')).toBeTruthy();

    await user.press(screen.getByText('Retry'));
    await waitFor(() => expect(label()).toHaveTextContent('Requested'));
    expect(follow).toHaveBeenCalledTimes(2);
    expect(cachedRelation(qc)).toBe('requested');
  });
});

describe('unfollow / cancel request (confirmed)', () => {
  it('Following → `Unfollow Maria?` → unfollow', async () => {
    const unfollow = jest.fn(() => ({ relation: 'none' }));
    const qc = seededClient(person({ relation: 'following', followsYou: true }));
    await renderButton(
      { relation: 'following', followsYou: true },
      { 'friends.unfollow': unfollow },
      qc,
    );
    const user = userEvent.setup();
    await user.press(label());
    expect(screen.getByText('Unfollow Maria?')).toBeTruthy();
    expect(
      screen.getByText('You’ll need to ask again to see their meals and workouts.'),
    ).toBeTruthy();
    expect(unfollow).not.toHaveBeenCalled();

    await user.press(screen.getByTestId('rb-confirm-confirm'));
    await waitFor(() => expect(unfollow).toHaveBeenCalledWith({ userId: MARIA.id }));
    await waitFor(() => expect(label()).toHaveTextContent('Follow back'));
    expect(cachedRelation(qc)).toBe('none');
    expect(track).toHaveBeenCalledWith('friend_unfollowed', { wasMutual: true });
  });

  it('Requested → `Cancel your request?`; Keep request does nothing', async () => {
    const unfollow = jest.fn(() => ({ relation: 'none' }));
    await renderButton({ relation: 'requested' }, { 'friends.unfollow': unfollow });
    const user = userEvent.setup();
    await user.press(label());
    expect(screen.getByText('Cancel your request?')).toBeTruthy();
    await user.press(screen.getByText('Keep request'));
    expect(unfollow).not.toHaveBeenCalled();
    expect(label()).toHaveTextContent('Requested');
  });

  it('Requested → Cancel request → unfollow → Follow', async () => {
    const unfollow = jest.fn(() => ({ relation: 'none' }));
    await renderButton({ relation: 'requested' }, { 'friends.unfollow': unfollow });
    const user = userEvent.setup();
    await user.press(label());
    await user.press(screen.getByText('Cancel request'));
    await waitFor(() => expect(label()).toHaveTextContent('Follow'));
    expect(unfollow).toHaveBeenCalledWith({ userId: MARIA.id });
  });
});

describe('offline', () => {
  it('is disabled with the hint `Needs a connection`', async () => {
    const follow = jest.fn();
    await renderButton({}, { 'friends.follow': follow });
    await act(() => {
      onlineManager.setOnline(false);
    });
    expect(label().props.accessibilityState).toMatchObject({ disabled: true });
    expect(label().props.accessibilityHint).toBe('Needs a connection');
    await userEvent.setup().press(label());
    expect(follow).not.toHaveBeenCalled();
  });
});
