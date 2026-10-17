import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import GymSettingsRoute from '../../app/gym/settings';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { resetGymOwnerForTests } from '../../src/features/gym/offline/owner';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import {
  equipmentSummary,
  sessionLengthValue,
  trainingDaysSummary,
} from '../../src/features/shell/train/training-settings-summary';
import { makeBootstrap, makeDoc, profile } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// 10 Oct redesign — `/gym/settings` in the new shell ("Training settings").
// Same trpc fake as the legacy gym-settings test (lazy require: the screen
// imports `src/lib/trpc` before this file's own import of the mock runs).
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});

const mockParams: { current: Record<string, string> } = { current: {} };
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams.current,
  router: {
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: (href: unknown) => {
      mockPush(href);
    },
  },
}));

const mockShellV2 = { current: true };
jest.mock('../../src/features/shell/shell-store', () => ({
  useShellV2: () => mockShellV2.current,
}));

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function makeClient(bootstrap = makeBootstrap()) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  client.setQueryData(gymBootstrapQueryKey, bootstrap);
  return client;
}

function renderRoute(section?: string, client = makeClient()) {
  mockParams.current = section ? { section } : {};
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={client}>
        <GymSettingsRoute />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

let mutate: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockShellV2.current = true;
  setKvBackendForTests(createMemoryKvBackend());
  resetGymOwnerForTests();
  outbox.reload();
  mutate = jest.fn();
  trpc.gym.profile.save.useMutation.mockReturnValue(mutationResult({ mutate }));
  trpc.gym.pause.create.useMutation.mockReturnValue(mutationResult());
  trpc.gym.pause.end.useMutation.mockReturnValue(mutationResult());
  trpc.training.getDayKinds.useQuery.mockReturnValue({ data: {}, isLoading: false });
  trpc.training.setDayKinds.useMutation.mockReturnValue(mutationResult());
});

describe('Training settings (new shell) — overview', () => {
  it('renders Basics, Your setup and Data with summaries from the profile', async () => {
    await renderRoute(
      undefined,
      makeClient(
        makeBootstrap({
          profile: {
            ...profile,
            dumbbellsKg: [10, 12.5],
            reminderEnabled: true,
            reminderTime: '07:00',
            sessionLengthMins: 60,
          },
        }),
      ),
    );

    expect(screen.getByRole('header', { name: 'Training settings' })).toBeOnTheScreen();
    expect(screen.getByText('Basics')).toBeOnTheScreen();
    expect(screen.getByText('Your setup')).toBeOnTheScreen();
    expect(screen.getByText('Data')).toBeOnTheScreen();
    expect(screen.getByText('20 kg bar · 7 plates · 2 dumbbells')).toBeOnTheScreen();
    const setup = within(screen.getByTestId('training-settings-setup'));
    expect(setup.getByText('07:00')).toBeOnTheScreen();
    expect(setup.getByText('60 min')).toBeOnTheScreen();
    expect(within(screen.getByTestId('training-settings-data')).getByText('CSV')).toBeOnTheScreen();
    // The legacy screen is not rendered in the new shell.
    expect(screen.queryByTestId('gym-settings-title')).not.toBeOnTheScreen();
  });

  it('a units change calls the same gym.profile.save mutation as the legacy screen', async () => {
    const user = userEvent.setup();
    await renderRoute();
    await user.press(screen.getByTestId('training-settings-unit-lb'));
    expect(mutate).toHaveBeenCalledWith({ unit: 'LB' });
  });

  it('the Workouts a week stepper saves weeklyGoal and stops at its bounds', async () => {
    const user = userEvent.setup();
    await renderRoute();
    expect(screen.getByTestId('training-settings-weekly-goal-value')).toHaveTextContent('3');
    await user.press(screen.getByTestId('training-settings-weekly-goal-inc'));
    expect(mutate).toHaveBeenLastCalledWith({ weeklyGoal: 4 });
    await user.press(screen.getByTestId('training-settings-weekly-goal-dec'));
    expect(mutate).toHaveBeenLastCalledWith({ weeklyGoal: 2 });
  });

  it('the stepper minus is disabled at one workout a week', async () => {
    const user = userEvent.setup();
    await renderRoute(
      undefined,
      makeClient(makeBootstrap({ profile: { ...profile, weeklyGoal: 1 } })),
    );
    await user.press(screen.getByTestId('training-settings-weekly-goal-dec'));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('each setup row opens its section as a pushed page', async () => {
    const user = userEvent.setup();
    await renderRoute();
    await user.press(screen.getByTestId('training-settings-equipment'));
    expect(mockPush).toHaveBeenLastCalledWith('/gym/settings?section=equipment');
    await user.press(screen.getByTestId('training-settings-days'));
    expect(mockPush).toHaveBeenLastCalledWith('/gym/settings?section=days');
    await user.press(screen.getByTestId('training-settings-reminders'));
    expect(mockPush).toHaveBeenLastCalledWith('/gym/settings?section=reminders');
    await user.press(screen.getByTestId('training-settings-session'));
    expect(mockPush).toHaveBeenLastCalledWith('/gym/settings?section=session');
    await user.press(screen.getByTestId('training-settings-pause'));
    expect(mockPush).toHaveBeenLastCalledWith('/gym/settings?section=pause');
    await user.press(screen.getByTestId('training-settings-export'));
    expect(mockPush).toHaveBeenLastCalledWith('/gym/settings?section=export');
  });

  it('a food-only account (no gym profile) gets a Set up training button', async () => {
    const user = userEvent.setup();
    await renderRoute(undefined, makeClient(makeBootstrap({ profile: null })));
    expect(screen.getByTestId('training-settings-empty')).toBeOnTheScreen();
    await user.press(screen.getByTestId('training-settings-setup-cta'));
    expect(mockPush).toHaveBeenLastCalledWith('/gym/setup');
  });

  it('shows parked (needs attention) workouts only when there are some', async () => {
    await renderRoute();
    expect(screen.queryByTestId('training-settings-parked')).not.toBeOnTheScreen();
  });

  it('a parked workout can be retried from the overview', async () => {
    kv.setJSON(KV_KEYS.outbox, {
      v: 1,
      entries: [
        {
          doc: makeDoc(1, { name: 'Upper A' }),
          ownerId: null,
          enqueuedAt: '2026-09-20T00:00:00.000Z',
          attempts: 2,
          lastError: 'Bad request',
          lastAttemptAt: '2026-09-20T00:00:00.000Z',
          parkedReason: 'rejected: invalid data',
        },
      ],
      lastSyncAt: '2026-09-19T00:00:00.000Z',
      failures: 0,
      nextAttemptAt: null,
      lastError: null,
    });
    outbox.reload();
    const docId = makeDoc(1).id;
    const user = userEvent.setup();
    await renderRoute();

    expect(screen.getByText('Needs attention')).toBeOnTheScreen();
    await user.press(screen.getByTestId(`training-settings-parked-${docId}-retry`));
    expect(screen.queryByTestId(`training-settings-parked-${docId}`)).not.toBeOnTheScreen();
  });
});

describe('Training settings (new shell) — ?section= deep links', () => {
  it('units lands on the overview (the Basics card holds the units)', async () => {
    await renderRoute('units');
    expect(screen.getByTestId('training-settings-basics')).toBeOnTheScreen();
    expect(screen.getByTestId('training-settings-unit')).toBeOnTheScreen();
  });

  it('reminders opens only the reminders controls, titled Reminders', async () => {
    await renderRoute('reminders');
    expect(screen.getByRole('header', { name: 'Reminders' })).toBeOnTheScreen();
    expect(screen.getByTestId('gym-settings-reminder-toggle')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-settings-quiet-nudge')).toBeOnTheScreen();
    expect(screen.queryByTestId('gym-settings-day-kinds')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('gym-settings-session-length')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('gym-settings-bar-weight')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('training-settings-basics')).not.toBeOnTheScreen();
  });

  it('pause opens the legacy pause card and its sheet', async () => {
    const user = userEvent.setup();
    await renderRoute('pause');
    expect(screen.getByRole('header', { name: 'Pause training' })).toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-settings-pause-start'));
    expect(screen.getByTestId('gym-settings-pause-explainer')).toBeOnTheScreen();
    expect(screen.queryByTestId('gym-settings-reminder-toggle')).not.toBeOnTheScreen();
  });

  it('export opens the legacy export card', async () => {
    await renderRoute('export');
    expect(screen.getByRole('header', { name: 'Export workouts' })).toBeOnTheScreen();
    expect(screen.getByTestId('gym-settings-export-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('gym-settings-pause-start')).not.toBeOnTheScreen();
  });

  it('equipment opens the legacy equipment editor', async () => {
    await renderRoute('equipment');
    expect(screen.getByRole('header', { name: 'Equipment' })).toBeOnTheScreen();
    expect(screen.getByTestId('gym-settings-bar-weight')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-settings-plates')).toBeOnTheScreen();
    expect(screen.queryByTestId('gym-settings-reminder-toggle')).not.toBeOnTheScreen();
  });

  it('days opens the weekday kinds', async () => {
    await renderRoute('days');
    expect(screen.getByRole('header', { name: 'Training days' })).toBeOnTheScreen();
    expect(screen.getByTestId('gym-settings-day-kinds')).toBeOnTheScreen();
    expect(screen.queryByTestId('gym-settings-reminder-toggle')).not.toBeOnTheScreen();
  });

  it('session opens the session length chips', async () => {
    await renderRoute('session');
    expect(screen.getByRole('header', { name: 'Session length' })).toBeOnTheScreen();
    expect(screen.getByTestId('gym-settings-session-length')).toBeOnTheScreen();
    expect(screen.queryByTestId('gym-settings-day-kinds')).not.toBeOnTheScreen();
  });

  it('an unknown section lands on the overview', async () => {
    await renderRoute('nope');
    expect(screen.getByTestId('training-settings-basics')).toBeOnTheScreen();
  });

  it('the old shell still renders the legacy Gym settings screen', async () => {
    mockShellV2.current = false;
    await renderRoute('reminders');
    expect(screen.getByTestId('gym-settings-title')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-settings-unit')).toBeOnTheScreen();
    expect(screen.queryByTestId('training-settings-basics')).not.toBeOnTheScreen();
  });
});

describe('Training settings summaries', () => {
  it('equipment summary leaves out empty lists and follows the unit', () => {
    expect(equipmentSummary({ ...profile, platePairsKg: [], dumbbellsKg: [] })).toBe('20 kg bar');
    expect(equipmentSummary({ ...profile, platePairsKg: [20], dumbbellsKg: [10] })).toBe(
      '20 kg bar · 1 plate · 1 dumbbell',
    );
  });

  it('training days list lift days, then planned runs', () => {
    expect(trainingDaysSummary(new Set([0, 2, 5, 6]), { '1': 'run', '3': 'rest' })).toBe(
      'Mon Wed Sat Sun · run Tue',
    );
    expect(trainingDaysSummary(new Set(), {})).toBe('Not set');
  });

  it('session length reads like the legacy chips', () => {
    expect(sessionLengthValue(60)).toBe('60 min');
    expect(sessionLengthValue(75)).toBe('75+ min');
    expect(sessionLengthValue(null)).toBe('Not set');
  });
});
