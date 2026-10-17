import { Linking, Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, userEvent, within } from '@testing-library/react-native';
import type { CoachingNoticeDto, TrainerRequestDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import TrainerClientRoute from '../../app/trainer/[clientId]/index';
import TrainerHomeRoute from '../../app/trainer/index';
import TrainerInviteRoute from '../../app/trainer/invite';
import { trainerFeedbackMailto } from '../../src/features/trainer/components/trainer-feedback-link';
import { qrPath } from '../../src/features/trainer/invite/invite-qr';
import { renderWithTrpc } from './friends-core-harness';
import { adherence, invite, MARIA, settle, trainerHandlers } from './trainer-fixtures';

// PRD 2026-10 §4.1–4.3 on Trainer tools: the trainer's notices from clients, Requests (Accept / Decline),
// the name + "Gym / city" profile, "Turn off" naming the client count first, Send feedback, the invite as a
// QR code, and "End coaching" on a client.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ clientId: 'cmaria000000000000000001' }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

function request(overrides: Partial<TrainerRequestDto> = {}): TrainerRequestDto {
  return {
    id: 'req1',
    client: { id: 'cdan', name: 'Dan Pop' },
    createdAt: '2026-10-10T09:00:00.000Z',
    expiresAt: '2026-10-24T09:00:00.000Z',
    hasTrainer: false,
    ...overrides,
  };
}

function notice(overrides: Partial<CoachingNoticeDto> = {}): CoachingNoticeDto {
  return {
    id: 'n1',
    kind: 'ROUTINE_UPDATED',
    at: '2026-10-12T09:00:00.000Z',
    read: false,
    other: { id: MARIA, name: 'Maria Pop', role: 'CLIENT' },
    changes: [{ kind: 'removed', exercise: 'Barbell Row' }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('Trainer home: notices from clients', () => {
  it('"Maria changed their routine" with what changed; View opens the client and dismisses it', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'coaching.notices': () => [
          notice(),
          // The client's own notices (from a trainer) never show here.
          notice({ id: 'n9', other: { id: 'x', name: 'Ana', role: 'TRAINER' } }),
        ],
        'coaching.dismissNotice': () => ({ ok: true }),
      }),
    );
    await settle();
    const card = within(screen.getByTestId('trainer-notice-n1'));
    expect(card.getByText('Maria Pop changed their routine')).toBeTruthy();
    expect(card.getByText('− Barbell Row')).toBeTruthy();
    expect(screen.queryByTestId('trainer-notice-n9')).toBeNull();
    await user.press(screen.getByTestId('trainer-notice-n1-view'));
    await settle();
    expect(router.push).toHaveBeenCalledWith(`/trainer/${MARIA}`);
    expect(r.calls.find((c) => c.path === 'coaching.dismissNotice')?.input).toEqual({ id: 'n1' });
  });

  it('a client who left, and a new request, read their lines and can be dismissed', async () => {
    const user = userEvent.setup();
    let read = false;
    const r = await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'coaching.notices': () => [
          notice({ id: 'n2', kind: 'COACHING_ENDED', endedBy: 'CLIENT', changes: undefined, read }),
          notice({
            id: 'n3',
            kind: 'REQUEST_RECEIVED',
            other: { id: 'cdan', name: 'Dan Pop', role: 'CLIENT' },
            changes: undefined,
          }),
        ],
        'coaching.dismissNotice': () => {
          read = true;
          return { ok: true };
        },
      }),
    );
    await settle();
    expect(screen.getByText('Maria Pop left. Their routine stays theirs.')).toBeTruthy();
    expect(screen.getByText('Dan Pop asked you to coach them')).toBeTruthy();
    await user.press(screen.getByTestId('trainer-notice-n2-dismiss'));
    await settle();
    expect(r.calls.find((c) => c.path === 'coaching.dismissNotice')?.input).toEqual({ id: 'n2' });
    expect(screen.queryByTestId('trainer-notice-n2')).toBeNull();
  });
});

describe('Trainer home: Requests', () => {
  it('lists requests with the has-a-trainer note; Accept refreshes clients and requests', async () => {
    const user = userEvent.setup();
    let pending = [request({ hasTrainer: true })];
    const r = await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'trainer.requests.list': () => pending,
        'trainer.requests.accept': () => {
          pending = [];
          return { ok: true, clientId: 'cdan' };
        },
      }),
    );
    await settle();
    expect(screen.getByText('Requests')).toBeTruthy();
    expect(screen.getByText('Dan Pop asked you to coach them')).toBeTruthy();
    expect(screen.getByTestId('trainer-request-req1-has-trainer')).toHaveTextContent(
      'Has a trainer now: accepting ends that coaching.',
    );
    const listsBefore = r.paths().filter((p) => p === 'trainer.clients.list').length;
    await user.press(screen.getByTestId('trainer-request-req1-accept'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.requests.accept')?.input).toEqual({
      requestId: 'req1',
    });
    expect(r.paths().filter((p) => p === 'trainer.clients.list').length).toBeGreaterThan(
      listsBefore,
    );
    expect(screen.queryByTestId('trainer-requests')).toBeNull();
  });

  it('Decline sends the request id', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'trainer.requests.list': () => [request()],
        'trainer.requests.decline': () => ({ ok: true }),
      }),
    );
    await settle();
    expect(screen.queryByTestId('trainer-request-req1-has-trainer')).toBeNull();
    await user.press(screen.getByTestId('trainer-request-req1-decline'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.requests.decline')?.input).toEqual({
      requestId: 'req1',
    });
  });

  it('no requests (or an older API): no Requests section', async () => {
    await renderWithTrpc(<TrainerHomeRoute />, trainerHandlers());
    await settle();
    expect(screen.queryByTestId('trainer-requests')).toBeNull();
  });
});

describe('Trainer home: profile, turn off, feedback', () => {
  it('edits the name and gym line; an empty gym line clears it', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'trainer.status': () => ({
          canActivate: true,
          active: true,
          displayName: 'Ana',
          gymLine: 'Iron Gym',
          activeClients: 1,
        }),
        'trainer.updateProfile': () => ({
          canActivate: true,
          active: true,
          displayName: 'Ana',
          gymLine: null,
        }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-profile-gym').props.value).toBe('Iron Gym');
    expect(screen.getByTestId('trainer-profile-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('trainer-profile-gym'), '  ');
    await user.press(screen.getByTestId('trainer-profile-save'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.updateProfile')?.input).toEqual({
      displayName: 'Ana',
      gymLine: null,
    });
  });

  it('"Turn off trainer tools" names the client count first', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'trainer.status': () => ({
          canActivate: true,
          active: true,
          displayName: 'Ana',
          activeClients: 3,
        }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-home-turn-off-body')).toHaveTextContent(
      /^Your 3 clients lose you as their trainer at once and keep their routines\. Every client link ends/,
    );
    await user.press(screen.getByTestId('trainer-home-turn-off'));
    expect(screen.getByTestId('trainer-home-turn-off-confirm-body')).toHaveTextContent(
      /^Your 3 clients lose you/,
    );
  });

  it('Send feedback opens a pre-addressed email', async () => {
    const user = userEvent.setup();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderWithTrpc(<TrainerHomeRoute />, trainerHandlers());
    await settle();
    await user.press(screen.getByTestId('trainer-feedback'));
    expect(open).toHaveBeenCalledWith(trainerFeedbackMailto());
    expect(trainerFeedbackMailto()).toMatch(/^mailto:.+\?subject=Trainer%20tools$/);
  });
});

describe('Invite as a QR code', () => {
  it('an open invite shows its QR in a sheet; a used one offers none', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerInviteRoute />,
      trainerHandlers({
        'trainer.invites.list': () => [
          invite(),
          invite({ code: 'USED000000', state: 'USED', label: 'Ion' }),
        ],
      }),
    );
    await settle();
    expect(screen.queryByTestId('trainer-invite-USED000000-qr')).toBeNull();
    await user.press(screen.getByTestId('trainer-invite-7K2M9Q4XHA-qr'));
    expect(screen.getByText('Scan to join')).toBeTruthy();
    expect(screen.getByLabelText('QR code of the invite')).toBeTruthy();
  });

  it('encodes the invite URL as a square code with a quiet zone', () => {
    const { d, size } = qrPath('https://chefer.app/coaching/join/7K2M9Q4XHA');
    // 43 bytes at level M need version 4 (33 modules), plus 4 modules of quiet zone each side.
    expect(size).toBe(33 + 8);
    expect(d.startsWith('M4 4h1v1h-1z')).toBe(true); // the top-left finder pattern
    expect(qrPath('https://chefer.app/coaching/join/7K2M9Q4XHA').d).toBe(d);
  });
});

describe('Client: End coaching', () => {
  it('the remove control reads "End coaching" and keeps its confirmation', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerClientRoute />,
      trainerHandlers({
        'trainer.client.overview': () => ({
          client: { name: 'Maria Pop', since: '2026-09-20T09:00:00.000Z' },
          adherence: adherence(),
          recent: [],
        }),
        'trainer.client.workouts': () => ({ items: [], nextCursor: null }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-client-remove')).toHaveTextContent('End coaching');
    await user.press(screen.getByTestId('trainer-client-remove'));
    expect(screen.getByText('Remove Maria?')).toBeTruthy();
    expect(screen.getByTestId('trainer-client-remove-confirm-confirm')).toHaveTextContent(
      'End coaching',
    );
  });
});
