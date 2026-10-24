import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { COACHING_COPY, type TrainerCardDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import FindTrainerRoute from '../../app/coaching/find';
import YourTrainerRoute from '../../app/coaching/index';
import TrainerCardRoute from '../../app/coaching/trainers/[trainerId]';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { settle } from './trainer-fixtures';

// PRD 2026-10 §4.1 on the client side: Find a trainer (by name, ≥ 2 letters), a trainer's card with
// "Ask to coach me" → the COACHING_SHARING consent → coaching.requestCoaching, every relation, and the
// pending request on Your trainer (Cancel request) or, with neither, the way into Find a trainer.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ trainerId: 'ctrainer-ana' }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(cb, [cb]);
  },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
// Trainer mode M4 (§7.2): a sent request is push's `coaching_request` permission moment.
const mockAskPush = jest.fn((_moment: string) => Promise.resolve(false));
jest.mock('../../src/features/notifications/push/push-permission', () => ({
  askNotificationPermissionAt: (moment: string) => mockAskPush(moment),
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const ON = { 'coaching.availability': () => ({ enabled: true, canBeTrainer: false }) };
const ANA_ID = 'ctrainer-ana';

function card(overrides: Partial<TrainerCardDto> = {}): TrainerCardDto {
  return {
    trainerId: ANA_ID,
    name: 'Ana',
    gymLine: 'Iron Gym, Cluj',
    acceptingClients: true,
    relation: 'NONE',
    currentTrainerName: null,
    pendingRequestTo: null,
    needsGymSetup: false,
    ...overrides,
  };
}

async function typeQuery(text: string) {
  await fireEvent.changeText(screen.getByTestId('coaching-find-search'), text);
  // SearchField waits 250 ms after the last keystroke.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('Find a trainer', () => {
  it('is a labelled search that waits for 2 letters', async () => {
    const r = await renderWithTrpc(<FindTrainerRoute />, {
      ...ON,
      'coaching.findTrainers': () => ({ items: [], nextCursor: null }),
    });
    await settle();
    expect(screen.getByLabelText('Search trainers by name')).toBeTruthy();
    await typeQuery('A');
    expect(screen.getByTestId('coaching-find-too-short')).toHaveTextContent(
      'Type at least 2 letters.',
    );
    expect(r.paths()).not.toContain('coaching.findTrainers');
  });

  it('lists trainers with the badge, gym line and "Not taking new clients"; a row opens the card', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(<FindTrainerRoute />, {
      ...ON,
      'coaching.findTrainers': () => ({
        items: [
          { trainerId: ANA_ID, name: 'Ana', gymLine: 'Iron Gym, Cluj', acceptingClients: true },
          { trainerId: 'cfull', name: 'Ana Full', gymLine: null, acceptingClients: false },
        ],
        nextCursor: null,
      }),
    });
    await settle();
    await typeQuery('Ana');
    expect(r.calls.find((c) => c.path === 'coaching.findTrainers')?.input).toMatchObject({
      query: 'Ana',
    });
    expect(screen.getByLabelText('Ana, Trainer, Iron Gym, Cluj')).toBeTruthy();
    expect(screen.getByTestId('coaching-find-trainer-cfull-not-taking')).toHaveTextContent(
      'Not taking new clients',
    );
    await user.press(screen.getByTestId(`coaching-find-trainer-${ANA_ID}`));
    expect(router.push).toHaveBeenCalledWith(`/coaching/trainers/${ANA_ID}`);
  });

  it('no results says so', async () => {
    await renderWithTrpc(<FindTrainerRoute />, {
      ...ON,
      'coaching.findTrainers': () => ({ items: [], nextCursor: null }),
    });
    await settle();
    await typeQuery('Zed');
    expect(screen.getByTestId('coaching-find-empty')).toHaveTextContent(COACHING_COPY.find.empty);
  });

  it('coaching off: unavailable, and no search is ever made', async () => {
    const r = await renderWithTrpc(<FindTrainerRoute />, {
      'coaching.availability': () => ({ enabled: false, canBeTrainer: false }),
    });
    await settle();
    expect(screen.getByTestId('coaching-find-unavailable')).toBeTruthy();
    expect(r.paths()).toEqual(['coaching.availability']);
  });
});

describe('A trainer’s card', () => {
  it('Ask to coach me → the consent (request wording) → requestCoaching with the device-local day', async () => {
    const user = userEvent.setup();
    let relation: TrainerCardDto['relation'] = 'NONE';
    const r = await renderWithTrpc(<TrainerCardRoute />, {
      ...ON,
      'coaching.trainerCard': () => card({ relation }),
      'coaching.requestCoaching': () => {
        relation = 'REQUESTED';
        return {
          id: 'req1',
          trainer: { id: ANA_ID, name: 'Ana' },
          createdAt: '2026-10-17T09:00:00.000Z',
          expiresAt: '2026-10-31T09:00:00.000Z',
        };
      },
      'coaching.status': () => ({ trainer: null, stopped: null }),
    });
    await settle();
    expect(screen.getByTestId('coaching-trainer-header-title')).toHaveTextContent('Ana');
    expect(screen.getByTestId('coaching-trainer-gym')).toHaveTextContent('Iron Gym, Cluj');
    expect(screen.getByText(COACHING_COPY.find.unverified)).toBeTruthy();

    await user.press(screen.getByTestId('coaching-trainer-ask'));
    expect(screen.getByTestId('coaching-consent-title')).toHaveTextContent('Ask Ana to coach you?');
    for (const line of COACHING_COPY.consent.willSee) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByTestId('coaching-consent-no-follow')).toHaveTextContent(
      COACHING_COPY.request.noFollow,
    );
    expect(screen.queryByTestId('coaching-switch-line')).toBeNull();
    expect(r.paths()).not.toContain('coaching.requestCoaching');
    expect(mockAskPush).not.toHaveBeenCalled();

    await user.press(screen.getByTestId('coaching-consent-allow'));
    await settle();
    expect(mockAskPush).toHaveBeenCalledWith('coaching_request');
    const input = r.calls.find((c) => c.path === 'coaching.requestCoaching')?.input as {
      trainerId: string;
      localDate: string;
    };
    expect(input.trainerId).toBe(ANA_ID);
    expect(input.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByTestId('coaching-trainer-pending')).toHaveTextContent(
      'Waiting for Ana to answer',
    );
  });

  it('asking while coached by someone else names who it ends', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<TrainerCardRoute />, {
      ...ON,
      'coaching.trainerCard': () => card({ currentTrainerName: 'Mihai' }),
    });
    await settle();
    await user.press(screen.getByTestId('coaching-trainer-ask'));
    expect(screen.getByTestId('coaching-switch-line')).toHaveTextContent(
      'This ends your coaching with Mihai when Ana accepts.',
    );
    expect(screen.getByTestId('coaching-consent-allow')).toHaveTextContent(
      'Allow and send request',
    );
  });

  it.each([
    [card({ relation: 'YOUR_TRAINER' }), 'coaching-trainer-yours', 'Ana is your trainer.'],
    [card({ acceptingClients: false }), 'coaching-trainer-not-taking', 'Not taking new clients'],
    [
      card({ pendingRequestTo: 'Mihai' }),
      'coaching-trainer-other-pending',
      'You already asked Mihai. Cancel that request first.',
    ],
    [card({ needsGymSetup: true }), 'coaching-trainer-needs-setup', /Set up your training first/],
  ])('relation %#: no "Ask to coach me", the right line instead', async (data, testID, text) => {
    await renderWithTrpc(<TrainerCardRoute />, { ...ON, 'coaching.trainerCard': () => data });
    await settle();
    expect(screen.getByTestId(testID)).toHaveTextContent(text);
    expect(screen.queryByTestId('coaching-trainer-ask')).toBeNull();
  });

  it('REQUESTED: Cancel request calls coaching.cancelRequest', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(<TrainerCardRoute />, {
      ...ON,
      'coaching.trainerCard': () => card({ relation: 'REQUESTED' }),
      'coaching.cancelRequest': () => ({ ok: true }),
    });
    await settle();
    await user.press(screen.getByTestId('coaching-trainer-cancel'));
    await settle();
    expect(r.paths()).toContain('coaching.cancelRequest');
  });

  it('NOT_FOUND: "This trainer isn’t available"', async () => {
    await renderWithTrpc(<TrainerCardRoute />, {
      ...ON,
      'coaching.trainerCard': () => {
        throw trpcError('NOT_FOUND', 404, {}, 'This trainer isn’t available');
      },
    });
    await settle();
    expect(screen.getByText('This trainer isn’t available')).toBeTruthy();
    expect(screen.queryByTestId('coaching-trainer-ask')).toBeNull();
  });
});

describe('Your trainer: requests and Find a trainer', () => {
  it('no trainer, nothing pending: Find a trainer', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<YourTrainerRoute />, {
      ...ON,
      'coaching.status': () => ({ trainer: null, stopped: null, request: null }),
    });
    await settle();
    expect(screen.getByText(COACHING_COPY.find.entryHint)).toBeTruthy();
    await user.press(screen.getByTestId('your-trainer-find-open'));
    expect(router.push).toHaveBeenCalledWith('/coaching/find');
  });

  it('a pending request shows who and until when, and Cancel request', async () => {
    const user = userEvent.setup();
    let pending = true;
    const r = await renderWithTrpc(<YourTrainerRoute />, {
      ...ON,
      'coaching.status': () => ({
        trainer: null,
        stopped: null,
        request: pending
          ? {
              id: 'req1',
              trainer: { id: ANA_ID, name: 'Ana' },
              createdAt: '2026-10-17T09:00:00.000Z',
              expiresAt: '2026-10-31T09:00:00.000Z',
            }
          : null,
      }),
      'coaching.cancelRequest': () => {
        pending = false;
        return { ok: true };
      },
    });
    await settle();
    expect(screen.getByTestId('your-trainer-request')).toHaveTextContent(
      /Waiting for Ana to answer.*Expires 31 Oct/,
    );
    expect(screen.queryByTestId('your-trainer-find')).toBeNull();
    await user.press(screen.getByTestId('your-trainer-request-cancel'));
    await settle();
    expect(r.paths()).toContain('coaching.cancelRequest');
    expect(screen.queryByTestId('your-trainer-request')).toBeNull();
    expect(screen.getByTestId('your-trainer-find')).toBeTruthy();
  });

  it('a coached client gets no Find a trainer', async () => {
    await renderWithTrpc(<YourTrainerRoute />, {
      ...ON,
      'coaching.status': () => ({
        trainer: { name: 'Ana', since: '2026-10-02T09:00:00.000Z' },
        stopped: null,
      }),
    });
    await settle();
    expect(screen.queryByTestId('your-trainer-find')).toBeNull();
  });
});
