import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { CHECK_IN_COPY, type CurrentCheckInDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import CheckInRoute from '../../app/coaching/check-in';
import TrainerClientRoute from '../../app/trainer/[clientId]/index';
import { CheckInPrompt } from '../../src/features/coaching/check-in/check-in-prompt';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { kv } from '../../src/features/gym/offline/kv';
import { CheckInSettingsCard } from '../../src/features/trainer/home/check-in-settings-card';
import { renderWithTrpc } from './friends-core-harness';
import { adherence, settle, trainerHandlers } from './trainer-fixtures';

// Lane K3: the client's weekly check-in (Today card → the screen → sent) and the trainer's side (the
// answers on the client's page, and the settings card).

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ clientId: 'cmaria000000000000000001' }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>(
  'expo-router',
);

const OPEN: CurrentCheckInDto = {
  periodStart: '2026-10-25',
  trainerName: 'Ana',
  questions: ['ENERGY', 'SLEEP'],
  answered: null,
};
const COACHED = {
  'coaching.availability': () => ({ enabled: true, canBeTrainer: false }),
  'coaching.status': () => ({
    trainer: { name: 'Ana', since: '2026-10-01T09:00:00.000Z' },
    stopped: null,
  }),
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
  kv.remove(KV_KEYS.coachingCheckInLater);
});
afterEach(() => jest.restoreAllMocks());

describe('client: the weekly check-in', () => {
  it('the card shows while open and unanswered; Answer opens the screen; Later hides it today', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<CheckInPrompt />, { ...COACHED, 'coaching.checkIn.current': () => OPEN });
    await settle();
    expect(screen.getByText(CHECK_IN_COPY.client.cardTitle('Ana'))).toBeTruthy();
    await user.press(screen.getByTestId('coaching-check-in-prompt-view'));
    expect(router.push).toHaveBeenCalledWith('/coaching/check-in');
    await user.press(screen.getByTestId('coaching-check-in-prompt-dismiss'));
    expect(screen.queryByTestId('coaching-check-in-prompt')).toBeNull();
    expect(kv.getString(KV_KEYS.coachingCheckInLater)).not.toBeNull();
  });

  it('no trainer: the check-in is never asked for', async () => {
    const r = await renderWithTrpc(<CheckInPrompt />, {
      'coaching.availability': () => ({ enabled: true, canBeTrainer: false }),
      'coaching.status': () => ({ trainer: null, stopped: null }),
    });
    await settle();
    expect(r.paths()).not.toContain('coaching.checkIn.current');
  });

  it('every question answered before Send; the answers and the note go to the open period', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    await renderWithTrpc(<CheckInRoute />, {
      'coaching.checkIn.current': () => OPEN,
      'coaching.checkIn.submit': (input) => {
        sent = input;
        return {
          ...OPEN,
          answered: { submittedAt: '2026-10-25T10:00:00.000Z', answers: {}, note: null },
        };
      },
    });
    await settle();
    expect(screen.getByTestId('check-in-send')).toBeDisabled();
    await user.press(screen.getByTestId('check-in-ENERGY-3'));
    await user.press(screen.getByTestId('check-in-SLEEP-5'));
    await fireEvent.changeText(screen.getByTestId('check-in-note'), '  Long week ');
    await user.press(screen.getByTestId('check-in-send'));
    await settle();
    expect(sent).toMatchObject({
      periodStart: '2026-10-25',
      answers: { ENERGY: 3, SLEEP: 5 },
      note: 'Long week',
    });
    expect(screen.getByText(CHECK_IN_COPY.client.sent('Ana'))).toBeTruthy();
  });

  it('closed: says when the next one opens', async () => {
    await renderWithTrpc(<CheckInRoute />, { 'coaching.checkIn.current': () => null });
    await settle();
    expect(screen.getByText(CHECK_IN_COPY.client.closed)).toBeTruthy();
  });
});

describe('trainer: check-ins', () => {
  it('the client page lists the answers with the note, and says when this week’s is waiting', async () => {
    await renderWithTrpc(
      <TrainerClientRoute />,
      trainerHandlers({
        'trainer.client.overview': () => ({
          client: { name: 'Maria Pop', since: '2026-09-20T09:00:00.000Z' },
          adherence: adherence(),
          recent: [],
        }),
        'trainer.client.workouts': () => ({ items: [], nextCursor: null }),
        'trainer.client.note': () => null,
        'trainer.client.checkIns': () => ({
          enabled: true,
          current: { periodStart: '2026-10-25', answered: false },
          items: [
            {
              periodStart: '2026-10-18',
              submittedAt: '2026-10-18T10:00:00.000Z',
              questions: ['ENERGY', 'SLEEP'],
              answers: { ENERGY: 2, SLEEP: 4 },
              note: 'Tired',
            },
          ],
        }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-check-ins-waiting')).toHaveTextContent(
      CHECK_IN_COPY.trainer.waiting('Maria'),
    );
    expect(screen.getByTestId('trainer-check-in-2026-10-18')).toHaveTextContent(
      /Energy 2\/5 · Sleep 4\/5/,
    );
    expect(screen.getByText('“Tired”')).toBeTruthy();
  });

  it('settings: turn on, pick a day and questions, save', async () => {
    const user = userEvent.setup();
    let saved: unknown = null;
    await renderWithTrpc(<CheckInSettingsCard />, {
      'trainer.checkIns.config': () => ({ enabled: false, day: 6, questions: ['ENERGY'] }),
      'trainer.checkIns.saveConfig': (input) => {
        saved = input;
        return input;
      },
    });
    await settle();
    await fireEvent(screen.getByTestId('trainer-check-in-enabled'), 'valueChange', true);
    await user.press(screen.getByTestId('trainer-check-in-day-0'));
    await user.press(screen.getByTestId('trainer-check-in-q-MOOD'));
    await user.press(screen.getByTestId('trainer-check-in-q-ENERGY'));
    // MOOD is the last question left: it can't be removed.
    await user.press(screen.getByTestId('trainer-check-in-q-MOOD'));
    await user.press(screen.getByTestId('trainer-check-in-q-ENERGY'));
    await user.press(screen.getByTestId('trainer-check-in-save'));
    await settle();
    expect(saved).toEqual({ enabled: true, day: 0, questions: ['MOOD', 'ENERGY'] });
  });
});
