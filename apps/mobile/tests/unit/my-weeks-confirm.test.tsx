import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import MyWeeksScreen from '../../app/my-weeks';

// UX-X-13: delete / follow a saved week confirm in the shared ConfirmSheet (a
// spinner while the server works, the failure inside the sheet) — not in a
// native Alert that closes before the answer and then fails silently.

const mockDelete = jest.fn();
const mockFollow = jest.fn();
let mockDeleteState: { isPending: boolean; isError: boolean; error: Error | null } = {
  isPending: false,
  isError: false,
  error: null,
};

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('../../src/features/history/past-weeks-section', () => ({
  PastWeeksSection: () => null,
}));
jest.mock('../../src/lib/trpc', () => {
  const idle = { isPending: false, isError: false, error: null, reset: jest.fn() };
  return {
    trpc: {
      useUtils: () => ({
        mealPlan: {
          listTemplates: { invalidate: jest.fn() },
          getForWeek: { invalidate: jest.fn() },
        },
        dashboard: { summary: { invalidate: jest.fn() } },
        tracker: { invalidate: jest.fn() },
        shoppingList: { invalidate: jest.fn() },
      }),
      mealPlan: {
        listTemplates: {
          useQuery: () => ({
            isLoading: false,
            isError: false,
            refetch: jest.fn(),
            data: [
              {
                id: 't1',
                name: 'Busy week',
                mealsCount: 12,
                previewNames: ['Soup'],
                isFollowed: false,
              },
            ],
          }),
        },
        getForWeek: { useQuery: () => ({ data: null }) },
        saveAsTemplate: { useMutation: () => ({ ...idle, mutate: jest.fn() }) },
        followTemplate: { useMutation: () => ({ ...idle, mutate: mockFollow }) },
        unfollowTemplate: { useMutation: () => ({ ...idle, mutate: jest.fn() }) },
        renameTemplate: { useMutation: () => ({ ...idle, mutate: jest.fn() }) },
        deleteTemplate: {
          useMutation: () => ({ ...idle, ...mockDeleteState, mutate: mockDelete }),
        },
      },
    },
  };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <MyWeeksScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteState = { isPending: false, isError: false, error: null };
});

describe('My Weeks confirms (UX-X-13)', () => {
  it('asks to delete in a ConfirmSheet, not a native Alert, and only then deletes', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const user = userEvent.setup();
    await renderScreen();
    await user.press(screen.getByLabelText('Delete Busy week'));
    expect(screen.getByTestId('my-weeks-confirm-title')).toHaveTextContent('Delete this week?');
    expect(mockDelete).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('my-weeks-confirm-confirm'));
    expect(mockDelete).toHaveBeenCalledWith({ templateId: 't1' });
    expect(alert).not.toHaveBeenCalled();
  });

  it('shows why a delete failed inside the sheet', async () => {
    mockDeleteState = {
      isPending: false,
      isError: true,
      error: new Error("Can't reach Chefer right now. Check your connection and try again."),
    };
    const user = userEvent.setup();
    await renderScreen();
    await user.press(screen.getByLabelText('Delete Busy week'));
    expect(screen.getByTestId('my-weeks-confirm-error')).toHaveTextContent(
      "Can't reach Chefer right now",
      { exact: false },
    );
  });

  it('asks before following a week', async () => {
    const user = userEvent.setup();
    await renderScreen();
    await user.press(screen.getByTestId('my-weeks-follow-t1'));
    expect(screen.getByTestId('my-weeks-confirm-title')).toHaveTextContent('Follow this week?');
    await user.press(screen.getByTestId('my-weeks-confirm-confirm'));
    expect(mockFollow).toHaveBeenCalledWith({ templateId: 't1', weekOffset: 0 });
  });
});
