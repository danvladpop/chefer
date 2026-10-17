import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import TrainerClientRoute from '../../app/trainer/[clientId]/index';
import { NOTE_AUTOSAVE_MS } from '../../src/features/trainer/client/use-private-note';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { adherence, MARIA, settle, trainerHandlers, workout } from './trainer-fixtures';

// WP-18 lane C: one client (spec §2.5): Workouts, Adherence, the private note and Remove client.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ clientId: 'cmaria000000000000000001' }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { router } = jest.requireMock<{ router: { push: jest.Mock; replace: jest.Mock } }>(
  'expo-router',
);

function clientHandlers(overrides = {}) {
  return trainerHandlers({
    'trainer.client.overview': () => ({
      client: { name: 'Maria Pop', since: '2026-09-20T09:00:00.000Z' },
      adherence: adherence(),
      recent: [],
    }),
    'trainer.client.workouts': () => ({ items: [workout()], nextCursor: null }),
    'trainer.client.note': () => null,
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('Workouts tab', () => {
  it('shows date, duration, sets with warm-ups marked, skipped exercises and the last-set effort', async () => {
    await renderWithTrpc(<TrainerClientRoute />, clientHandlers());
    await settle();
    expect(screen.getByTestId('trainer-client-header-title')).toHaveTextContent('Maria Pop');
    expect(screen.getByText('Upper A')).toBeTruthy();
    expect(screen.getByText('Wed 30 Sep · 58 min')).toBeTruthy();
    expect(screen.getByTestId('trainer-workout-w1-bench-sets')).toHaveTextContent(
      '40 kg × 10 (warm-up)  ·  60 kg × 8  ·  60 kg × 7',
    );
    expect(screen.getByText('Last set: 2 in reserve')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
  });

  it('no food, weight or note fields are rendered from a workout (only the workout DTO is read)', async () => {
    const r = await renderWithTrpc(<TrainerClientRoute />, clientHandlers());
    await settle();
    expect(r.paths().filter((p) => p.startsWith('trainer.'))).toEqual(
      expect.arrayContaining(['trainer.client.overview', 'trainer.client.workouts']),
    );
    expect(r.paths().some((p) => /food|meal|body|weight|nutrition/i.test(p))).toBe(false);
  });

  it('pages: Show more fetches the next page with the cursor', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerClientRoute />,
      clientHandlers({
        'trainer.client.workouts': (input: unknown) => {
          const { cursor } = input as { cursor?: string };
          return cursor
            ? {
                items: [workout({ id: 'w2', name: 'Lower B', localDate: '2026-09-27' })],
                nextCursor: null,
              }
            : { items: [workout()], nextCursor: 'c1' };
        },
      }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-workouts-more'));
    await settle();
    expect(screen.getByText('Lower B')).toBeTruthy();
    expect(screen.queryByTestId('trainer-workouts-more')).toBeNull();
    const second = r.calls.filter((c) => c.path === 'trainer.client.workouts')[1]?.input as {
      cursor?: string;
    };
    expect(second.cursor).toBe('c1');
  });

  it('empty state when the client has no workouts yet', async () => {
    await renderWithTrpc(
      <TrainerClientRoute />,
      clientHandlers({ 'trainer.client.workouts': () => ({ items: [], nextCursor: null }) }),
    );
    await settle();
    expect(screen.getByTestId('trainer-workouts-empty')).toBeTruthy();
  });

  it('tapping an exercise opens its recent history', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerClientRoute />,
      clientHandlers({
        'trainer.client.exerciseHistory': () => ({
          exerciseId: 'bench',
          name: 'Barbell Bench Press',
          entries: [
            {
              localDate: '2026-09-23',
              sets: [{ weightKg: 57.5, reps: 8, isWarmup: false, completed: true }],
              lastSetRir: 3,
            },
          ],
        }),
      }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-workout-w1-bench-name'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.client.exerciseHistory')?.input).toEqual({
      clientId: MARIA,
      exerciseId: 'bench',
    });
    expect(screen.getByTestId('trainer-history-2026-09-23')).toHaveTextContent(
      'Wed 23 Sep57.5 kg × 8Last set: 3+ reps in reserve',
    );
  });
});

describe('Adherence tab', () => {
  it('shows 8-week rows and the 14-day strip with trained / missed / paused / rest, without any pause reason', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<TrainerClientRoute />, clientHandlers());
    await settle();
    await user.press(screen.getByTestId('trainer-client-tab-adherence'));
    await settle();
    expect(screen.getByTestId('trainer-adherence-week-2026-09-21')).toHaveAccessibleName(
      'Week of 21 Sep: 1 of 3 sessions, Missed',
    );
    expect(screen.getByTestId('trainer-adherence-day-2026-09-21')).toHaveAccessibleName(
      'Mon 21 Sep: trained',
    );
    // planned, not trained, not paused, not today → missed
    expect(screen.getByTestId('trainer-adherence-day-2026-09-27')).toHaveAccessibleName(
      'Sun 27 Sep: missed',
    );
    expect(screen.getByTestId('trainer-adherence-day-2026-09-25')).toHaveAccessibleName(
      'Fri 25 Sep: paused',
    );
    expect(screen.getByTestId('trainer-adherence-day-2026-09-22')).toHaveAccessibleName(
      'Tue 22 Sep: rest',
    );
    // The last day of the strip is today: planned but not trained yet is not "missed".
    expect(screen.getByTestId('trainer-adherence-day-2026-10-04')).toHaveAccessibleName(
      'Sun 4 Oct: planned today',
    );
    expect(screen.queryByText(/reason|illness|injur/i)).toBeNull();
  });
});

describe('Private notes', () => {
  it('loads the saved note, autosaves after a pause and shows Saved; the text never reaches the UI messages', async () => {
    const r = await renderWithTrpc(
      <TrainerClientRoute />,
      clientHandlers({
        'trainer.client.note': () => ({ body: 'Left knee', updatedAt: '2026-10-01T00:00:00.000Z' }),
        'trainer.client.saveNote': (input: unknown) => ({
          body: (input as { body: string }).body,
          updatedAt: '2026-10-04T00:00:00.000Z',
        }),
      }),
    );
    await settle();
    await fireEvent.press(screen.getByTestId('trainer-client-tab-notes'));
    await settle();
    const input = screen.getByTestId('trainer-notes-input');
    expect(input.props.value).toBe('Left knee');
    expect(
      screen.getByText('Only you can see this. Chefer doesn’t read it, and Maria never sees it.'),
    ).toBeTruthy();

    await fireEvent.changeText(input, 'Left knee, avoid deep squats');
    expect(r.paths()).not.toContain('trainer.client.saveNote');
    // Real timers: the debounce is NOTE_AUTOSAVE_MS.
    await waitFor(() => expect(r.paths()).toContain('trainer.client.saveNote'), {
      timeout: NOTE_AUTOSAVE_MS + 2000,
    });
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.client.saveNote')?.input).toEqual({
      clientId: MARIA,
      body: 'Left knee, avoid deep squats',
    });
    expect(screen.getByTestId('trainer-notes-status')).toHaveTextContent('Saved');
  });

  it('saves on blur straight away and reports a failed save with Retry (no note text in the message)', async () => {
    let fail = true;
    const r = await renderWithTrpc(
      <TrainerClientRoute />,
      clientHandlers({
        'trainer.client.saveNote': (input: unknown) => {
          if (fail) throw trpcError('INTERNAL_SERVER_ERROR', 500, {}, 'secret leaked body');
          return { body: (input as { body: string }).body, updatedAt: '2026-10-04T00:00:00.000Z' };
        },
      }),
    );
    await settle();
    await userEvent.setup().press(screen.getByTestId('trainer-client-tab-notes'));
    await settle();
    const input = screen.getByTestId('trainer-notes-input');
    await fireEvent.changeText(input, 'Prefers mornings');
    await fireEvent(input, 'blur');
    await settle();
    expect(screen.getByTestId('trainer-notes-status')).toHaveTextContent('Could not save yet.');
    expect(screen.queryByText(/secret leaked body/)).toBeNull();
    fail = false;
    await userEvent.setup().press(screen.getByTestId('trainer-notes-retry'));
    await settle();
    expect(screen.getByTestId('trainer-notes-status')).toHaveTextContent('Saved');
    expect(r.calls.filter((c) => c.path === 'trainer.client.saveNote')).toHaveLength(2);
  });
});

describe('Remove client', () => {
  it('confirms, removes, refreshes the list and returns to Clients', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerClientRoute />,
      clientHandlers({ 'trainer.clients.remove': () => ({ ok: true }) }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-client-remove'));
    expect(screen.getByText('Remove Maria?')).toBeTruthy();
    expect(r.paths()).not.toContain('trainer.clients.remove');
    await user.press(screen.getByTestId('trainer-client-remove-confirm-confirm'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.clients.remove')?.input).toEqual({
      clientId: MARIA,
    });
    expect(router.replace).toHaveBeenCalledWith('/trainer');
  });
});

describe('A client who left', () => {
  it('shows "This client isn’t available" (the uniform NOT_FOUND) instead of an error', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerClientRoute />,
      clientHandlers({
        'trainer.client.overview': () => {
          throw trpcError('NOT_FOUND', 404, {}, 'This client isn’t available');
        },
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-client-unavailable')).toBeTruthy();
    expect(screen.getByText('This client isn’t available')).toBeTruthy();
    // The stale list is refreshed so the client disappears from Clients.
    expect(r.paths().filter((p) => p === 'trainer.clients.list').length).toBeGreaterThanOrEqual(2);
    await user.press(screen.getByTestId('trainer-client-unavailable-back'));
    expect(router.replace).toHaveBeenCalledWith('/trainer');
    await waitFor(() => expect(screen.queryByTestId('trainer-client-tabs')).toBeNull());
  });
});
