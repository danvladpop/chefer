import { act, screen, userEvent } from '@testing-library/react-native';
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

    // UX-GYM-21: each problem sits under its own field, in plain words —
    // never the raw schema text at the bottom of the form.
    expect(await screen.findByTestId('exercise-form-error-name')).toHaveTextContent(
      'Give it a name of at least 2 characters.',
    );
    expect(screen.getByTestId('exercise-form-error-primary-muscles')).toHaveTextContent(
      'Pick at least one primary muscle.',
    );
    expect(screen.queryByText(/Array must contain/)).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('limits the name and cue lengths and the number of muscles', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    await renderWithGym(<ExerciseFormScreen />, queryClient);

    expect(screen.getByTestId('exercise-form-name').props.maxLength).toBe(60);
    await user.press(screen.getByTestId('exercise-form-add-cue'));
    expect(screen.getByTestId('exercise-form-cue-0').props.maxLength).toBe(120);

    // A 5th primary muscle is refused with a visible reason (the schema caps at 4).
    for (const label of ['Chest', 'Lats', 'Quads', 'Hamstrings', 'Biceps']) {
      const [chip] = screen.getAllByText(label);
      if (!chip) throw new Error(`expected a "${label}" chip`);
      await user.press(chip);
    }
    expect(screen.getByTestId('exercise-form-error-primary-muscles')).toHaveTextContent(
      'Pick up to 4 primary muscles.',
    );
  });

  it('shows human equipment labels, not enum text', async () => {
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    await renderWithGym(<ExerciseFormScreen />, queryClient);

    expect(screen.getByText('Ski erg')).toBeTruthy();
    expect(screen.getByText('Treadmill')).toBeTruthy();
    expect(screen.queryByText('SKI_ERG')).toBeNull();
    expect(screen.queryByText('TREADMILL')).toBeNull();
  });

  it('pre-fills the name from a search (Create "T-bar")', async () => {
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    await renderWithGym(<ExerciseFormScreen initialName="T-bar row" />, queryClient);

    expect(screen.getByDisplayValue('T-bar row')).toBeTruthy();
  });

  it('does not seed an edit with defaults while the library is still refreshing', async () => {
    // Right after creating: the cached library lacks the new exercise for a
    // moment. The form must wait, then show the exercise — not the defaults.
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    await renderWithGym(<ExerciseFormScreen exerciseId="fresh" />, queryClient);
    expect(screen.queryByDisplayValue('Cable Fly')).toBeNull();

    const fresh = {
      ...makeExercise('fresh', 'Cable Fly'),
      ownerId: 'user-1',
      primaryMuscles: ['chest' as const],
    };
    await act(() => {
      queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [fresh] }));
    });

    expect(await screen.findByDisplayValue('Cable Fly')).toBeTruthy();
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
    // unreachable port (gym-screen-test-utils). R-09: shown as the friendly
    // "Can't reach Chefer" line, not the raw transport text.
    expect(await screen.findByTestId('exercise-form-errors')).toHaveTextContent(
      /Can't reach Chefer right now/,
    );
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
