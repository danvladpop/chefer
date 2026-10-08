import { Keyboard } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { GymBootstrap, WorkoutSessionDoc } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { addDaysLocal } from '@chefer/utils';
import { localDate } from '../../src/features/gym/offline/ids';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { LogActivityAction } from '../../src/features/gym/today/log-activity-sheet';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';

// WP-20 "Log an activity": the sheet, its validation, the payload it queues and
// that it works offline like any finished workout.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see gym-today.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() },
  usePathname: () => '/today',
}));

const { trpc: _trpc } =
  jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');
void _trpc;

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

// Wed 7 Oct 2026, local noon — keeps "today" and "yesterday" stable.
const NOW = new Date(2026, 9, 7, 12, 0, 0);

function makeClient(bootstrap: GymBootstrap = makeBootstrap()) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  client.setQueryData(gymBootstrapQueryKey, bootstrap);
  return client;
}

async function renderAction(client: QueryClient, bootstrap: GymBootstrap = makeBootstrap()) {
  const user = userEvent.setup();
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={client}>
        <LogActivityAction bootstrap={bootstrap} />
        <Snackbar />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return user;
}

function queued(): WorkoutSessionDoc[] {
  return outbox.getState().entries.map((e) => e.doc);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  resetSnackbarForTests();
  outbox.reload();
});
afterEach(() => {
  jest.useRealTimers();
  onlineManager.setOnline(true);
});

describe('Log an activity (WP-20)', () => {
  it('the common case is three taps in the sheet — an activity, a duration, Save', async () => {
    const client = makeClient();
    const user = await renderAction(client);
    await user.press(screen.getByTestId('gym-today-log-activity'));
    await waitFor(() => expect(screen.getByTestId('log-activity-form')).toBeOnTheScreen());

    await user.press(screen.getByTestId('log-activity-chip-cycling')); // tap 1
    await user.press(screen.getByTestId('log-activity-duration-chip-45')); // tap 2
    await user.press(screen.getByTestId('log-activity-save')); // tap 3

    await waitFor(() => expect(queued()).toHaveLength(1));
    const [doc] = queued();
    expect(doc).toMatchObject({
      status: 'COMPLETED',
      name: 'Cycling class',
      localDate: localDate(),
      routineId: null,
      routineDayId: null,
    });
    expect(doc?.exercises).toHaveLength(1);
    expect(doc?.exercises[0]?.exerciseId).toBe('spin-class');
    const set = doc?.exercises[0]?.sets[0];
    expect(set).toMatchObject({ durationSec: 2700, weightKg: 0, reps: 0 });
    expect(set).not.toHaveProperty('caloriesKcal');
    expect(set).not.toHaveProperty('intensityRpe');
    await waitFor(() => expect(screen.getByText('Cycling class logged')).toBeOnTheScreen());
    await waitFor(() => expect(screen.queryByTestId('log-activity-form')).toBeNull());
  });

  it('sends yesterday, the typed kcal, the effort and a custom name for Other', async () => {
    const client = makeClient();
    const user = await renderAction(client);
    await user.press(screen.getByTestId('gym-today-log-activity'));
    await waitFor(() => expect(screen.getByTestId('log-activity-form')).toBeOnTheScreen());

    await user.press(screen.getByTestId('log-activity-chip-other'));
    await user.type(screen.getByTestId('log-activity-name'), 'Rock climbing');
    await user.type(screen.getByTestId('log-activity-duration'), '50');
    await user.press(screen.getByTestId('log-activity-date-prev'));
    await user.type(screen.getByTestId('log-activity-kcal'), '400');
    await user.press(screen.getByText('Hard'));
    await user.press(screen.getByTestId('log-activity-save'));

    await waitFor(() => expect(queued()).toHaveLength(1));
    const [doc] = queued();
    expect(doc?.name).toBe('Rock climbing');
    expect(doc?.localDate).toBe(addDaysLocal(localDate(), -1));
    expect(doc?.exercises[0]?.exerciseId).toBe('other-activity');
    expect(doc?.exercises[0]?.sets[0]).toMatchObject({
      durationSec: 3000,
      caloriesKcal: 400,
      intensityRpe: 7,
    });
  });

  it('asks for what is missing in plain words and saves nothing', async () => {
    const client = makeClient();
    const user = await renderAction(client);
    await user.press(screen.getByTestId('gym-today-log-activity'));
    await waitFor(() => expect(screen.getByTestId('log-activity-form')).toBeOnTheScreen());

    await user.press(screen.getByTestId('log-activity-save'));
    expect(screen.getByText('Pick what you did.')).toBeOnTheScreen();
    expect(screen.getByText('Enter how many minutes it lasted.')).toBeOnTheScreen();
    expect(queued()).toHaveLength(0);

    await user.press(screen.getByTestId('log-activity-chip-other'));
    await user.press(screen.getByTestId('log-activity-duration-chip-30'));
    await user.press(screen.getByTestId('log-activity-save'));
    expect(screen.getByText('Name the activity.')).toBeOnTheScreen();
    expect(queued()).toHaveLength(0);

    // Rubbish never reaches the server: no raw Zod/JSON text anywhere.
    expect(screen.queryByText(/ZodError|invalid_type|too_big/)).toBeNull();
  });

  it('rejects more minutes than the set can hold', async () => {
    const client = makeClient();
    const user = await renderAction(client);
    await user.press(screen.getByTestId('gym-today-log-activity'));
    await waitFor(() => expect(screen.getByTestId('log-activity-form')).toBeOnTheScreen());
    await user.press(screen.getByTestId('log-activity-chip-yoga'));
    await user.type(screen.getByTestId('log-activity-duration'), '400');
    await user.press(screen.getByTestId('log-activity-save'));
    expect(screen.getByText(/Up to 180 minutes/)).toBeOnTheScreen();
    expect(queued()).toHaveLength(0);
  });

  it('works offline: queued in the outbox like any finished workout, shown at once', async () => {
    onlineManager.setOnline(false);
    const client = makeClient();
    const user = await renderAction(client);
    await user.press(screen.getByTestId('gym-today-log-activity'));
    await waitFor(() => expect(screen.getByTestId('log-activity-form')).toBeOnTheScreen());
    await user.press(screen.getByTestId('log-activity-chip-pilates'));
    await user.press(screen.getByTestId('log-activity-duration-chip-60'));
    await user.press(screen.getByTestId('log-activity-save'));

    await waitFor(() => expect(queued()).toHaveLength(1));
    // Folded into the cached bootstrap: History / Recent show it, the week counts it.
    const cached = client.getQueryData<GymBootstrap>(gymBootstrapQueryKey);
    expect(cached?.recentSessions[0]?.name).toBe('Pilates class');
    expect(cached?.streak.thisWeekSessions).toBe(1);
    // …and it moved neither the rotation nor any progression.
    expect(cached?.progressions).toEqual([]);
  });

  it('starts a fresh form every time it opens', async () => {
    const client = makeClient();
    const user = await renderAction(client);
    await user.press(screen.getByTestId('gym-today-log-activity'));
    await waitFor(() => expect(screen.getByTestId('log-activity-form')).toBeOnTheScreen());
    await user.press(screen.getByTestId('log-activity-chip-yoga'));
    await user.press(screen.getByTestId('log-activity-sheet-close'));
    await waitFor(() => expect(screen.queryByTestId('log-activity-form')).toBeNull());

    await user.press(screen.getByTestId('gym-today-log-activity'));
    await waitFor(() => expect(screen.getByTestId('log-activity-form')).toBeOnTheScreen());
    expect(screen.getByTestId('log-activity-duration').props.value).toBe('');
    expect(queued()).toHaveLength(0);
  });
});

// Tester feedback 2026-10-04: every field in the form closes the keyboard from
// its own Return / Done key, and so does Save.
describe('Log an activity — keyboard (tester feedback 2026-10-04)', () => {
  let dismiss: jest.SpyInstance;
  beforeEach(() => {
    dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
  });
  afterEach(() => dismiss.mockRestore());

  async function openOther() {
    const user = await renderAction(makeClient());
    await user.press(screen.getByTestId('gym-today-log-activity'));
    await waitFor(() => expect(screen.getByTestId('log-activity-form')).toBeOnTheScreen());
    await user.press(screen.getByTestId('log-activity-chip-other'));
    return user;
  }

  it('the name, duration and kcal fields each read Done and dismiss on submit', async () => {
    await openOther();
    for (const id of ['log-activity-name', 'log-activity-duration', 'log-activity-kcal']) {
      const field = screen.getByTestId(id);
      expect(field.props.returnKeyType).toBe('done');
      dismiss.mockClear();
      await fireEvent(field, 'submitEditing');
      expect(dismiss).toHaveBeenCalledTimes(1);
    }
  });

  it('the number pads carry the iOS Done bar (they have no Return key there)', async () => {
    await openOther();
    for (const id of ['log-activity-duration', 'log-activity-kcal']) {
      expect(screen.getByTestId(id).props.keyboardType).toBe('number-pad');
      expect(screen.getByTestId(id).props.inputAccessoryViewID).toBeTruthy();
    }
    dismiss.mockClear();
    await fireEvent.press(screen.getByTestId('log-activity-numeric-bar'));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('Save closes the keyboard', async () => {
    const user = await openOther();
    await user.type(screen.getByTestId('log-activity-name'), 'Rock climbing');
    await user.type(screen.getByTestId('log-activity-duration'), '50');
    dismiss.mockClear();
    await user.press(screen.getByTestId('log-activity-save'));
    await waitFor(() => expect(queued()).toHaveLength(1));
    expect(dismiss).toHaveBeenCalled();
  });
});
