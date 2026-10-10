import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { TEMPLATE_BY_KEY, type CompleteSetupInput, type TemplateSummaryDto } from '@chefer/types';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { SetupWizard } from '../../src/features/gym/setup/setup-wizard';
import { buildTemplatePreview } from '../../src/features/gym/setup/template-preview';
import { resetShellStoreForTests, setShellV2Preview } from '../../src/features/shell/shell-store';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult, queryResult } from './gym-trpc-mock';

// 10 Oct redesign, board GymSetup: step 5 ("Your program") of gym setup in the
// new shell. Same wizard, same recommend query and completeSetup payload as
// the legacy step (tests/unit/gym-setup.test.tsx), new presentation.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see gym-setup.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  useNavigation: () => ({ dispatch: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
}));

// Walking four wizard steps with userEvent: about 1 s each, but the first
// test also absorbs module warm-up and ran past the default 5 s.
jest.setTimeout(20_000);

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');

function summary(key: string): TemplateSummaryDto {
  const t = TEMPLATE_BY_KEY.get(key);
  if (!t) throw new Error(`unknown template ${key}`);
  return {
    key: t.key,
    name: t.name,
    daysPerWeek: t.daysPerWeek,
    experience: t.experience,
    description: t.description,
  };
}

const RECOMMEND_RESULT = {
  recommendedKey: 'fb3-beginner',
  reason: 'Full Body 3× is the best start.',
  alternatives: [summary('ul3-beginner'), summary('fb2-beginner'), summary('ul4-beginner')],
  preview: { key: 'fb3-beginner', name: 'Full Body 3×', days: [] },
  volume: [],
  hints: [],
};

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function renderWizard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <SetupWizard />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

async function goToProgram(user: ReturnType<typeof userEvent.setup>) {
  await user.press(screen.getByTestId('gym-setup-next')); // 1 → 2
  await user.press(screen.getByTestId('gym-setup-next')); // 2 → 3
  await user.press(screen.getByTestId('gym-setup-next')); // 3 → 4
  await user.press(screen.getByTestId('gym-setup-skip')); // 4 → 5
  await waitFor(() => expect(screen.getByText('Your program')).toBeOnTheScreen());
}

const selectedOf = (key: string) =>
  screen.getByTestId(`gym-setup-program-select-${key}`).props.accessibilityState as {
    selected?: boolean;
  };

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  setShellV2Preview(true);
  trpc.gym.profile.recommend.useQuery.mockReturnValue(queryResult({ data: RECOMMEND_RESULT }));
  trpc.gym.profile.save.useMutation.mockReturnValue(mutationResult());
  trpc.gym.profile.completeSetup.useMutation.mockReturnValue(mutationResult());
});

afterEach(() => {
  resetShellStoreForTests();
  setKvBackendForTests(undefined);
});

describe('Gym setup · Your program (shell v2)', () => {
  it('shows the step dots, the recommended card, the alternatives and one row per day', async () => {
    const user = userEvent.setup();
    await renderWizard();
    await goToProgram(user);

    expect(screen.getByLabelText('Step 5 of 7')).toBeOnTheScreen();
    expect(screen.getByText('You can change it any time.')).toBeOnTheScreen();

    // Recommended: badge, frequency, the reason, selected with a check.
    const rec = screen.getByTestId('gym-setup-program-fb3-beginner');
    expect(within(rec).getByText('Recommended')).toBeOnTheScreen();
    expect(within(rec).getByText('3×')).toBeOnTheScreen();
    expect(within(rec).getByText('Full Body')).toBeOnTheScreen();
    expect(within(rec).getByText('Full Body 3× is the best start.')).toBeOnTheScreen();
    expect(selectedOf('fb3-beginner').selected).toBe(true);
    expect(screen.getByTestId('gym-setup-program-check-fb3-beginner')).toBeOnTheScreen();

    // Or pick another: every alternative with its frequency and a Use button.
    expect(screen.getByText('Or pick another')).toBeOnTheScreen();
    for (const alt of RECOMMEND_RESULT.alternatives) {
      const card = screen.getByTestId(`gym-setup-program-${alt.key}`);
      expect(within(card).getByText(`${String(alt.daysPerWeek)}×`)).toBeOnTheScreen();
      expect(within(card).getByText(alt.description)).toBeOnTheScreen();
      expect(screen.getByTestId(`gym-setup-alt-use-${alt.key}`)).toBeOnTheScreen();
      expect(selectedOf(alt.key).selected).toBe(false);
    }

    // Days: one MediaRow per day with "n exercises · ~m min".
    const preview = buildTemplatePreview('fb3-beginner', 'FULL_GYM', 'BEGINNER');
    expect(screen.getByText('Full Body 3× · days')).toBeOnTheScreen();
    preview.days.forEach((day, i) => {
      const row = screen.getByTestId(`gym-setup-day-row-${String(i)}`);
      expect(within(row).getByText(day.name)).toBeOnTheScreen();
      expect(
        within(row).getByText(
          `${String(day.exercises.length)} exercises · ~${String(day.estimatedMin)} min`,
        ),
      ).toBeOnTheScreen();
    });

    // The legacy layout is not drawn.
    expect(screen.queryByTestId('gym-setup-choose-alt')).toBeNull();
  });

  it('"Use" switches the selection, and the picked program becomes the highlighted one', async () => {
    const user = userEvent.setup();
    await renderWizard();
    await goToProgram(user);

    await user.press(screen.getByTestId('gym-setup-alt-use-ul4-beginner'));

    expect(selectedOf('ul4-beginner').selected).toBe(true);
    expect(screen.getByTestId('gym-setup-program-check-ul4-beginner')).toBeOnTheScreen();
    expect(selectedOf('fb3-beginner').selected).toBe(false);
    // The recommended card keeps its badge and offers "Use" to go back.
    expect(screen.getByTestId('gym-setup-alt-use-fb3-beginner')).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('gym-setup-program-fb3-beginner')).getByText('Recommended'),
    ).toBeOnTheScreen();

    // The days follow the picked program.
    const ul4 = buildTemplatePreview('ul4-beginner', 'FULL_GYM', 'BEGINNER');
    expect(screen.getByText(`${ul4.name} · days`)).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^gym-setup-day-row-/)).toHaveLength(ul4.days.length);

    // Tapping the recommended card selects it again.
    await user.press(screen.getByTestId('gym-setup-program-select-fb3-beginner'));
    expect(selectedOf('fb3-beginner').selected).toBe(true);
    expect(selectedOf('ul4-beginner').selected).toBe(false);
  });

  it("tapping a day row reveals that day's exercises", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await goToProgram(user);

    const day = buildTemplatePreview('fb3-beginner', 'FULL_GYM', 'BEGINNER').days[0];
    if (!day) throw new Error('expected a first day');
    expect(screen.queryByTestId('gym-setup-day-exercises-0')).toBeNull();

    await user.press(
      within(screen.getByTestId('gym-setup-day-row-0')).getByRole('button', {
        name: new RegExp(`^${day.name}`),
      }),
    );

    const list = screen.getByTestId('gym-setup-day-exercises-0');
    for (const ex of day.exercises) {
      expect(within(list).getByText(ex.name)).toBeOnTheScreen();
    }
  });

  it('Next proceeds like legacy and setup submits the picked program', async () => {
    const mutate = jest.fn();
    trpc.gym.profile.completeSetup.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderWizard();
    await goToProgram(user);

    await user.press(screen.getByTestId('gym-setup-alt-use-ul3-beginner'));
    await user.press(screen.getByTestId('gym-setup-next'));

    // Step 6 (legacy, unchanged): starting weights.
    expect(screen.getByTestId('gym-setup-weights-help')).toBeOnTheScreen();
    await user.press(screen.getByTestId('gym-setup-next'));
    await user.press(screen.getByTestId('gym-setup-finish'));

    const payload = (mutate.mock.calls as [CompleteSetupInput][])[0]?.[0];
    expect(payload?.templateKey).toBe('ul3-beginner');
  });

  it('Back on the program step goes back one step, like legacy', async () => {
    const user = userEvent.setup();
    await renderWizard();
    await goToProgram(user);

    await user.press(screen.getByTestId('gym-setup-title-back'));
    expect(screen.getByText('Which days, roughly?')).toBeOnTheScreen();
  });

  it('Next is disabled while there is no program yet (offline)', async () => {
    trpc.gym.profile.recommend.useQuery.mockReturnValue(
      queryResult({ data: undefined, isError: true }),
    );
    const user = userEvent.setup();
    await renderWizard();
    await goToProgram(user);

    expect(screen.getByTestId('gym-setup-preview-offline')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-setup-next')).toBeDisabled();
  });

  it('the old shell still draws the legacy program step', async () => {
    setShellV2Preview(false);
    const user = userEvent.setup();
    await renderWizard();
    await user.press(screen.getByTestId('gym-setup-next'));
    await user.press(screen.getByTestId('gym-setup-next'));
    await user.press(screen.getByTestId('gym-setup-next'));
    await user.press(screen.getByTestId('gym-setup-skip'));

    expect(screen.getByTestId('gym-setup-choose-alt')).toBeOnTheScreen();
    expect(screen.queryByTestId('gym-setup-program-fb3-beginner')).toBeNull();
  });
});
