import { render, screen, userEvent } from '@testing-library/react-native';
import { ErrorState } from '@chefer/ui-mobile';

describe('ErrorState (F-X-3-1)', () => {
  it('explains the failure and retries', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    await render(<ErrorState title="Couldn't load your meal plan" onRetry={onRetry} />);
    expect(screen.getByText("Couldn't load your meal plan")).toBeTruthy();
    await user.press(screen.getByTestId('error-state-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
