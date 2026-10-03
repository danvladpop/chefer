import { AppState } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  NO_FOOD_NUDGES,
  writeFoodNudgePrefs,
  type FoodNudgePrefs,
} from '../../src/features/notifications/food-nudges';
import { FoodNudgeHost } from '../../src/features/notifications/use-food-nudges';

// UX-PO-08: the root host keeps the scheduled nudges true — it re-plans when the
// stored choice changes, when today's log gains a dinner, and on foreground; and
// it only reads today's log while the dinner nudge is on.

const mockSync = jest.fn<Promise<void>, [{ prefs: FoodNudgePrefs; dinnerLoggedToday: boolean }]>();
jest.mock('../../src/features/notifications/food-nudges', () => ({
  ...jest.requireActual<object>('../../src/features/notifications/food-nudges'),
  syncFoodNudges: (input: { prefs: FoodNudgePrefs; dinnerLoggedToday: boolean }) => mockSync(input),
}));

type Day = { log: { loggedMeals: { mealType: string }[] } | null } | undefined;
let mockDay: Day;
let mockDayError = false;
const mockUseQuery = jest.fn<undefined, [unknown, { enabled: boolean }]>();
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    tracker: {
      getDay: {
        useQuery: (input: unknown, options: { enabled: boolean }) => {
          mockUseQuery(input, options);
          return { data: mockDay, isError: mockDayError };
        },
      },
    },
  },
}));

let foreground: ((status: string) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockSync.mockResolvedValue(undefined);
  mockDay = undefined;
  mockDayError = false;
  foreground = undefined;
  setKvBackendForTests(createMemoryKvBackend());
  writeFoodNudgePrefs(NO_FOOD_NUDGES);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    foreground = handler as (status: string) => void;
    return { remove: jest.fn() };
  });
});

afterEach(() => jest.restoreAllMocks());

describe('FoodNudgeHost', () => {
  it('both off: syncs (to cancel) without reading the day', async () => {
    await render(<FoodNudgeHost signedIn />);
    await waitFor(() =>
      expect(mockSync).toHaveBeenCalledWith({ prefs: NO_FOOD_NUDGES, dinnerLoggedToday: false }),
    );
    expect(mockUseQuery.mock.calls[0]?.[1]).toMatchObject({ enabled: false });
  });

  it('signed out: does nothing', async () => {
    writeFoodNudgePrefs({ dinner: true, planSunday: true });
    await render(<FoodNudgeHost signedIn={false} />);
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockUseQuery.mock.calls[0]?.[1]).toMatchObject({ enabled: false });
  });

  it('dinner on: waits for today’s log, then schedules with what it says', async () => {
    writeFoodNudgePrefs({ dinner: true, planSunday: false });
    const view = await render(<FoodNudgeHost signedIn />);
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockUseQuery.mock.calls[0]?.[1]).toMatchObject({ enabled: true });

    mockDay = { log: { loggedMeals: [{ mealType: 'breakfast' }] } };
    await view.rerender(<FoodNudgeHost signedIn />);
    await waitFor(() =>
      expect(mockSync).toHaveBeenLastCalledWith({
        prefs: { dinner: true, planSunday: false },
        dinnerLoggedToday: false,
      }),
    );
  });

  it('logging dinner re-plans so tonight’s nudge is dropped', async () => {
    writeFoodNudgePrefs({ dinner: true, planSunday: false });
    mockDay = { log: null };
    const view = await render(<FoodNudgeHost signedIn />);
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));

    mockDay = { log: { loggedMeals: [{ mealType: 'Dinner' }] } };
    await view.rerender(<FoodNudgeHost signedIn />);
    await waitFor(() =>
      expect(mockSync).toHaveBeenLastCalledWith({
        prefs: { dinner: true, planSunday: false },
        dinnerLoggedToday: true,
      }),
    );
  });

  it('a failed day read still schedules (better a nudge than none)', async () => {
    writeFoodNudgePrefs({ dinner: true, planSunday: false });
    mockDayError = true;
    await render(<FoodNudgeHost signedIn />);
    await waitFor(() =>
      expect(mockSync).toHaveBeenCalledWith({
        prefs: { dinner: true, planSunday: false },
        dinnerLoggedToday: false,
      }),
    );
  });

  it('a change of the stored choice re-plans, and returning to the app does too', async () => {
    mockDay = { log: null };
    await render(<FoodNudgeHost signedIn />);
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));

    await act(() => {
      writeFoodNudgePrefs({ dinner: false, planSunday: true });
    });
    await waitFor(() =>
      expect(mockSync).toHaveBeenLastCalledWith({
        prefs: { dinner: false, planSunday: true },
        dinnerLoggedToday: false,
      }),
    );

    const calls = mockSync.mock.calls.length;
    await act(() => {
      foreground?.('active');
    });
    expect(mockSync.mock.calls.length).toBe(calls + 1);
  });
});
