import { Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { RoutineListItemDto } from '@chefer/types';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import GymRoutinesScreen from '../../app/gym/routines';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, profile } from './gym-fixtures';

// UX-GYM-22 / UX-GYM-24 / X-13 (WP-02 lane C): archive is confirmed in a
// ConfirmSheet (never a native Alert) and shows its own failure; a failed
// routine list is an error with Retry, not "No routines yet".
// WP-12 B: UX-GYM-14 (template preview, "Create" vs "Create and switch", the
// weekly goal follows) and UX-GYM-15 (Archive in a ⋯ menu, special copy for the
// active routine).

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
}));

type MutationOptions = {
  onSuccess?: (data: unknown, variables: unknown) => void;
  meta?: { silent?: boolean };
};
const mockListQuery = jest.fn();
const mockArchive: { options?: MutationOptions; result: Record<string, unknown> } = {
  result: {},
};
const mockCreateFromTemplate: { options?: MutationOptions; mutate: jest.Mock } = {
  mutate: jest.fn(),
};
const mockSaveProfile = jest.fn();
const mockDuplicate = jest.fn();

jest.mock('../../src/lib/trpc', () => {
  const noop = () => ({ mutate: jest.fn(), isPending: false, error: null, reset: jest.fn() });
  return {
    trpc: {
      useUtils: () => ({
        gym: {
          routine: { list: { invalidate: jest.fn() } },
          bootstrap: { invalidate: jest.fn() },
        },
        preferences: { get: { invalidate: jest.fn() } },
      }),
      gym: {
        bootstrap: { _def: () => ({ path: ['gym', 'bootstrap'] }) },
        profile: {
          save: {
            useMutation: () => ({
              mutate: (...args: unknown[]) => mockSaveProfile(...args) as unknown,
              isPending: false,
            }),
          },
        },
        routine: {
          list: { useQuery: (...args: unknown[]) => mockListQuery(...args) as unknown },
          templates: {
            useQuery: () => ({
              data: [
                {
                  key: 'fb3-beginner',
                  name: 'Full Body 3×',
                  daysPerWeek: 3,
                  experience: 'BEGINNER',
                  description: 'Three full-body days.',
                },
              ],
              isFetching: false,
              refetch: jest.fn(),
            }),
          },
          setActive: { useMutation: noop },
          duplicate: {
            useMutation: () => ({
              mutate: (...args: unknown[]) => mockDuplicate(...args) as unknown,
              isPending: false,
              error: null,
              reset: jest.fn(),
            }),
          },
          archive: {
            useMutation: (options?: MutationOptions) => {
              mockArchive.options = options;
              return mockArchive.result;
            },
          },
          createFromTemplate: {
            useMutation: (options?: MutationOptions) => {
              mockCreateFromTemplate.options = options;
              return {
                mutate: mockCreateFromTemplate.mutate,
                isPending: false,
                error: null,
                reset: jest.fn(),
              };
            },
          },
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
const ACTIVE_ROUTINE: RoutineListItemDto = {
  ...ROUTINE,
  id: 'r2',
  name: 'Push Pull Legs',
  isActive: true,
};

let queryClient: QueryClient;
const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>
        <GymRoutinesScreen />
        <Snackbar />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );

/** The ⋯ menu closes, then — on iOS — the next sheet opens from onExited (Android path here). */
async function openArchiveConfirm(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.press(screen.getByTestId(`routine-list-item-${id}-more`));
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  await user.press(screen.getByTestId('gym-routines-menu-archive'));
  await waitFor(() => expect(screen.getByTestId('gym-routines-archive-confirm-body')).toBeTruthy());
  platform.restore();
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(
    gymBootstrapQueryKey,
    makeBootstrap({ profile: { ...profile, weeklyGoal: 4, equipmentAccess: 'FULL_GYM' } }),
  );
  mockCreateFromTemplate.mutate = jest.fn();
  mockCreateFromTemplate.options = undefined;
  mockArchive.options = undefined;
  mockArchive.result = { mutate: jest.fn(), isPending: false, error: null, reset: jest.fn() };
  mockListQuery.mockReturnValue({
    data: [ROUTINE, ACTIVE_ROUTINE],
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

    await openArchiveConfirm(user, 'r1');
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
    await openArchiveConfirm(user, 'r1');

    expect(screen.getByTestId('gym-routines-archive-confirm-error')).toHaveTextContent(
      'You can keep up to 30 routines.',
    );
  });

  it('UX-GYM-15: Archive is not on the row — it lives in the ⋯ menu', async () => {
    await renderScreen();
    expect(screen.queryByTestId('routine-list-item-r1-archive')).toBeNull();
    expect(screen.getByTestId('routine-list-item-r1-more')).toBeOnTheScreen();
  });

  it('UX-GYM-15: archiving the ACTIVE routine says what happens to Today', async () => {
    const user = userEvent.setup();
    await renderScreen();
    await openArchiveConfirm(user, 'r2');

    expect(screen.getByTestId('gym-routines-archive-confirm-title')).toHaveTextContent(
      'Archive your active routine?',
    );
    expect(screen.getByTestId('gym-routines-archive-confirm-body')).toHaveTextContent(
      /is your active routine\. Today will have no workout to start/,
    );
  });

  it('Duplicate moved into the menu still duplicates', async () => {
    const user = userEvent.setup();
    await renderScreen();
    await user.press(screen.getByTestId('routine-list-item-r1-more'));
    await user.press(screen.getByTestId('gym-routines-menu-duplicate'));
    expect(mockDuplicate).toHaveBeenCalledWith({ id: 'r1' });
  });

  describe('From a template (UX-GYM-14)', () => {
    async function openPreview(user: ReturnType<typeof userEvent.setup>) {
      await user.press(screen.getByTestId('gym-routines-create-template'));
      // Tapping a template previews it — nothing is created yet.
      await user.press(screen.getByTestId('gym-routines-template-fb3-beginner-preview'));
    }

    it('previews the days before creating anything', async () => {
      const user = userEvent.setup();
      await renderScreen();
      await openPreview(user);

      expect(mockCreateFromTemplate.mutate).not.toHaveBeenCalled();
      expect(screen.getByTestId('gym-routines-template-preview-day-0')).toBeOnTheScreen();
      expect(screen.getByTestId('gym-routines-template-preview-switch-note')).toHaveTextContent(
        /weekly goal from 4 to 3/,
      );
    });

    it('"Create" keeps the active routine, "Create and switch" activates the new one', async () => {
      const user = userEvent.setup();
      await renderScreen();
      await openPreview(user);

      await user.press(screen.getByTestId('gym-routines-template-create'));
      expect(mockCreateFromTemplate.mutate).toHaveBeenLastCalledWith({
        templateKey: 'fb3-beginner',
        setActive: false,
      });

      await user.press(screen.getByTestId('gym-routines-template-create-switch'));
      expect(mockCreateFromTemplate.mutate).toHaveBeenLastCalledWith({
        templateKey: 'fb3-beginner',
        setActive: true,
      });
    });

    it('switching recomputes the weekly goal from the template; "Create" does not touch it', async () => {
      const user = userEvent.setup();
      await renderScreen();
      await openPreview(user);

      const options = mockCreateFromTemplate.options;
      const created = { name: 'Full Body 3×' };
      await waitFor(() => expect(options?.onSuccess).toBeDefined());

      options?.onSuccess?.(created, { templateKey: 'fb3-beginner', setActive: false });
      expect(mockSaveProfile).not.toHaveBeenCalled();

      options?.onSuccess?.(created, { templateKey: 'fb3-beginner', setActive: true });
      expect(mockSaveProfile).toHaveBeenCalledWith({ weeklyGoal: 3 });
      await waitFor(() =>
        expect(screen.getByTestId('snackbar-message')).toHaveTextContent(/Weekly goal is now 3/),
      );
    });
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
