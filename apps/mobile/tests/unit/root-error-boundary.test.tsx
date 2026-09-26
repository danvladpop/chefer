import { fireEvent, render, screen } from '@testing-library/react-native';
import { RootErrorBoundary } from '../../src/components/root-error-boundary';

describe('RootErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a recoverable error screen instead of crashing', async () => {
    await render(<RootErrorBoundary error={new Error('boom')} retry={jest.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText(/Nothing you saved has been lost/)).toBeTruthy();
  });

  it('retries the route when "Try again" is pressed', async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    await render(<RootErrorBoundary error={new Error('boom')} retry={retry} />);
    await fireEvent.press(screen.getByTestId('root-error-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
