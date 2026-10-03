import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import CookModeScreen from '../../app/cook/[id]';
import { resetCookSessionsForTests } from '../../src/features/recipes/cook-session-store';

// UX-COOK-01 / 04 / 05 (WP-11): step timers survive step changes, show in the
// header, buzz and notify at zero; each step lists its scaled ingredient
// amounts; the recipe page's servings arrive; "Log this meal" has a slot
// chooser and an Undo.

let mockParams: Record<string, string> = { id: 'r1' };
const mockLog = jest.fn();
const mockUnlog = jest.fn();

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notif-1')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ dispatch: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({
    memberCount: 0,
    tablePortions: null,
    portionSum: null,
    scaledMembers: null,
  }),
}));
jest.mock('../../src/hooks/use-cooking-for', () => ({ useCookingFor: () => null }));
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => 'METRIC' }));
jest.mock('../../src/features/tracker/rebalance-store', () => ({ recordRebalance: jest.fn() }));
jest.mock('../../src/features/tracker/rebalance-banner', () => ({ RebalanceBanner: () => null }));
jest.mock('../../src/features/recipes/star-rating', () => ({ StarRating: () => null }));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: { getDay: { invalidate: jest.fn() }, weeklySummary: { invalidate: jest.fn() } },
      dashboard: { summary: { invalidate: jest.fn() } },
    }),
    mealPlan: {
      getRecipe: {
        useQuery: () => ({
          isLoading: false,
          data: {
            id: 'r1',
            name: 'Lentil Curry',
            servings: 2,
            allergenWarnings: [],
            instructions: [
              'Fry the onion in oil.',
              'Add the lentils and simmer for 10 minutes.',
              'Season with salt and serve.',
            ],
            ingredients: [
              { name: 'lentils', quantity: 200, unit: 'g' },
              { name: 'onion', quantity: 1, unit: '' },
              { name: 'olive oil', quantity: 2, unit: 'tbsp' },
              { name: 'salt', quantity: 1, unit: 'to taste' },
            ],
          },
        }),
      },
    },
    recipe: { getSafetyChecks: { useQuery: () => ({ data: { safetyChecks: null } }) } },
    tracker: {
      logRecipe: {
        useMutation: (opts: { onSuccess?: (r: unknown, v: unknown) => void }) => ({
          mutate: (input: unknown) => {
            mockLog(input);
            opts.onSuccess?.({ rebalance: null }, input);
          },
          isPending: false,
          isError: false,
        }),
      },
      unlogRecipe: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            mockUnlog(input);
            opts.onSuccess?.();
          },
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function renderCook() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <CookModeScreen />
    </SafeAreaProvider>,
  );
}

const next = () => fireEvent.press(screen.getByTestId('cook-next'));

/** Run a few pending promises (permission check + schedule) inside act. */
const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-03T12:00:00Z') });
  mockParams = { id: 'r1' };
  resetCookSessionsForTests();
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Cook mode step timers (UX-COOK-01)', () => {
  it('a running timer survives a step change and shows in the header', async () => {
    await renderCook();
    await next(); // step 2 has a 10 minute timer
    expect(screen.queryByTestId('cook-timer-chips')).toBeNull();
    await fireEvent.press(screen.getByTestId('step-timer'));
    await flush();
    expect(screen.getByTestId('step-timer')).toHaveTextContent(/10:00/);

    await act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('step-timer')).toHaveTextContent(/9:30/);

    await next(); // step 3 — the timer keeps running, now only in the header
    expect(screen.queryByTestId('step-timer')).toBeNull();
    await act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('cook-timer-chip-1')).toHaveTextContent(/Step 2 · 9:00/);

    // Tapping the chip jumps back to its step.
    await fireEvent.press(screen.getByTestId('cook-timer-chip-1'));
    expect(screen.getByTestId('cook-step-text')).toHaveTextContent(/simmer for 10 minutes/);
    expect(screen.getByTestId('step-timer')).toHaveTextContent(/9:00/);
  });

  it('schedules a local notification at the end when it starts, and cancels it on pause', async () => {
    await renderCook();
    await next();
    await fireEvent.press(screen.getByTestId('step-timer'));
    await flush();
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    expect(schedule).toHaveBeenCalledTimes(1);
    const [[request]] = schedule.mock.calls as [[{ trigger: { date: number } }]];
    expect(request.trigger.date).toBe(Date.now() + 600_000);

    await act(() => {
      jest.advanceTimersByTime(5000);
    });
    await fireEvent.press(screen.getByTestId('step-timer')); // pause
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    expect(screen.getByTestId('step-timer-reset')).toBeOnTheScreen();
  });

  it('buzzes and reads "Time!" at zero, once', async () => {
    await renderCook();
    await next();
    await fireEvent.press(screen.getByTestId('step-timer'));
    await flush();
    await act(() => {
      jest.advanceTimersByTime(600_000 + 1000);
    });
    expect(screen.getByTestId('step-timer')).toHaveTextContent(/Time!/);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
    await act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('finishing the recipe cancels a timer still running', async () => {
    await renderCook();
    await next();
    await fireEvent.press(screen.getByTestId('step-timer'));
    await flush();
    await next();
    await next(); // Finish
    expect(screen.getByTestId('cook-finished')).toBeOnTheScreen();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
  });

  it('leaving and coming back keeps the timer counting', async () => {
    const first = await renderCook();
    await next();
    await fireEvent.press(screen.getByTestId('step-timer'));
    await flush();
    await act(() => {
      jest.advanceTimersByTime(60_000);
    });
    await first.unmount();
    await act(() => {
      jest.advanceTimersByTime(60_000);
    });

    await renderCook();
    expect(screen.getByTestId('step-timer')).toHaveTextContent(/8:00/);
  });
});

describe('Cook mode step amounts (UX-COOK-04)', () => {
  it("lists the step's ingredients with scaled amounts", async () => {
    await renderCook();
    const card = screen.getByTestId('cook-step-amounts');
    expect(card).toHaveTextContent(/1/);
    expect(card).toHaveTextContent(/onion/);
    expect(card).toHaveTextContent(/2 tbsp/);
    expect(card).toHaveTextContent(/olive oil/);
    expect(card).toHaveTextContent(/For 2 servings/);
  });

  it('follows the servings the recipe page passed (UX-COOK-05)', async () => {
    mockParams = { id: 'r1', servings: '6' };
    await renderCook();
    const card = screen.getByTestId('cook-step-amounts');
    expect(card).toHaveTextContent(/For 6 servings/);
    expect(card).toHaveTextContent(/6 tbsp/);
    await fireEvent.press(screen.getByTestId('cook-ingredients-toggle'));
    expect(screen.getByTestId('cook-servings')).toHaveTextContent(/6/);
  });

  it('shares the stepper cap with the recipe page (20)', async () => {
    mockParams = { id: 'r1', servings: '20' };
    await renderCook();
    await fireEvent.press(screen.getByTestId('cook-ingredients-toggle'));
    await fireEvent.press(screen.getByTestId('cook-servings-inc'));
    expect(screen.getByTestId('cook-servings')).toHaveTextContent(/20/);
  });

  it('ignores a junk servings param', async () => {
    mockParams = { id: 'r1', servings: 'lots' };
    await renderCook();
    expect(screen.getByTestId('cook-step-amounts')).toHaveTextContent(/For 2 servings/);
  });
});

describe('Cook mode "Log this meal" (UX-COOK-04)', () => {
  const finish = async () => {
    await next();
    await next();
    await next();
  };

  it('logs under the slot you pick, not the clock', async () => {
    mockParams = { id: 'r1', meal: 'dinner' };
    await renderCook();
    await finish();
    await fireEvent.press(screen.getByTestId('cook-slot-snack'));
    await fireEvent.press(screen.getByTestId('cook-log'));
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ mealType: 'snack' }));
    expect(screen.getByTestId('cook-logged-as')).toHaveTextContent(/Logged as snack/);
  });

  it('presets the slot from the plan', async () => {
    mockParams = { id: 'r1', meal: 'breakfast' };
    await renderCook();
    await finish();
    await fireEvent.press(screen.getByTestId('cook-log'));
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ mealType: 'breakfast' }));
  });

  it('Undo takes the log back and shows the chooser again', async () => {
    mockParams = { id: 'r1', meal: 'lunch' };
    await renderCook();
    await finish();
    await fireEvent.press(screen.getByTestId('cook-log'));
    await fireEvent.press(screen.getByTestId('cook-log-undo'));
    expect(mockUnlog).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r1', mealType: 'lunch' }),
    );
    expect(screen.getByTestId('cook-slot')).toBeOnTheScreen();
    expect(screen.getByTestId('cook-log')).toHaveTextContent(/Log this meal/);
  });
});
