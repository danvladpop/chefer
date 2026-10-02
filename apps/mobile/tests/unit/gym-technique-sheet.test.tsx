import { Linking } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ExerciseDto } from '@chefer/types';
import { TechniqueSheet } from '../../src/features/gym/workout/workout-sheets';
import { makeExercise } from './gym-fixtures';

// R-16: "Watch technique" inside a workout plays the in-app video sheet (after
// the technique sheet has finished closing) instead of leaving for YouTube.

let mockOnExited: (() => void) | undefined;
let mockVideoProps: Record<string, unknown> | null = null;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-webview', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/features/gym/components/exercise-image', () => ({
  ExerciseImage: () => null,
}));
jest.mock('../../src/features/gym/library-screens/exercise-video-sheet', () => ({
  ExerciseVideoSheet: (props: Record<string, unknown>) => {
    mockVideoProps = props;
    return null;
  },
}));
jest.mock('@chefer/ui-mobile', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const actual = jest.requireActual<Record<string, unknown>>('@chefer/ui-mobile');
  return {
    ...actual,
    // A bare Sheet: renders children while visible and exposes onExited, which
    // the real one fires from the native Modal's dismissal.
    Sheet: ({
      visible,
      children,
      onExited,
      testID,
    }: {
      visible: boolean;
      children: React.ReactNode;
      onExited?: () => void;
      testID?: string;
    }) => {
      mockOnExited = onExited;
      return visible ? <RN.View testID={testID}>{children}</RN.View> : null;
    },
  };
});

const exercise = {
  ...makeExercise('squat', 'Back Squat'),
  videoId: 'abc123',
  videoStartSec: 30,
  videoChannel: 'Jeff Nippard',
} as ExerciseDto;

it('closes the technique sheet, then opens the in-app video sheet (no Linking)', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const onClose = jest.fn();
  const { rerender } = await render(
    <TechniqueSheet visible onClose={onClose} exercise={exercise} />,
  );

  await fireEvent.press(screen.getByTestId('technique-sheet-video'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(mockVideoProps).toBeNull();

  // The parent hides the technique sheet; once it is fully gone the video opens.
  await rerender(<TechniqueSheet visible={false} onClose={onClose} exercise={null} />);
  await act(() => {
    mockOnExited?.();
  });

  expect(mockVideoProps).toMatchObject({
    visible: true,
    videoId: 'abc123',
    startSec: 30,
    channel: 'Jeff Nippard',
    testID: 'technique-video-sheet',
  });
  expect(openURL).not.toHaveBeenCalled();
  openURL.mockRestore();
});
