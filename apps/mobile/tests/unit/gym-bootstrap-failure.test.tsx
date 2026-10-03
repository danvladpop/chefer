import { renderHook, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ExerciseDto } from '@chefer/types';
import { useGymBootstrapLoad } from '../../src/features/gym/components/gym-bootstrap-state';
import { exerciseFormErrors } from '../../src/features/gym/library-screens/exercise-form-errors';
import { ExercisesTab } from '../../src/features/gym/library-screens/exercises-tab';
import {
  createExerciseHref,
  openCreateExercise,
} from '../../src/features/gym/library/create-exercise-href';
import { ExercisePicker } from '../../src/features/gym/library/exercise-picker';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { StatsTab } from '../../src/features/gym/stats/stats-tab';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import { makeGymQueryClient, renderWithGym } from './gym-screen-test-utils';

// UX-GYM-24 / UX-GYM-21 (WP-02 lane C): a failed gym bootstrap load is an
// error with Retry — Stats never says "Loading…" forever and Exercises never
// says "No exercises match" — and an empty search offers Create "<query>".

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useIsFocused: () => true,
  usePathname: () => '/exercises',
  useLocalSearchParams: () => ({}),
}));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  router.push.mockClear();
});

describe('useGymBootstrapLoad', () => {
  const refetch = jest.fn();
  const load = async (q: Parameters<typeof useGymBootstrapLoad>[0]) =>
    (await renderHook(() => useGymBootstrapLoad(q))).result.current.load;

  it('is "data" as soon as there is data, even when a refetch failed', async () => {
    expect(await load({ data: {}, isError: true, fetchStatus: 'idle', refetch })).toBe('data');
  });
  it('is "error" when the load failed with nothing to show', async () => {
    expect(await load({ data: undefined, isError: true, fetchStatus: 'idle', refetch })).toBe(
      'error',
    );
  });
  it('is "offline" while the first fetch is paused with no cache', async () => {
    expect(await load({ data: undefined, isError: false, fetchStatus: 'paused', refetch })).toBe(
      'offline',
    );
  });
  it('is "loading" while the first fetch is running', async () => {
    expect(await load({ data: undefined, isError: false, fetchStatus: 'fetching', refetch })).toBe(
      'loading',
    );
  });
});

describe('failed bootstrap load', () => {
  it('Stats shows an error with Retry, not "Loading…"', async () => {
    const queryClient = makeGymQueryClient();
    await renderWithGym(<StatsTab />, queryClient);

    expect(await screen.findByTestId('gym-stats-error')).toBeOnTheScreen();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.getByTestId('gym-stats-error-retry')).toBeOnTheScreen();
  });

  it('Exercises shows an error with Retry, not "No exercises match"', async () => {
    const queryClient = makeGymQueryClient();
    await renderWithGym(<ExercisesTab />, queryClient);

    expect(await screen.findByTestId('exercises-error')).toBeOnTheScreen();
    expect(screen.queryByText('No exercises match')).toBeNull();
  });
});

describe('Create from an empty search', () => {
  const library: ExerciseDto[] = [makeExercise('bench', 'Bench Press')];

  it('Exercises tab offers Create "<query>" and opens the pre-filled form', async () => {
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library }));
    const user = userEvent.setup();
    await renderWithGym(<ExercisesTab />, queryClient);

    await user.type(screen.getByTestId('exercises-search'), 'T-bar row');
    await user.press(await screen.findByTestId('exercises-empty-create-from-search'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/exercise-form',
      params: { name: 'T-bar row' },
    });
  });

  it('the picker offers it only when asked to, and closes first', async () => {
    const onClose = jest.fn();
    const queryClient = makeGymQueryClient();
    const user = userEvent.setup();
    await renderWithGym(
      <ExercisePicker
        visible
        onClose={onClose}
        onPick={jest.fn()}
        library={library}
        onCreateFromSearch={openCreateExercise}
      />,
      queryClient,
    );

    expect(screen.queryByTestId('exercise-picker-create-from-search')).toBeNull();
    await user.type(screen.getByTestId('exercise-picker-search'), 'T-bar');
    await user.press(await screen.findByTestId('exercise-picker-create-from-search'));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/exercise-form',
      params: { name: 'T-bar' },
    });
  });

  it('the picker does not offer it by default', async () => {
    const queryClient = makeGymQueryClient();
    const user = userEvent.setup();
    await renderWithGym(
      <ExercisePicker visible onClose={jest.fn()} onPick={jest.fn()} library={library} />,
      queryClient,
    );
    await user.type(screen.getByTestId('exercise-picker-search'), 'T-bar');
    await waitFor(() => expect(screen.getByText(/No exercises match/)).toBeOnTheScreen());
    expect(screen.queryByTestId('exercise-picker-create-from-search')).toBeNull();
  });

  it('createExerciseHref trims and caps at 60 characters (typed route object)', () => {
    expect(createExerciseHref('  ')).toEqual({ pathname: '/gym/exercise-form' });
    expect(createExerciseHref(' a&b ')).toEqual({
      pathname: '/gym/exercise-form',
      params: { name: 'a&b' },
    });
    expect(createExerciseHref('x'.repeat(80)).params?.name).toHaveLength(60);
  });
});

describe('exerciseFormErrors', () => {
  it('files schema issues under their field in plain language', () => {
    const result = exerciseFormErrors([
      { code: 'too_small', path: ['primaryMuscles'], message: 'Array must contain at least 1' },
      { code: 'too_big', path: ['name'] },
      { code: 'too_big', path: ['cues', 2] },
      { code: 'custom', path: [], message: 'repMin must be ≤ repMax' },
    ]);
    expect(result.fields).toEqual({
      primaryMuscles: 'Pick at least one primary muscle.',
      name: 'Keep the name to 60 characters or fewer.',
      cues: 'Cue 3 is over 120 characters.',
      reps: 'Check the rep range: the minimum can’t be above the maximum.',
    });
    expect(result.form).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/Array must|repMin must/);
  });
});
