import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { RoutineListItemDto } from '@chefer/types';
import GymRoutinesScreen from '../../app/gym/routines';

// UX-GYM-22 / UX-GYM-24 / X-13 (WP-02 lane C): archive is confirmed in a
// ConfirmSheet (never a native Alert) and shows its own failure; a failed
// routine list is an error with Retry, not "No routines yet".

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
}));

type MutationOptions = { onSuccess?: () => void; meta?: { silent?: boolean } };
const mockListQuery = jest.fn();
const mockArchive: { options?: MutationOptions; result: Record<string, unknown> } = {
  result: {},
};

jest.mock('../../src/lib/trpc', () => {
  const noop = () => ({ mutate: jest.fn(), isPending: false, error: null, reset: jest.fn() });
  return {
    trpc: {
      useUtils: () => ({
        gym: {
          routine: { list: { invalidate: jest.fn() } },
          bootstrap: { invalidate: jest.fn() },
        },
      }),
      gym: {
        routine: {
          list: { useQuery: (...args: unknown[]) => mockListQuery(...args) as unknown },
          templates: { useQuery: () => ({ data: [], isFetching: false, refetch: jest.fn() }) },
          setActive: { useMutation: noop },
          duplicate: { useMutation: noop },
          archive: {
            useMutation: (options?: MutationOptions) => {
              mockArchive.options = options;
              return mockArchive.result;
            },
          },
          createFromTemplate: { useMutation: noop },
          createBlank: { useMutation: noop },
        },
      },
    },
  };
});

const ROUTINE: RoutineListItemDto = {
  id: 'r1',
  name: 'Upper Lower',
  templateKey: null,
  isActive: false,
  dayCount: 4,
  archived: false,
  updatedAt: '2026-09-20T00:00:00.000Z',
};

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <GymRoutinesScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockArchive.options = undefined;
  mockArchive.result = { mutate: jest.fn(), isPending: false, error: null, reset: jest.fn() };
  mockListQuery.mockReturnValue({
    data: [ROUTINE],
    isPending: false,
    isError: false,
    fetchStatus: 'idle',
    refetch: jest.fn(),
  });
});

describe('My routines', () => {
  it('archive asks in a ConfirmSheet, not a native Alert, and confirms through the mutation', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const user = userEvent.setup();
    await renderScreen();

    await user.press(screen.getByTestId('routine-list-item-r1-archive'));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByTestId('gym-routines-archive-confirm-body')).toHaveTextContent(
      /"Upper Lower" will move out/,
    );

    await user.press(screen.getByTestId('gym-routines-archive-confirm-confirm'));
    expect(mockArchive.result.mutate).toHaveBeenCalledWith({ id: 'r1' });
    // The sheet shows the failure itself, so the default snackbar is opted out.
    expect(mockArchive.options?.meta).toEqual({ silent: true });
  });

  it('shows the archive failure inside the sheet', async () => {
    mockArchive.result = {
      mutate: jest.fn(),
      isPending: false,
      error: Object.assign(new Error('x'), {
        data: { code: 'BAD_REQUEST' },
        message: 'You can keep up to 30 routines.',
      }),
      reset: jest.fn(),
    };
    const user = userEvent.setup();
    await renderScreen();
    await user.press(screen.getByTestId('routine-list-item-r1-archive'));

    expect(screen.getByTestId('gym-routines-archive-confirm-error')).toHaveTextContent(
      'You can keep up to 30 routines.',
    );
  });

  it('a failed list load shows an error with Retry, not "No routines yet"', async () => {
    const refetch = jest.fn();
    mockListQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      fetchStatus: 'idle',
      refetch,
    });
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.queryByTestId('gym-routines-empty')).toBeNull();
    await user.press(screen.getByTestId('gym-routines-error-retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
