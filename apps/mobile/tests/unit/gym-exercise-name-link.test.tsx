import { render, screen, userEvent } from '@testing-library/react-native';
import { ExerciseNameLink } from '../../src/features/gym/components/exercise-name-link';

// FB7-05: exercise names are plain text (as on web) — still a tappable link
// with a hint and a >= 44 pt hit area, but no underline unless asked for.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => {
      mockPush(...args);
    },
  },
}));

function textClass(name: string): string {
  return String(screen.getByText(name).props.className ?? '');
}

describe('ExerciseNameLink', () => {
  beforeEach(() => mockPush.mockClear());

  it('has no underline by default', async () => {
    await render(<ExerciseNameLink testID="name" exerciseId="bench" name="Bench Press" />);
    expect(textClass('Bench Press')).not.toMatch(/underline|decoration/);
  });

  it('can still opt in to the dotted underline', async () => {
    await render(
      <ExerciseNameLink testID="name" exerciseId="bench" name="Bench Press" underline />,
    );
    expect(textClass('Bench Press')).toMatch(/underline/);
  });

  it('is a link with a hint, a 44 pt hit area, and opens the exercise', async () => {
    const user = userEvent.setup();
    await render(<ExerciseNameLink testID="name" exerciseId="bench" name="Bench Press" />);
    const link = screen.getByTestId('name');
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityHint).toBeTruthy();
    const slop = link.props.hitSlop as { top: number; bottom: number };
    // text-sm line height is 20 pt; slop pads it to >= 44 pt.
    expect(20 + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
    await user.press(link);
    expect(mockPush).toHaveBeenCalledWith('/gym/exercise/bench');
  });
});
