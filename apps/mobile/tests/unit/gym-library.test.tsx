import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ExerciseDto } from '@chefer/types';
import { filterExercisesForTab } from '../../src/features/gym/library-screens/exercise-filters';
import { ExercisesTab } from '../../src/features/gym/library-screens/exercises-tab';
import { ExercisePicker } from '../../src/features/gym/library/exercise-picker';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import { makeGymQueryClient, renderWithGym } from './gym-screen-test-utils';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useIsFocused: () => true,
}));

const { router } = jest.requireMock<{
  router: { replace: jest.Mock; push: jest.Mock; back: jest.Mock; canGoBack: jest.Mock };
}>('expo-router');

function exercise(overrides: Partial<ExerciseDto> & { id: string; name: string }): ExerciseDto {
  return { ...makeExercise(overrides.id, overrides.name), ...overrides };
}

const bench = exercise({
  id: 'bench',
  name: 'Bench Press',
  primaryMuscles: ['chest'],
  equipment: 'BARBELL',
});
const squat = exercise({
  id: 'squat',
  name: 'Back Squat',
  primaryMuscles: ['quads'],
  equipment: 'BARBELL',
});
const curl = exercise({
  id: 'curl',
  name: 'Custom Curl',
  primaryMuscles: ['biceps'],
  equipment: 'DUMBBELL',
  ownerId: 'user-1',
});
const LIBRARY = [bench, squat, curl];

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  router.replace.mockClear();
  router.push.mockClear();
});

describe('filterExercisesForTab', () => {
  it('filters by search text', () => {
    const rows = filterExercisesForTab(LIBRARY, {
      query: 'squ',
      group: null,
      equipment: null,
      mineOnly: false,
    });
    expect(rows.map((e) => e.id)).toEqual(['squat']);
  });

  it('filters by muscle group', () => {
    const rows = filterExercisesForTab(LIBRARY, {
      query: '',
      group: 'chest',
      equipment: null,
      mineOnly: false,
    });
    expect(rows.map((e) => e.id)).toEqual(['bench']);
  });

  it('filters by equipment', () => {
    const rows = filterExercisesForTab(LIBRARY, {
      query: '',
      group: null,
      equipment: 'DUMBBELL',
      mineOnly: false,
    });
    expect(rows.map((e) => e.id)).toEqual(['curl']);
  });

  it('filters to custom (mine) exercises only', () => {
    const rows = filterExercisesForTab(LIBRARY, {
      query: '',
      group: null,
      equipment: null,
      mineOnly: true,
    });
    expect(rows.map((e) => e.id)).toEqual(['curl']);
  });

  it('combines filters', () => {
    const rows = filterExercisesForTab(LIBRARY, {
      query: 'curl',
      group: 'biceps',
      equipment: 'DUMBBELL',
      mineOnly: true,
    });
    expect(rows.map((e) => e.id)).toEqual(['curl']);
  });
});

describe('ExercisesTab', () => {
  it('lists every exercise in the cached library', async () => {
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: LIBRARY }));
    await renderWithGym(<ExercisesTab />, queryClient);

    expect(await screen.findByTestId('exercises-item-bench')).toBeTruthy();
    expect(screen.getByTestId('exercises-item-squat')).toBeTruthy();
    expect(screen.getByTestId('exercises-item-curl')).toBeTruthy();
  });

  it('narrows the list as the user searches', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: LIBRARY }));
    await renderWithGym(<ExercisesTab />, queryClient);
    await screen.findByTestId('exercises-item-bench');

    await user.type(screen.getByTestId('exercises-search'), 'squ');

    await waitFor(() => expect(screen.queryByTestId('exercises-item-bench')).toBeNull());
    expect(screen.getByTestId('exercises-item-squat')).toBeTruthy();
  });

  it('the Mine filter shows only custom exercises', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: LIBRARY }));
    await renderWithGym(<ExercisesTab />, queryClient);
    await screen.findByTestId('exercises-item-bench');

    await user.press(screen.getByTestId('exercises-mine-filter'));

    await waitFor(() => expect(screen.queryByTestId('exercises-item-bench')).toBeNull());
    expect(screen.getByTestId('exercises-item-curl')).toBeTruthy();
  });

  it('opens the custom-exercise form', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: LIBRARY }));
    await renderWithGym(<ExercisesTab />, queryClient);

    await user.press(screen.getByTestId('exercises-create-custom'));
    expect(router.push).toHaveBeenCalledWith('/gym/exercise-form');
  });

  it('opens an exercise on tap', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: LIBRARY }));
    await renderWithGym(<ExercisesTab />, queryClient);

    await user.press(await screen.findByTestId('exercises-item-bench'));
    expect(router.push).toHaveBeenCalledWith('/gym/exercise/bench');
  });

  // Gym dogfood #2: the search box is pinned above the list, so it never
  // hides behind the keyboard; results that do are reachable because
  // dragging the list dismisses the keyboard (without eating row taps).
  it('dismisses the keyboard when the results are dragged', async () => {
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: LIBRARY }));
    await renderWithGym(<ExercisesTab />, queryClient);

    const list = await screen.findByTestId('exercises-list');
    expect(list.props.keyboardDismissMode).toBe('on-drag');
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
  });
});

describe('ExercisePicker keyboard handling', () => {
  // Same reasoning as the Exercises tab: search sits at the top of the
  // sheet, which Sheet's KeyboardAvoidingView lifts above the keyboard.
  it('dismisses the keyboard on Search or when the results are dragged', async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ExercisePicker visible onClose={jest.fn()} onPick={jest.fn()} library={LIBRARY} />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('exercise-picker-search').props.returnKeyType).toBe('search');
    const list = screen.getByTestId('exercise-picker-list');
    expect(list.props.keyboardDismissMode).toBe('on-drag');
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
  });
});
