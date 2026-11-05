import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { MealRemindersDto } from '@chefer/types';
import { MealReminderSettings } from '../../src/features/notifications/meal-reminder-settings';

// Lane E1: Settings → Notifications "Mealtime reminders" — the master switch
// asks the OS, each meal has its own switch and time, and every change saves
// the server-side choice the phone schedules from.

const DTO: MealRemindersDto = {
  reminders: {
    enabled: true,
    times: { breakfast: '08:00', lunch: '12:30', dinner: '18:30', snack: null },
  },
  chosen: true,
  planSlots: ['breakfast', 'lunch', 'dinner'],
  planDays: [0, 1, 2, 3, 4, 5, 6],
};

let mockData: MealRemindersDto = DTO;
const mockMutate = jest.fn<undefined, [unknown]>();
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      notifications: {
        getMealReminders: {
          cancel: jest.fn(),
          getData: jest.fn(),
          setData: jest.fn(),
          invalidate: jest.fn(),
        },
      },
    }),
    notifications: {
      getMealReminders: { useQuery: () => ({ data: mockData }) },
      setMealReminders: {
        useMutation: () => ({ mutate: (input: unknown) => mockMutate(input), isPending: false }),
      },
    },
  },
}));

jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

let mockPermission: 'granted' | 'denied' | 'undetermined' = 'granted';
jest.mock('../../src/lib/use-notification-permission', () => ({
  useNotificationPermission: () => mockPermission,
  refreshNotificationPermission: jest.fn(),
}));
let mockAllowed = true;
jest.mock('../../src/features/gym/reminders/permission', () => ({
  ensureGymReminderPermission: () => Promise.resolve(mockAllowed),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderSettings() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <MealReminderSettings testIDPrefix="meals" />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockData = DTO;
  mockPermission = 'granted';
  mockAllowed = true;
});

describe('MealReminderSettings', () => {
  it('shows each meal with its time and switch while on', async () => {
    await renderSettings();
    expect(screen.getByTestId('meals-master')).toHaveProp('value', true);
    expect(screen.getByTestId('meals-breakfast-time')).toHaveTextContent('08:00');
    expect(screen.getByTestId('meals-dinner-time')).toHaveTextContent('18:30');
    expect(screen.getByTestId('meals-snack')).toHaveProp('value', false);
    expect(screen.queryByTestId('meals-snack-time')).toBeNull();
  });

  it('turning a meal off saves a null time; turning one on pre-fills its suggested time', async () => {
    await renderSettings();
    await fireEvent(screen.getByTestId('meals-lunch'), 'valueChange', false);
    expect(mockMutate).toHaveBeenLastCalledWith({
      enabled: true,
      times: { ...DTO.reminders.times, lunch: null },
    });
    await fireEvent(screen.getByTestId('meals-snack'), 'valueChange', true);
    expect(mockMutate).toHaveBeenLastCalledWith({
      enabled: true,
      times: { ...DTO.reminders.times, snack: '16:00' },
    });
  });

  it('changing a time saves it from the picker sheet', async () => {
    const user = userEvent.setup();
    await renderSettings();
    await user.press(screen.getByTestId('meals-dinner-time'));
    await user.press(screen.getByTestId('meals-time-save'));
    expect(mockMutate).toHaveBeenLastCalledWith({
      enabled: true,
      times: { ...DTO.reminders.times, dinner: '18:30' },
    });
  });

  it('switching on asks the OS; a refusal saves nothing and shows the off row', async () => {
    mockData = { ...DTO, reminders: { ...DTO.reminders, enabled: false } };
    mockAllowed = false;
    await renderSettings();
    expect(screen.queryByTestId('meals-breakfast')).toBeNull();
    await fireEvent(screen.getByTestId('meals-master'), 'valueChange', true);
    await waitFor(() => expect(screen.getByTestId('meals-off')).toBeOnTheScreen());
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('an allowed ask saves the master switch on', async () => {
    mockData = { ...DTO, reminders: { ...DTO.reminders, enabled: false } };
    await renderSettings();
    await fireEvent(screen.getByTestId('meals-master'), 'valueChange', true);
    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith({ ...DTO.reminders, enabled: true }),
    );
  });
});
