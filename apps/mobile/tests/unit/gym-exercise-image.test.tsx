import { fireEvent, screen } from '@testing-library/react-native';
import { ExerciseImage } from '../../src/features/gym/components/exercise-image';
import { renderWithGym } from './gym-screen-test-utils';

// UX-05 amendment A6 (T-05.11, O-26): the shared ExerciseImage surface.
// AC30 (one component, 3:2), AC32 (placeholder for photo-less/custom/hidden,
// never a letter or blank tile), AC33 (a forced load failure shows the
// placeholder and fires exercise_image_failed).

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: { name: string; testID?: string }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return <RN.Text testID={props.testID ?? 'icon'}>{props.name}</RN.Text>;
  },
}));

// A bare mock that forwards onLoad/onError onto the host View, so a test can
// drive them directly with `fireEvent(el, 'load' | 'error')`.
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    // `onLoad`/`onError` aren't real View props — this is a test-only stand-in
    // so `fireEvent(el, 'load' | 'error')` can drive them directly.
    Image: (props: { testID?: string; onLoad?: () => void; onError?: () => void }) => (
      <RN.View
        testID={props.testID}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ onLoad: props.onLoad, onError: props.onError } as any)}
      />
    ),
  };
});

function renderImage(overrides: Partial<React.ComponentProps<typeof ExerciseImage>> = {}) {
  return renderWithGym(
    <ExerciseImage
      uri="https://cdn.example/back-extension-0.3x2.webp"
      equipment="MACHINE"
      name="Back Extension"
      size="hero"
      analyticsExerciseId="back-extension"
      testID="img"
      {...overrides}
    />,
  );
}

describe('ExerciseImage — UX-05 A6', () => {
  it('renders the photo when a uri is given', async () => {
    await renderImage();
    expect(screen.getByTestId('img-photo')).toBeTruthy();
    expect(screen.queryByTestId('img-placeholder')).toBeNull();
  });

  it('AC32: shows the icon placeholder (never blank/letter) when there is no photo (photo-less/custom)', async () => {
    await renderImage({ uri: null, equipment: 'BODYWEIGHT', analyticsExerciseId: 'custom' });
    expect(screen.getByTestId('img-placeholder')).toBeTruthy();
    expect(screen.getByTestId('icon').props.children).toBe('body-outline');
  });

  it('AC32: shows the placeholder when the audit hides the photo, even with a uri', async () => {
    await renderImage({ hidden: true });
    expect(screen.getByTestId('img-placeholder')).toBeTruthy();
  });

  it('AC33: the first load failure retries silently (no placeholder, no event yet)', async () => {
    const onImageFailed = jest.fn();
    await renderImage({ onImageFailed });
    await fireEvent(screen.getByTestId('img-photo'), 'error');
    expect(screen.queryByTestId('img-placeholder')).toBeNull();
    expect(onImageFailed).not.toHaveBeenCalled();
  });

  it('AC33: a second failure of the retry shows the placeholder and fires onImageFailed once', async () => {
    const onImageFailed = jest.fn();
    await renderImage({ onImageFailed });
    await fireEvent(screen.getByTestId('img-photo'), 'error'); // 1st failure: silent retry
    await fireEvent(screen.getByTestId('img-photo'), 'error'); // 2nd failure: give up
    expect(screen.getByTestId('img-placeholder')).toBeTruthy();
    expect(screen.queryByTestId('img-photo')).toBeNull();
    expect(onImageFailed).toHaveBeenCalledTimes(1);
    expect(onImageFailed).toHaveBeenCalledWith('back-extension');
  });

  it('the placeholder is decorative in a thumb row', async () => {
    await renderImage({ uri: null, size: 'thumb' });
    const placeholder = screen.getByTestId('img-placeholder');
    expect(placeholder.props.accessible).toBe(false);
  });

  it('the placeholder is labelled "No photo yet" on the detail hero', async () => {
    await renderImage({ uri: null, size: 'hero' });
    const hero = screen.getByTestId('img-placeholder');
    expect(hero.props.accessibilityLabel).toBe('No photo yet');
  });
});
