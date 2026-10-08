import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GymFeedbackRow } from '../../src/features/feedback/gym-feedback-row';

// UX-PO-05: Gym mode had no way to reach the feedback form.

const mockSubmit = jest.fn();
jest.mock('expo-router', () => ({ usePathname: () => '/gym/settings' }));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    feedback: {
      submit: {
        useMutation: () => ({
          mutate: mockSubmit,
          isPending: false,
          isSuccess: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

describe('GymFeedbackRow', () => {
  it('opens the feedback form and sends it with the Gym screen as the route', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <GymFeedbackRow />
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('feedback-input')).toBeNull();

    await fireEvent.press(screen.getByTestId('gym-feedback-row'));
    await fireEvent.changeText(screen.getByTestId('feedback-input'), 'Set logger lags');
    await fireEvent.press(screen.getByTestId('feedback-submit'));

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Set logger lags', route: '/gym/settings' }),
    );
  });
});
