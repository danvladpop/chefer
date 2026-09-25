import { Alert, Linking, Platform, TextInput } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ExerciseDto, SessionSummaryDto } from '@chefer/types';
import { ExerciseDetailScreen } from '../../src/features/gym/library-screens/exercise-detail-screen';
import { getExerciseNote } from '../../src/features/gym/library-screens/exercise-notes';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeExercise, uuid } from './gym-fixtures';
import { makeGymQueryClient, renderWithGym } from './gym-screen-test-utils';

// pnpm's `@expo+vector-icons@<version>_<hash>` store directory (note the "+",
// not "/") slips past the jest-expo transformIgnorePatterns allow-list, so
// its raw ESM source fails to parse under Jest's CJS transform. Mocked out
// here rather than in the shared jest.config.js, which is outside G2-D's
// file ownership.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useIsFocused: () => false,
}));

jest.mock('react-native-webview', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({ testID }: { testID?: string }) => <RN.View testID={testID} />,
  };
});

const { router } = jest.requireMock<{
  router: { replace: jest.Mock; push: jest.Mock; back: jest.Mock; canGoBack: jest.Mock };
}>('expo-router');

function withVideo(overrides: Partial<ExerciseDto> = {}): ExerciseDto {
  return {
    ...makeExercise('bench', 'Bench Press'),
    images: ['/static/exercises/bench-0.webp', '/static/exercises/bench-1.webp'],
    videoId: 'abc123',
    videoStartSec: 30,
    videoChannel: 'Jeff Nippard',
    cues: ['Brace your core', 'Drive through your feet'],
    mistakes: ['Flaring elbows too wide'],
    blurb: 'A staple upper-body press.',
    ...overrides,
  };
}

let openURLSpy: jest.SpiedFunction<typeof Linking.openURL>;

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  onlineManager.setOnline(true);
  router.push.mockClear();
  router.back.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  // Captured in a variable (not asserted on as `Linking.openURL` directly) to
  // avoid @typescript-eslint/unbound-method on the assertion below.
  openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

describe('ExerciseDetailScreen', () => {
  it('renders photos, cues, mistakes, muscles, blurb and the watch-technique button', async () => {
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [withVideo()] }));
    await renderWithGym(<ExerciseDetailScreen exerciseId="bench" />, queryClient);

    expect(await screen.findByTestId('exercise-detail-photos')).toBeTruthy();
    expect(screen.getByTestId('exercise-detail-cues')).toBeTruthy();
    expect(screen.getByTestId('exercise-detail-mistakes')).toBeTruthy();
    expect(screen.getByTestId('exercise-detail-muscles')).toBeTruthy();
    expect(screen.getByTestId('exercise-detail-blurb')).toBeTruthy();
    expect(screen.getByText('Watch technique')).toBeTruthy();
    expect(screen.getByText('Video: Jeff Nippard')).toBeTruthy();
  });

  it('renders gracefully with no photos, no video and no cues', async () => {
    const bare = makeExercise('plank', 'Plank');
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [bare] }));
    await renderWithGym(<ExerciseDetailScreen exerciseId="plank" />, queryClient);

    expect(await screen.findByTestId('exercise-detail-photos')).toBeTruthy();
    expect(screen.getByText('No technique video yet')).toBeTruthy();
    expect(screen.queryByTestId('exercise-detail-cues')).toBeNull();
    expect(screen.queryByTestId('exercise-detail-mistakes')).toBeNull();
    expect(screen.queryByTestId('exercise-detail-blurb')).toBeNull();
  });

  it('shows the embedded player when online', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [withVideo()] }));
    await renderWithGym(<ExerciseDetailScreen exerciseId="bench" />, queryClient);

    await user.press(await screen.findByTestId('exercise-detail-watch'));
    expect(await screen.findByTestId('exercise-video-sheet-webview')).toBeTruthy();
  });

  it('falls back to "Open in YouTube" when offline, and never shows the player', async () => {
    const user = userEvent.setup();
    onlineManager.setOnline(false);
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [withVideo()] }));
    await renderWithGym(<ExerciseDetailScreen exerciseId="bench" />, queryClient);

    await user.press(await screen.findByTestId('exercise-detail-watch'));
    expect(screen.queryByTestId('exercise-video-sheet-webview')).toBeNull();
    expect(await screen.findByTestId('exercise-video-sheet-fallback-panel')).toBeTruthy();

    await user.press(screen.getByTestId('exercise-video-sheet-open-youtube'));
    expect(openURLSpy).toHaveBeenCalledWith('https://youtu.be/abc123?t=30');
  });

  it('offers edit and archive for a custom exercise, but not a curated one', async () => {
    const custom = withVideo({ id: 'my-curl', name: 'My Curl', ownerId: 'user-1' });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [custom] }));
    await renderWithGym(<ExerciseDetailScreen exerciseId="my-curl" />, queryClient);

    expect(await screen.findByTestId('exercise-detail-edit')).toBeTruthy();
    expect(screen.getByTestId('exercise-detail-archive')).toBeTruthy();
  });

  it('does not offer edit/archive for a curated (non-custom) exercise', async () => {
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [withVideo()] }));
    await renderWithGym(<ExerciseDetailScreen exerciseId="bench" />, queryClient);

    await screen.findByTestId('exercise-detail-photos');
    expect(screen.queryByTestId('exercise-detail-edit')).toBeNull();
    expect(screen.queryByTestId('exercise-detail-archive')).toBeNull();
  });

  it('confirms before archiving a custom exercise', async () => {
    const user = userEvent.setup();
    const custom = withVideo({ id: 'my-curl', name: 'My Curl', ownerId: 'user-1' });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [custom] }));
    await renderWithGym(<ExerciseDetailScreen exerciseId="my-curl" />, queryClient);

    await user.press(await screen.findByTestId('exercise-detail-archive'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Archive this exercise?',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('lists recent sessions for this exercise and opens one on tap', async () => {
    const user = userEvent.setup();
    const session: SessionSummaryDto = {
      id: uuid(1),
      name: 'Push Day',
      routineDayId: null,
      status: 'COMPLETED',
      localDate: '2026-09-10',
      startedAt: '2026-09-10T08:00:00.000Z',
      finishedAt: '2026-09-10T09:00:00.000Z',
      isDeload: false,
      exercises: [
        {
          exerciseId: 'bench',
          skipped: false,
          lastSetRir: 1,
          sets: [{ weightKg: 60, reps: 8, isWarmup: false, completed: true }],
        },
      ],
    };
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({ library: [withVideo()], recentSessions: [session] }),
    );
    await renderWithGym(<ExerciseDetailScreen exerciseId="bench" />, queryClient);

    const row = await screen.findByTestId(`exercise-detail-session-${session.id}`);
    await user.press(row);
    expect(router.push).toHaveBeenCalledWith(`/gym/session/${session.id}`);
  });

  it('saves a personal note locally', async () => {
    const user = userEvent.setup();
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [withVideo()] }));
    await renderWithGym(<ExerciseDetailScreen exerciseId="bench" />, queryClient);

    const note = await screen.findByTestId('exercise-detail-note');
    await user.type(note, 'Keep elbows tucked');

    await waitFor(() => expect(getExerciseNote('bench')).toBe('Keep elbows tucked'));
  });

  // Gym dogfood #2: the note is the last thing in a long scroll, so it's the
  // field most likely to open under the keyboard.
  it('keeps the personal note clear of the keyboard when it is focused', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const measureLayout = jest.spyOn(TextInput.prototype, 'measureLayout');
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ library: [withVideo()] }));
    await renderWithGym(<ExerciseDetailScreen exerciseId="bench" />, queryClient);

    // KeyboardAwareScrollView's iOS signature — a plain ScrollView leaves it off.
    expect(
      (await screen.findByTestId('gym-exercise-detail')).props.automaticallyAdjustKeyboardInsets,
    ).toBe(true);

    // RN's TextInput mock shares one jest.fn across every instance and test.
    measureLayout.mockClear();
    await fireEvent(screen.getByTestId('exercise-detail-note'), 'focus');
    expect(measureLayout).toHaveBeenCalledTimes(1);
  });
});
