import { useState } from 'react';
import { Platform } from 'react-native';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Button, resetSnackbarForTests } from '@chefer/ui-mobile';
import { ReportSheet } from '../../src/features/friends/safety/report-sheet';
import { BlockConfirmSheet } from '../../src/features/friends/safety/safety-confirm-sheets';
import {
  deferred,
  makeQueryClient,
  person,
  renderWithTrpc,
  trpcError,
  type Handlers,
} from './friends-core-harness';

// ReportSheet (UX §11.4, §16.12): ONE tap on a reason submits — no note, no
// second confirm, never a text input — and the report also blocks: once the
// server confirms, the person leaves every cached list, the sheet closes, and
// only after it's gone the snackbar shows and the caller navigates back. On
// error it stays open with `Couldn’t send. Try again.` and nothing is removed.

jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

const MARIA = person({ relation: 'following', followsYou: true });
const FOLLOWING_KEY = [['friends', 'following'], { input: {}, type: 'infinite' }];

function seeded() {
  const qc = makeQueryClient();
  qc.setQueryData(FOLLOWING_KEY, {
    pages: [{ items: [MARIA], nextCursor: null }],
    pageParams: [null],
  });
  return qc;
}

const followingIds = (qc: ReturnType<typeof makeQueryClient>) =>
  qc
    .getQueryData<{ pages: { items: { id: string }[] }[] }>(FOLLOWING_KEY)
    ?.pages[0]?.items.map((p) => p.id);

/** Owns `visible` like a real caller: opens from a trigger, hides on onClose. */
function Host({ recipeId, onReported }: { recipeId?: string; onReported: () => void }) {
  const [visible, setVisible] = useState(true);
  return (
    <>
      <Button testID="reopen" onPress={() => setVisible(true)}>
        Open
      </Button>
      <ReportSheet
        visible={visible}
        person={{ id: MARIA.id, displayName: MARIA.displayName, firstName: MARIA.firstName }}
        {...(recipeId ? { recipeId } : {})}
        onClose={() => setVisible(false)}
        onReported={onReported}
      />
    </>
  );
}

async function renderSheet(handlers: Handlers, extra: { recipeId?: string } = {}) {
  const onReported = jest.fn();
  const qc = seeded();
  const r = await renderWithTrpc(<Host onReported={onReported} {...extra} />, handlers, qc);
  return { r, onReported, qc };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  // Android path of the kit Sheet: onExited fires when the Modal unmounts
  // (iOS waits for the native Modal.onDismiss, which the test renderer never sends).
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('ReportSheet', () => {
  it('shows the five reasons as buttons and never a text input', async () => {
    await renderSheet({});
    expect(screen.getByText('Report Maria')).toBeTruthy();
    expect(
      screen.getByText(
        'Tap a reason. We’ll block Maria straight away, so you won’t see them or their recipes again.',
      ),
    ).toBeTruthy();
    for (const reason of [
      'Offensive name or recipe',
      'Spam or fake account',
      'Harassment',
      'Unsafe or harmful content',
      'Something else',
    ]) {
      const button = screen.getByRole('button', { name: reason });
      expect(button.props.accessibilityHint).toBe('Reports and blocks Maria Pop');
    }
    // No host TextInput anywhere in the rendered tree (Modal content included).
    expect(JSON.stringify(screen.toJSON())).not.toContain('"type":"TextInput"');
    expect(JSON.stringify(screen.toJSON())).toContain('"type":"Modal"');
  });

  it('ONE tap submits (and blocks): no confirm, list cleared, snackbar after exit, back', async () => {
    const pending = deferred<{ ok: true }>();
    const report = jest.fn(() => pending.promise);
    const { onReported, qc } = await renderSheet({ 'friends.report': report });
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Harassment' }));
    await waitFor(() =>
      expect(report).toHaveBeenCalledWith({ userId: MARIA.id, reason: 'HARASSMENT' }),
    );
    // While sending: every reason disabled, the tapped one busy. Nothing removed yet.
    expect(screen.getByRole('button', { name: 'Spam or fake account' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Harassment' }).props.accessibilityState,
    ).toMatchObject({ busy: true });
    expect(followingIds(qc)).toEqual([MARIA.id]);

    pending.resolve({ ok: true });
    await waitFor(() => expect(onReported).toHaveBeenCalledTimes(1));
    expect(report).toHaveBeenCalledTimes(1);
    expect(followingIds(qc)).toEqual([]);
    expect(screen.queryByText('Report Maria')).toBeNull();
    expect(
      await screen.findByText('Reported and blocked. You won’t see Maria or their recipes again.'),
    ).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(track).toHaveBeenCalledWith('friend_reported', {
      target: 'profile',
      reason: 'harassment',
    });
  });

  it('reports a recipe with its id and the recipe title', async () => {
    const report = jest.fn(() => ({ ok: true }));
    await renderSheet({ 'friends.report': report }, { recipeId: 'recipe-1' });
    expect(screen.getByText('Report this recipe')).toBeTruthy();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Spam or fake account' }));
    await waitFor(() =>
      expect(report).toHaveBeenCalledWith({
        userId: MARIA.id,
        reason: 'SPAM',
        recipeId: 'recipe-1',
      }),
    );
  });

  it('on error stays open with `Couldn’t send. Try again.` and blocks nothing', async () => {
    const report = jest.fn(() => {
      throw trpcError('INTERNAL_SERVER_ERROR', 500);
    });
    const { onReported, qc } = await renderSheet({ 'friends.report': report });
    await userEvent.setup().press(screen.getByRole('button', { name: 'Something else' }));
    expect(await screen.findByText('Couldn’t send. Try again.')).toBeTruthy();
    expect(screen.getByText('Report Maria')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Something else' })).not.toBeDisabled();
    expect(onReported).not.toHaveBeenCalled();
    expect(followingIds(qc)).toEqual([MARIA.id]);
  });
});

describe('BlockConfirmSheet', () => {
  it('confirms, blocks, then backs out after the sheet has exited', async () => {
    const block = jest.fn(() => ({ ok: true }));
    const onDone = jest.fn();
    const qc = seeded();
    function BlockHost() {
      const [visible, setVisible] = useState(true);
      return (
        <BlockConfirmSheet
          from="profile"
          visible={visible}
          person={{ id: MARIA.id, firstName: 'Maria' }}
          onClose={() => setVisible(false)}
          onDone={onDone}
        />
      );
    }
    await renderWithTrpc(<BlockHost />, { 'friends.block': block }, qc);
    expect(screen.getByText('Block Maria?')).toBeTruthy();
    await userEvent.setup().press(screen.getByTestId('friends-block-confirm-confirm'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(block).toHaveBeenCalledWith({ userId: MARIA.id });
    expect(followingIds(qc)).toEqual([]);
    expect(await screen.findByText('Maria blocked')).toBeTruthy();
  });
});
