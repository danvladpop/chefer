import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { COACHING_COPY, type InvitePreviewDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import CoachingJoinRoute from '../../app/coaching/join/[code]';
import {
  getReturnAfterSignIn,
  readPendingJoin,
  setReturnAfterSignIn,
} from '../../src/features/coaching/pending-join';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { kv } from '../../src/features/gym/offline/kv';
import { makeQueryClient, renderWithTrpc, trpcError } from './friends-core-harness';
import { settle } from './trainer-fixtures';

// WP-18 lane D: the join screen (spec §2.3) — every invite state has copy, the consent screen renders the
// shared COACHING_COPY, joining and switching, gym setup first, and signed-out visitors.

let mockToken: string | null = 'token';
let mockCode = 'ABCD234567';
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ code: mockCode }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/lib/auth-store', () => ({
  ...jest.requireActual<typeof import('../../src/lib/auth-store')>('../../src/lib/auth-store'),
  getToken: () => mockToken,
  subscribe: () => () => undefined,
}));

const { router } = jest.requireMock<{
  router: { push: jest.Mock; replace: jest.Mock; back: jest.Mock };
}>('expo-router');

function preview(overrides: Partial<InvitePreviewDto> = {}): InvitePreviewDto {
  return {
    state: 'OK',
    trainerName: 'Ana',
    currentTrainerName: null,
    needsGymSetup: false,
    ...overrides,
  };
}

const STATUS = { trainer: { name: 'Ana', since: '2026-10-04T09:00:00.000Z' }, stopped: null };

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
  mockToken = 'token';
  mockCode = 'ABCD234567';
  kv.remove(KV_KEYS.coachingPendingJoin);
  setReturnAfterSignIn(null);
});
afterEach(() => jest.restoreAllMocks());

describe('join: consent screen', () => {
  it('renders every consent line from the shared copy', async () => {
    await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => preview(),
    });
    await settle();
    const c = COACHING_COPY.consent;
    expect(screen.getByText(c.title('Ana'))).toBeTruthy();
    expect(screen.getByText(c.willSeeHeading('Ana'))).toBeTruthy();
    for (const line of c.willSee) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText(c.canHeading('Ana'))).toBeTruthy();
    for (const line of c.can('Ana')) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText(c.privateNotes('Ana'))).toBeTruthy();
    expect(screen.getByText(c.neverHeading('Ana'))).toBeTruthy();
    expect(screen.getByText(c.never)).toBeTruthy();
    expect(screen.getByText(c.oneTrainer('Ana'))).toBeTruthy();
    expect(screen.getByText('Allow and join')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
    expect(screen.queryByTestId('coaching-switch-line')).toBeNull();
  });

  it('Allow and join sends the code, then lands on "You’re coached by Ana"', async () => {
    const user = userEvent.setup();
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    let joined: unknown = null;
    const queryClient = makeQueryClient();
    const statusKey = [['coaching', 'status'], { type: 'query' }];
    const bootstrapKey = [['gym', 'bootstrap'], { type: 'query' }];
    queryClient.setQueryData(statusKey, { trainer: null, stopped: null });
    queryClient.setQueryData(bootstrapKey, { coaching: null });
    await renderWithTrpc(
      <CoachingJoinRoute />,
      {
        'coaching.previewInvite': () => preview(),
        'coaching.join': (input) => {
          joined = input;
          return STATUS;
        },
      },
      queryClient,
    );
    await settle();
    await user.press(screen.getByTestId('coaching-consent-allow'));
    await settle();
    expect(joined).toEqual({ code: 'ABCD234567' });
    expect(screen.getByTestId('coaching-joined-title')).toHaveTextContent('You’re coached by Ana');
    expect(readPendingJoin()).toBeNull();
    // The client's own caches refresh: status and the bootstrap that carries the trainer's name.
    expect(queryClient.getQueryState(statusKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(bootstrapKey)?.isInvalidated).toBe(true);

    await user.press(screen.getByTestId('coaching-joined-routine'));
    expect(router.replace).toHaveBeenCalledWith('/routine');
    await user.press(screen.getByTestId('coaching-joined-your-trainer'));
    expect(router.replace).toHaveBeenCalledWith('/coaching');
  });

  it('already coached: the switch line and "Switch to Ana"', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => preview({ currentTrainerName: 'Ion' }),
      'coaching.join': () => STATUS,
    });
    await settle();
    expect(screen.getByTestId('coaching-switch-line')).toHaveTextContent(
      'You’ll stop being coached by Ion.',
    );
    expect(screen.queryByText('Allow and join')).toBeNull();
    await user.press(screen.getByText('Switch to Ana'));
    await settle();
    expect(screen.getByTestId('coaching-joined-title')).toBeTruthy();
  });

  it('Not now clears the carry-on code and goes back; joining does nothing', async () => {
    const user = userEvent.setup();
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    const r = await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => preview(),
    });
    await settle();
    await user.press(screen.getByTestId('coaching-consent-decline'));
    expect(router.back).toHaveBeenCalled();
    expect(readPendingJoin()).toBeNull();
    expect(r.paths()).not.toContain('coaching.join');
  });

  it('a refused join shows the server’s message in place and stays on the consent screen', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => preview(),
      'coaching.join': () => {
        throw trpcError('BAD_REQUEST', 400, {}, COACHING_COPY.server.clientLimit);
      },
    });
    await settle();
    await user.press(screen.getByTestId('coaching-consent-allow'));
    await settle();
    expect(screen.getByTestId('coaching-consent-error')).toHaveTextContent(
      COACHING_COPY.server.clientLimit,
    );
    expect(screen.queryByTestId('coaching-joined')).toBeNull();
  });

  it('offline: joining is disabled and says why', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => preview(),
      'coaching.join': () => STATUS,
    });
    await settle();
    await act(() => {
      onlineManager.setOnline(false);
    });
    expect(screen.getByTestId('coaching-consent-offline')).toHaveTextContent(
      'Connect to the internet to join.',
    );
    await user.press(screen.getByTestId('coaching-consent-allow'));
    expect(r.paths()).not.toContain('coaching.join');
  });

  it('offline before the preview answers: Retry, not "invalid link"', async () => {
    onlineManager.setOnline(false);
    await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => preview(),
    });
    await settle();
    expect(screen.getByTestId('coaching-join-error-state')).toBeTruthy();
    expect(screen.queryByTestId('coaching-invite-message')).toBeNull();
  });
});

describe('join: every invite state has copy', () => {
  const cases: [InvitePreviewDto['state'], string][] = [
    ['EXPIRED', COACHING_COPY.inviteState.EXPIRED],
    ['USED', COACHING_COPY.inviteState.USED],
    ['REVOKED', COACHING_COPY.inviteState.REVOKED],
    ['NOT_FOUND', COACHING_COPY.inviteState.NOT_FOUND],
    ['SELF', COACHING_COPY.inviteState.SELF],
    ['ALREADY_YOURS', COACHING_COPY.inviteState.ALREADY_YOURS('Ana')],
  ];
  it.each(cases)('%s', async (state, text) => {
    kv.setString(KV_KEYS.coachingPendingJoin, 'ABCD234567');
    await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => preview({ state }),
    });
    await settle();
    expect(screen.getByTestId('coaching-invite-message')).toHaveTextContent(text);
    // No consent screen, no join, and nothing left to carry on.
    expect(screen.queryByTestId('coaching-consent')).toBeNull();
    expect(readPendingJoin()).toBeNull();
  });

  it('a failed preview (flag off answers NOT_FOUND) reads like an unknown code', async () => {
    await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => {
        throw trpcError('NOT_FOUND', 404, {}, 'Not found');
      },
    });
    await settle();
    expect(screen.getByTestId('coaching-invite-message')).toHaveTextContent(
      COACHING_COPY.inviteState.NOT_FOUND,
    );
  });

  it('a server error is not an answer about the code: Retry', async () => {
    const user = userEvent.setup();
    let fail = true;
    await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => {
        if (fail) throw trpcError('INTERNAL_SERVER_ERROR', 500);
        return preview();
      },
    });
    await settle();
    expect(screen.getByTestId('coaching-join-error-state')).toBeTruthy();
    fail = false;
    await user.press(screen.getByTestId('coaching-join-error-state-retry'));
    await settle();
    expect(screen.getByTestId('coaching-consent')).toBeTruthy();
  });
});

describe('join: needs gym setup first', () => {
  it('explains, keeps the code for "Carry on joining", and opens the existing setup', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<CoachingJoinRoute />, {
      'coaching.previewInvite': () => preview({ needsGymSetup: true }),
    });
    await settle();
    expect(screen.getByTestId('coaching-needs-setup-body')).toHaveTextContent(
      COACHING_COPY.consent.needsSetup,
    );
    expect(screen.queryByTestId('coaching-consent-allow')).toBeNull();
    await user.press(screen.getByTestId('coaching-needs-setup-cta'));
    expect(router.push).toHaveBeenCalledWith('/gym/setup');
    expect(readPendingJoin()).toBe('ABCD234567');
    // Setting up must not bounce straight back to the invite (that is only for sign-in).
    expect(getReturnAfterSignIn()).toBeNull();
  });
});

describe('join: signed out', () => {
  it('asks to sign in or register, never calls the API, and remembers the code for the way back', async () => {
    const user = userEvent.setup();
    mockToken = null;
    const r = await renderWithTrpc(<CoachingJoinRoute />, {});
    await settle();
    expect(screen.getByTestId('coaching-join-signed-out')).toBeTruthy();
    expect(r.paths()).toEqual([]);
    expect(readPendingJoin()).toBe('ABCD234567');
    expect(getReturnAfterSignIn()).toBe('ABCD234567');
    await user.press(screen.getByTestId('coaching-join-sign-in'));
    expect(router.push).toHaveBeenCalledWith('/login');
    await user.press(screen.getByTestId('coaching-join-register'));
    expect(router.push).toHaveBeenCalledWith('/register');
  });

  it('a malformed code is not remembered', async () => {
    mockToken = null;
    mockCode = '../../etc';
    await renderWithTrpc(<CoachingJoinRoute />, {});
    await settle();
    await waitFor(() => expect(screen.getByTestId('coaching-join-signed-out')).toBeTruthy());
    expect(readPendingJoin()).toBeNull();
    expect(getReturnAfterSignIn()).toBeNull();
  });
});
