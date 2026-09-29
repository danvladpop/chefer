import { screen, userEvent } from '@testing-library/react-native';
import { getQueryKey } from '@trpc/react-query';
import { ExerciseFormScreen } from '../../src/features/gym/library-screens/exercise-form-screen';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { trpc } from '../../src/lib/trpc';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import { makeGymQueryClient, renderWithGym } from './gym-screen-test-utils';

// T-42.3 follow-up: useFlags() reads `profile.flags` — pre-seed it so a test
// can force cardioLogging on (default/unseeded reads as every flag off, the
// same "failed or absent response = all-off" fallback useFlags documents).
const flagsQueryKey = getQueryKey(trpc.profile.flags, undefined, 'query');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

const { router } = jest.requireMock<{
  router: { replace: jest.Mock; push: jest.Mock; back: jest.Mock };
}>('expo-router');

beforeEach(() => {
  router.replace.mockClear();
  router.push.mockClear();
  router.back.mockClear();
});

describe('ExerciseFormScreen', () => {
  it('blocks submission and shows errors when required fields are missing', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    await renderWithGym(<ExerciseFormScreen />, queryClient);

    // Default state has no name and no primary muscle picked.
    await user.press(screen.getByTestId('exercise-form-submit'));

    expect(await screen.findByTestId('exercise-form-errors')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('passes validation once the required fields are filled in', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    await renderWithGym(<ExerciseFormScreen />, queryClient);

    await user.type(screen.getByTestId('exercise-form-name'), 'Cable Pullover');
    // "Lats" appears in both the primary and secondary muscle ChipGroups;
    // the primary one renders first.
    const [primaryLats] = screen.getAllByText('Lats');
    if (!primaryLats) throw new Error('expected a "Lats" chip to render');
    await user.press(primaryLats);
    await user.press(screen.getByTestId('exercise-form-submit'));

    // With a valid name and a primary muscle picked, the Zod schema passes
    // client-side and the submit handler reaches the mutation — surfaced
    // here by the (mocked, always-failing) network error rather than a
    // validation message, since the test's trpc client points at a dummy
    // unreachable port (gym-screen-test-utils).
    expect(await screen.findByTestId('exercise-form-errors')).toHaveTextContent('offline (test)');
  });

  it('lets the user add and remove cues, capped at 6', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    await renderWithGym(<ExerciseFormScreen />, queryClient);

    for (let i = 0; i < 6; i++) {
      await user.press(screen.getByTestId('exercise-form-add-cue'));
    }
    expect(screen.queryByTestId('exercise-form-add-cue')).toBeNull();
    expect(screen.getByTestId('exercise-form-cue-5')).toBeTruthy();

    await user.press(screen.getByTestId('exercise-form-remove-cue-0'));
    expect(screen.queryByTestId('exercise-form-cue-5')).toBeNull();
    expect(screen.getByTestId('exercise-form-add-cue')).toBeTruthy();
  });

  it('pre-fills the form when editing an existing custom exercise', async () => {
    const custom = {
      ...makeExercise('curl', 'My Curl'),
      ownerId: 'user-1',
      primaryMuscles: ['biceps' as const],
    };
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [custom] }));
    await renderWithGym(<ExerciseFormScreen exerciseId="curl" />, queryClient);

    expect(await screen.findByDisplayValue('My Curl')).toBeTruthy();
    expect(screen.getByText('Edit exercise')).toBeTruthy();
  });

  it('shows a not-found state when editing an exercise that is not in the cached library', async () => {
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    await renderWithGym(<ExerciseFormScreen exerciseId="missing" />, queryClient);

    expect(await screen.findByTestId('exercise-form-not-found')).toBeTruthy();
  });

  describe('cardioLogging gate (2026-09-28 follow-up)', () => {
    it('flag off (default): shows the old single "Timed exercise" checkbox, not the tracking-type chips', async () => {
      const queryClient = makeGymQueryClient();
      queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
      await renderWithGym(<ExerciseFormScreen />, queryClient);

      expect(screen.getByTestId('exercise-form-timed')).toBeTruthy();
      expect(screen.queryByTestId('exercise-form-tracking-type')).toBeNull();
    });

    it('flag on: shows the "How do you track it?" chips, not the old checkbox', async () => {
      const queryClient = makeGymQueryClient();
      queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
      queryClient.setQueryData(flagsQueryKey, { cardioLogging: true });
      await renderWithGym(<ExerciseFormScreen />, queryClient);

      expect(await screen.findByTestId('exercise-form-tracking-type')).toBeTruthy();
      expect(screen.queryByTestId('exercise-form-timed')).toBeNull();
    });
  });
});
