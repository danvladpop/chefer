import { Platform, Share } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import TrainerHomeRoute from '../../app/trainer/index';
import TrainerInviteRoute from '../../app/trainer/invite';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { clientRow, invite, ION, MARIA, settle, trainerHandlers } from './trainer-fixtures';

// WP-18 lane C: the Clients list (spec §2.4) and the invite flow (spec §2.2).

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { router } = jest.requireMock<{ router: { push: jest.Mock; replace: jest.Mock } }>(
  'expo-router',
);

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('Clients list', () => {
  it('empty: "Invite your first client" and the invite button', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({ 'trainer.clients.list': () => [] }),
    );
    await settle();
    expect(screen.getByTestId('trainer-home-empty')).toBeTruthy();
    expect(screen.getByText('Invite your first client')).toBeTruthy();
    await user.press(screen.getByTestId('trainer-home-invite'));
    expect(router.push).toHaveBeenCalledWith('/trainer/invite');
  });

  it('rows: last workout, this week against the goal, label; tap opens the client', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(<TrainerHomeRoute />, trainerHandlers());
    await settle();
    const row = screen.getByTestId(`trainer-client-${MARIA}`);
    expect(row).toHaveAccessibleName(/^Maria Pop\. Last workout Wed 30 Sep\. 2 \/ 3 this week/);
    expect(screen.getByText('Last workout Wed 30 Sep')).toBeTruthy();
    expect(screen.getByText('Maria, Tue/Thu')).toBeTruthy();
    expect(screen.queryByTestId(`trainer-client-${MARIA}-quiet`)).toBeNull();
    expect(screen.queryByTestId(`trainer-client-${MARIA}-changed`)).toBeNull();
    // `today` is the device's date, sent so "this week" matches the trainer's calendar.
    const input = r.calls.find((c) => c.path === 'trainer.clients.list')?.input as {
      today?: string;
    };
    expect(input.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await user.press(row);
    expect(router.push).toHaveBeenCalledWith(`/trainer/${MARIA}`);
  });

  it('flags a client with nothing logged for 7 days and one with no workout yet', async () => {
    await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'trainer.clients.list': () => [
          clientRow({ inactiveDays: 9 }),
          clientRow({
            clientId: ION,
            name: 'Ion Vasile',
            label: null,
            lastWorkoutDate: null,
            inactiveDays: 3,
            week: { sessions: 0, goal: 2 },
          }),
        ],
      }),
    );
    await settle();
    expect(screen.getByTestId(`trainer-client-${MARIA}-quiet`)).toHaveTextContent(
      'Nothing logged for 9 days',
    );
    expect(screen.getByText('No workout yet')).toBeTruthy();
    expect(screen.queryByTestId(`trainer-client-${ION}-quiet`)).toBeNull();
  });

  it('says when the client changed the routine after the trainer did', async () => {
    await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'trainer.clients.list': () => [
          clientRow({ routineChangedByClientAt: '2026-10-03T10:00:00.000Z' }),
        ],
      }),
    );
    await settle();
    expect(screen.getByTestId(`trainer-client-${MARIA}-changed`)).toHaveTextContent(
      'Routine changed by Maria · 3 Oct',
    );
  });

  it('a failed load shows Retry, not an empty list', async () => {
    let fail = true;
    await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'trainer.clients.list': () => {
          if (fail) throw trpcError('INTERNAL_SERVER_ERROR', 500);
          return [clientRow()];
        },
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-home-error')).toBeTruthy();
    expect(screen.queryByTestId('trainer-home-empty')).toBeNull();
    fail = false;
    await userEvent.setup().press(screen.getByText('Try again'));
    await settle();
    await waitFor(() => expect(screen.getByTestId(`trainer-client-${MARIA}`)).toBeTruthy());
  });

  it('Turn off trainer tools confirms, then calls deactivate', async () => {
    const user = userEvent.setup();
    let active = true;
    const r = await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'trainer.status': () => ({ canActivate: true, active, displayName: 'Ana' }),
        'trainer.deactivate': () => {
          active = false;
          return { ok: true };
        },
      }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-home-turn-off'));
    expect(r.paths()).not.toContain('trainer.deactivate');
    await user.press(screen.getByTestId('trainer-home-turn-off-confirm-confirm'));
    await settle();
    expect(r.paths()).toContain('trainer.deactivate');
    // The gate re-reads trainer.status and shows the turn-on card again.
    await waitFor(() => expect(screen.getByTestId('trainer-turn-on')).toBeTruthy());
  });
});

describe('Invite a client', () => {
  it('creates a link with the private label, shows it and shares it', async () => {
    const user = userEvent.setup();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const created = invite({
      code: 'NEW00000AB',
      url: 'https://chefer.app/coaching/join/NEW00000AB',
    });
    let list = [invite()];
    const r = await renderWithTrpc(
      <TrainerInviteRoute />,
      trainerHandlers({
        'trainer.invites.list': () => list,
        'trainer.invites.create': () => {
          list = [created, ...list];
          return created;
        },
      }),
    );
    await settle();
    await user.type(screen.getByTestId('trainer-invite-label'), 'Ion, Mon/Wed');
    await user.press(screen.getByTestId('trainer-invite-create'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.invites.create')?.input).toEqual({
      label: 'Ion, Mon/Wed',
    });
    expect(screen.getByTestId('trainer-invite-created-url')).toHaveTextContent(created.url);
    await user.press(screen.getByTestId('trainer-invite-created-share'));
    expect(share).toHaveBeenCalledWith({ message: created.url });
    // The new invite is not repeated in the list below.
    expect(screen.queryByTestId('trainer-invite-NEW00000AB')).toBeNull();
  });

  it('an empty label sends no label', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerInviteRoute />,
      trainerHandlers({
        'trainer.invites.list': () => [],
        'trainer.invites.create': () => invite({ label: null }),
      }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-invite-create'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.invites.create')?.input).toEqual({});
  });

  it('lists pending invites with label and expiry; Share and Revoke only for open ones', async () => {
    const user = userEvent.setup();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const r = await renderWithTrpc(
      <TrainerInviteRoute />,
      trainerHandlers({
        'trainer.invites.list': () => [
          invite(),
          invite({ code: 'USED000001', label: 'Ion', state: 'USED' }),
        ],
        'trainer.invites.revoke': () => ({ ok: true }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-invite-7K2M9Q4XHA-state')).toHaveTextContent('Waiting');
    expect(screen.getByText('Expires 15 Oct')).toBeTruthy();
    expect(screen.getByTestId('trainer-invite-USED000001-state')).toHaveTextContent('Joined');
    expect(screen.queryByTestId('trainer-invite-USED000001-share')).toBeNull();
    expect(screen.queryByTestId('trainer-invite-USED000001-revoke')).toBeNull();

    await user.press(screen.getByTestId('trainer-invite-7K2M9Q4XHA-share'));
    expect(share).toHaveBeenCalledWith({ message: invite().url });
    await user.press(screen.getByTestId('trainer-invite-7K2M9Q4XHA-revoke'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.invites.revoke')?.input).toEqual({
      code: '7K2M9Q4XHA',
    });
  });

  it('shows the server message when the open-invite limit is reached', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerInviteRoute />,
      trainerHandlers({
        'trainer.invites.list': () => [],
        'trainer.invites.create': () => {
          throw trpcError(
            'BAD_REQUEST',
            400,
            {},
            'You have too many open invites. Revoke one first.',
          );
        },
      }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-invite-create'));
    await settle();
    expect(screen.getByTestId('trainer-invite-error')).toHaveTextContent(
      'You have too many open invites. Revoke one first.',
    );
  });
});
