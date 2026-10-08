import { fireEvent, render, screen } from '@testing-library/react-native';
import { RootErrorBoundary } from '../../src/components/root-error-boundary';

const mockSubmitFeedback = jest.fn<Promise<void>, unknown[]>();
jest.mock('../../src/features/feedback/standalone-submit', () => ({
  submitFeedbackStandalone: (...args: unknown[]) => mockSubmitFeedback(...args),
}));
jest.mock('expo-router', () => ({ usePathname: () => '/recipe/abc' }));

describe('RootErrorBoundary', () => {
  beforeEach(() => {
    mockSubmitFeedback.mockReset().mockResolvedValue(undefined);
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

  // UX-PO-05: the crash screen used to be a dead end for a tester.
  it('"Report this" sends the pre-filled error with the build, OS and screen', async () => {
    await render(<RootErrorBoundary error={new Error('boom')} retry={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('root-error-report'));
    expect(screen.getByTestId('root-error-report-input').props.value).toContain('Error: boom');

    await fireEvent.changeText(
      screen.getByTestId('root-error-report-input'),
      'Error: boom\nWhat I was doing: opening a recipe',
    );
    await fireEvent.press(screen.getByTestId('root-error-report-send'));

    expect(mockSubmitFeedback).toHaveBeenCalledTimes(1);
    const [message, context] = mockSubmitFeedback.mock.calls[0] as [
      string,
      { route: string; build: string; os: string },
    ];
    expect(message).toBe('Error: boom\nWhat I was doing: opening a recipe');
    expect(context.route).toBe('/recipe/abc');
    expect(context.build).toContain('Chefer');
    expect(context.os).toMatch(/\S+ \S+/);
    expect(await screen.findByTestId('root-error-report-sent')).toBeTruthy();
  });

  it('says so, and keeps the form, when the report cannot be sent', async () => {
    mockSubmitFeedback.mockRejectedValue(new Error('offline'));
    await render(<RootErrorBoundary error={new Error('boom')} retry={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('root-error-report'));
    await fireEvent.press(screen.getByTestId('root-error-report-send'));
    expect(await screen.findByTestId('root-error-report-failed')).toBeTruthy();
    expect(screen.getByTestId('root-error-report-send')).toBeTruthy();
  });
});
