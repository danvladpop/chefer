import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { getQueryKey } from '@trpc/react-query';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { ExerciseFormV2Screen } from '../../src/features/shell/train/exercise-form-v2';
import { trpc } from '../../src/lib/trpc';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import { makeGymQueryClient, renderWithGym } from './gym-screen-test-utils';

// 10 Oct redesign — the new shell's New/Edit exercise form (ExerciseForm
// board): dropdowns instead of chip walls, same save as the legacy screen
// (both run useExerciseForm). The trpc client points at a dead port and
// renderWithGym stubs `fetch`, so the mutation payload is read back from the
// request body the batch link tried to send.

const flagsQueryKey = getQueryKey(trpc.profile.flags, undefined, 'query');

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

// renderWithGym re-spies `fetch` per render; start each test with no calls.
beforeEach(() => jest.clearAllMocks());

/** The `input` of the last request the client sent to `path` (superjson-decoded `json`). */
function sentInput(path: string): Record<string, unknown> | undefined {
  const calls = (global.fetch as jest.Mock).mock.calls as [unknown, { body?: unknown }?][];
  const call = calls.filter(([url]) => String(url).includes(path)).at(-1);
  if (!call?.[1] || typeof call[1].body !== 'string') return undefined;
  const body = JSON.parse(call[1].body) as Record<string, { json: Record<string, unknown> }>;
  return body['0']?.json;
}

async function renderForm(
  props: { exerciseId?: string; initialName?: string } = {},
  { cardioLogging = false, library = [] as ReturnType<typeof makeExercise>[] } = {},
) {
  const queryClient = makeGymQueryClient();
  queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library }));
  if (cardioLogging) queryClient.setQueryData(flagsQueryKey, { cardioLogging: true });
  await renderWithGym(<ExerciseFormV2Screen {...props} />, queryClient);
}

describe('ExerciseFormV2Screen', () => {
  it('builds the createCustom payload from the dropdowns, the type control and the muscle pickers', async () => {
    const user = userEvent.setup();
    await renderForm({}, { cardioLogging: true });

    expect(screen.getByText('New exercise')).toBeTruthy();
    await user.type(screen.getByTestId('exercise-form-name'), 'Landmine Press');

    // Type: segmented Compound | Isolation.
    await user.press(screen.getByTestId('exercise-form-category-ISOLATION'));

    // Equipment / Load / How you track it: single-select dropdown sheets.
    await user.press(screen.getByTestId('exercise-form-equipment'));
    await user.press(await screen.findByTestId('exercise-form-equipment-sheet-option-DUMBBELL'));
    await user.press(screen.getByTestId('exercise-form-load-type'));
    await user.press(
      await screen.findByTestId('exercise-form-load-type-sheet-option-BODYWEIGHT_PLUS'),
    );
    await user.press(screen.getByTestId('exercise-form-tracking-type'));
    await user.press(
      await screen.findByTestId('exercise-form-tracking-type-sheet-option-BODYWEIGHT_REPS'),
    );

    // Main muscles: multi-select sheet, closed with Done.
    await user.press(screen.getByTestId('exercise-form-primary-muscles'));
    await user.press(await screen.findByTestId('exercise-form-primary-muscles-option-chest'));
    await user.press(screen.getByTestId('exercise-form-primary-muscles-option-front-delts'));
    await user.press(screen.getByTestId('exercise-form-primary-muscles-done'));
    expect(screen.getByTestId('exercise-form-primary-muscles')).toHaveProp(
      'accessibilityLabel',
      'Main muscles, Chest, Front delts',
    );

    // Also works never offers a muscle already picked as a main one.
    await user.press(screen.getByTestId('exercise-form-secondary-muscles'));
    await user.press(await screen.findByTestId('exercise-form-secondary-muscles-option-triceps'));
    expect(screen.queryByTestId('exercise-form-secondary-muscles-option-chest')).toBeNull();
    await user.press(screen.getByTestId('exercise-form-secondary-muscles-done'));

    await user.press(screen.getByTestId('exercise-form-submit'));

    await waitFor(() => expect(sentInput('gym.library.createCustom')).toBeDefined());
    expect(sentInput('gym.library.createCustom')).toEqual({
      name: 'Landmine Press',
      category: 'ISOLATION',
      equipment: 'DUMBBELL',
      loadType: 'BODYWEIGHT_PLUS',
      primaryMuscles: ['chest', 'front-delts'],
      secondaryMuscles: ['triceps'],
      repMin: 8,
      repMax: 12,
      restSec: 90,
      isTimed: false,
      trackingType: 'BODYWEIGHT_REPS',
      cues: [],
    });
    // The failed save (dead port) shows on the form, like legacy.
    expect(await screen.findByTestId('exercise-form-errors')).toBeTruthy();
  });

  it('maps the Compound segment back to COMPOUND and, with cardioLogging off, sends isTimed only', async () => {
    const user = userEvent.setup();
    await renderForm({ initialName: 'Plank' });

    await user.press(screen.getByTestId('exercise-form-category-ISOLATION'));
    await user.press(screen.getByTestId('exercise-form-category-COMPOUND'));
    expect(screen.getByTestId('exercise-form-category-COMPOUND')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );

    await user.press(screen.getByTestId('exercise-form-timed'));
    await user.press(await screen.findByTestId('exercise-form-timed-sheet-option-DURATION'));
    await user.press(screen.getByTestId('exercise-form-primary-muscles'));
    await user.press(await screen.findByTestId('exercise-form-primary-muscles-option-abs'));
    await user.press(screen.getByTestId('exercise-form-primary-muscles-done'));
    await user.press(screen.getByTestId('exercise-form-submit'));

    await waitFor(() => expect(sentInput('gym.library.createCustom')).toBeDefined());
    const input = sentInput('gym.library.createCustom');
    expect(input).toMatchObject({ name: 'Plank', category: 'COMPOUND', isTimed: true });
    expect(input).not.toHaveProperty('trackingType');
  });

  it('refuses a 5th main muscle with a visible reason inside the sheet', async () => {
    const user = userEvent.setup();
    await renderForm();

    await user.press(screen.getByTestId('exercise-form-primary-muscles'));
    for (const m of ['chest', 'lats', 'quads', 'hamstrings', 'biceps']) {
      await user.press(await screen.findByTestId(`exercise-form-primary-muscles-option-${m}`));
    }
    expect(screen.getByTestId('exercise-form-primary-muscles-sheet-error')).toHaveTextContent(
      'Pick up to 4 primary muscles.',
    );
    await user.press(screen.getByTestId('exercise-form-primary-muscles-done'));
    expect(screen.getByTestId('exercise-form-primary-muscles')).toHaveProp(
      'accessibilityLabel',
      'Main muscles, Chest, Lats, Quads, Hamstrings',
    );
  });

  it('adds, edits and removes cues (capped at 6) and sends the trimmed, non-empty ones', async () => {
    const user = userEvent.setup();
    await renderForm({ initialName: 'Cable Fly' });

    for (let i = 0; i < 6; i++) {
      await user.press(screen.getByTestId('exercise-form-add-cue'));
    }
    expect(screen.queryByTestId('exercise-form-add-cue')).toBeNull();
    expect(screen.getByLabelText('Remove cue 6')).toBeTruthy();

    // Remove four, keep two.
    for (let i = 0; i < 4; i++) {
      await user.press(screen.getByTestId('exercise-form-remove-cue-0'));
    }
    expect(screen.queryByTestId('exercise-form-cue-2')).toBeNull();
    expect(screen.getByTestId('exercise-form-add-cue')).toBeTruthy();

    await user.type(screen.getByTestId('exercise-form-cue-0'), '  Squeeze at the top ');
    await user.press(screen.getByTestId('exercise-form-primary-muscles'));
    await user.press(await screen.findByTestId('exercise-form-primary-muscles-option-chest'));
    await user.press(screen.getByTestId('exercise-form-primary-muscles-done'));
    await user.press(screen.getByTestId('exercise-form-submit'));

    await waitFor(() => expect(sentInput('gym.library.createCustom')).toBeDefined());
    expect(sentInput('gym.library.createCustom')).toMatchObject({
      cues: ['Squeeze at the top'],
    });
  });

  it('blocks the save and shows field errors when the name is empty', async () => {
    const user = userEvent.setup();
    await renderForm();

    await user.press(screen.getByTestId('exercise-form-primary-muscles'));
    await user.press(await screen.findByTestId('exercise-form-primary-muscles-option-chest'));
    await user.press(screen.getByTestId('exercise-form-primary-muscles-done'));
    await user.press(screen.getByTestId('exercise-form-submit'));

    expect(await screen.findByTestId('exercise-form-error-name')).toHaveTextContent(
      'Give it a name of at least 2 characters.',
    );
    expect(screen.getByTestId('exercise-form-name')).toHaveProp('aria-invalid', true);
    expect(sentInput('gym.library.createCustom')).toBeUndefined();

    // Typing clears the error.
    await user.type(screen.getByTestId('exercise-form-name'), 'Fly');
    expect(screen.queryByTestId('exercise-form-error-name')).toBeNull();
  });

  it('edits an existing custom exercise through updateCustom', async () => {
    const user = userEvent.setup();
    const custom = {
      ...makeExercise('curl', 'My Curl'),
      ownerId: 'user-1',
      primaryMuscles: ['biceps' as const],
    };
    await renderForm({ exerciseId: 'curl' }, { library: [custom] });

    expect(await screen.findByDisplayValue('My Curl')).toBeTruthy();
    expect(screen.getByText('Edit exercise')).toBeTruthy();
    expect(screen.getByTestId('exercise-form-primary-muscles')).toHaveProp(
      'accessibilityLabel',
      'Main muscles, Biceps',
    );
    await user.press(screen.getByTestId('exercise-form-submit'));

    await waitFor(() => expect(sentInput('gym.library.updateCustom')).toBeDefined());
    expect(sentInput('gym.library.updateCustom')).toMatchObject({
      id: 'curl',
      exercise: { name: 'My Curl', primaryMuscles: ['biceps'] },
    });
  });

  it('shows not-found when editing an exercise missing from the library', async () => {
    await renderForm({ exerciseId: 'missing' });
    expect(await screen.findByTestId('exercise-form-not-found')).toBeTruthy();
  });
});
