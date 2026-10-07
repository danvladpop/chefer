import { screen, userEvent, waitFor } from '@testing-library/react-native';
import type { SessionSummaryDto } from '@chefer/types';
import { MuscleVolumeView } from '../../src/features/gym/stats/muscle-volume-view';
import { PrTimelineView } from '../../src/features/gym/stats/pr-timeline-view';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import { renderWithGym } from './gym-screen-test-utils';

// FB7-08 / FB7-09: the stats filters are dropdowns (as on web), not walls of
// chips — "Weekly sets per muscle" has a Muscle select, "PR timeline" an
// Exercise select (searchable past 12 options).

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false },
  usePathname: () => '/stats',
}));

function session(
  id: string,
  localDate: string,
  exerciseId: string,
  weightKg: number,
): SessionSummaryDto {
  return {
    id,
    name: 'Day',
    routineDayId: null,
    status: 'COMPLETED',
    localDate,
    startedAt: `${localDate}T08:00:00.000Z`,
    finishedAt: `${localDate}T09:00:00.000Z`,
    isDeload: false,
    exercises: [
      {
        exerciseId,
        skipped: false,
        lastSetRir: 2,
        sets: [{ weightKg, reps: 5, isWarmup: false, completed: true }],
      },
    ],
  };
}

describe('FB7-08 Weekly sets per muscle', () => {
  it('uses a Muscle select (default Chest) and changes the chart group on selection', async () => {
    const user = userEvent.setup();
    const bootstrap = makeBootstrap({ library: [makeExercise('bench', 'Bench Press')] });
    await renderWithGym(<MuscleVolumeView bootstrap={bootstrap} />);

    const field = screen.getByTestId('stats-muscle-volume-group');
    expect(field).toHaveAccessibleName('Muscle, Chest');
    // No chip wall any more.
    expect(screen.queryAllByRole('button', { selected: true })).toHaveLength(0);
    expect(screen.getByTestId('stats-muscle-volume-legend')).toHaveTextContent(/Chest/);

    await user.press(field);
    await user.press(await screen.findByTestId('stats-muscle-volume-group-sheet-option-back'));

    await waitFor(() =>
      expect(screen.getByTestId('stats-muscle-volume-group')).toHaveAccessibleName('Muscle, Back'),
    );
    const legend = screen.getByTestId('stats-muscle-volume-legend');
    expect(legend).toHaveTextContent(/Back/);
    expect(legend).not.toHaveTextContent(/Chest/);
  });
});

describe('FB7-09 PR timeline', () => {
  const library = [makeExercise('bench', 'Bench Press'), makeExercise('curl', 'Bicep Curl')];
  const recentSessions = [
    session('s1', '2026-01-01', 'bench', 100),
    session('s2', '2026-01-02', 'curl', 20),
  ];

  it('uses an Exercise select (All by default) and filters the PRs on selection', async () => {
    const user = userEvent.setup();
    const bootstrap = makeBootstrap({ library, recentSessions });
    await renderWithGym(<PrTimelineView bootstrap={bootstrap} />);

    const field = screen.getByTestId('stats-pr-filter');
    expect(field).toHaveAccessibleName('Exercise, All');
    expect(await screen.findByText('Bench Press')).toBeOnTheScreen();
    expect(screen.getByText('Bicep Curl')).toBeOnTheScreen();
    // One select instead of one chip per exercise.
    expect(screen.queryByTestId('stats-pr-filter-bench')).toBeNull();

    await user.press(field);
    await user.press(await screen.findByTestId('stats-pr-filter-sheet-option-curl'));

    await waitFor(() => expect(screen.queryByText('Bench Press')).toBeNull());
    expect(screen.getByTestId('stats-pr-filter')).toHaveAccessibleName('Exercise, Bicep Curl');
    expect(screen.getByTestId('stats-pr-row-0')).toHaveTextContent(/Bicep Curl/);

    // "All" clears the filter again.
    await user.press(screen.getByTestId('stats-pr-filter'));
    await user.press(await screen.findByTestId('stats-pr-filter-sheet-option-__all__'));
    expect(await screen.findByText('Bench Press')).toBeOnTheScreen();
  });

  it('offers search once there are more than 12 exercises', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 13 }, (_, i) => makeExercise(`e${i}`, `Lift ${i}`));
    const bootstrap = makeBootstrap({
      library: many,
      recentSessions: many.map((e, i) =>
        session(`s${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`, e.id, 50),
      ),
    });
    await renderWithGym(<PrTimelineView bootstrap={bootstrap} />);
    await user.press(screen.getByTestId('stats-pr-filter'));
    expect(await screen.findByTestId('stats-pr-filter-sheet-search')).toBeOnTheScreen();
  });
});
