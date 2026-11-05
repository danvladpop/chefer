import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent } from '@testing-library/react-native';
import { COACHING_DATA_COPY, type ClientFoodDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import TrainerClientRoute from '../../app/trainer/[clientId]/index';
import { renderWithTrpc } from './friends-core-harness';
import { adherence, settle, trainerHandlers, weekSummary } from './trainer-fixtures';

// Lane K2: the client screen's "Last 7 days" card and the Food tab. Food and weight are only asked
// for, and only shown, while the client shares them.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ clientId: 'cmaria000000000000000001' }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const overview = (sharing: { food: boolean; weight: boolean }) => () => ({
  client: { name: 'Maria Pop', since: '2026-09-20T09:00:00.000Z', sharing },
  adherence: adherence(),
  recent: [],
});

const food: ClientFoodDto = {
  numbers: 'FULL',
  sharedSince: '2026-10-02T09:00:00.000Z',
  days: [
    {
      date: '2026-10-07',
      mealsLogged: 2,
      kcal: 1850,
      proteinG: 110,
      targetKcal: 2000,
      targetProteinG: 125,
      plan: { planned: 3, eaten: 2, swapped: 0, skipped: 1 },
      entries: [
        { name: 'Overnight oats', mealType: 'breakfast', kcal: 400, proteinG: 20, onPlan: true },
        { name: 'Shawarma', mealType: 'lunch', kcal: 700, proteinG: 35, onPlan: false },
      ],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('client › Last 7 days and Food', () => {
  it('nothing shared: the card says so, there is no Food tab, and food / weight are never asked', async () => {
    const r = await renderWithTrpc(
      <TrainerClientRoute />,
      trainerHandlers({
        'trainer.client.overview': overview({ food: false, weight: false }),
        'trainer.client.workouts': () => ({ items: [], nextCursor: null }),
        'trainer.client.note': () => null,
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-week-workouts')).toHaveTextContent('2 of 3 workouts');
    expect(screen.getByText(COACHING_DATA_COPY.week.notShared('Maria'))).toBeTruthy();
    expect(screen.queryByTestId('trainer-client-tab-food')).toBeNull();
    expect(r.paths()).not.toContain('trainer.client.food');
    expect(r.paths()).not.toContain('trainer.client.weight');
  });

  it('shared: the card carries food and weight, and the Food tab lists the days', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerClientRoute />,
      trainerHandlers({
        'trainer.client.overview': overview({ food: true, weight: true }),
        'trainer.client.workouts': () => ({ items: [], nextCursor: null }),
        'trainer.client.note': () => null,
        'trainer.client.weekSummary': () =>
          weekSummary({
            sharing: { food: true, weight: true },
            food: {
              numbers: 'FULL',
              daysLogged: 5,
              mealsLogged: 14,
              avgKcal: 1850,
              avgProteinG: 110,
              targetKcal: 2000,
              targetProteinG: 125,
              planAdherence: 0.7,
            },
            weight: { latest: { date: '2026-10-07', weightKg: 64.2 }, changeKg: -0.4 },
          }),
        'trainer.client.food': () => food,
        'trainer.client.weight': () => ({
          sharedSince: '2026-10-02T09:00:00.000Z',
          entries: [
            { date: '2026-09-30', weightKg: 64.6 },
            { date: '2026-10-07', weightKg: 64.2 },
          ],
        }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-week-food')).toHaveTextContent(/1,850 of 2,000 kcal a day/);
    expect(screen.getByTestId('trainer-week-food')).toHaveTextContent(
      /70% of planned meals eaten as planned/,
    );
    expect(screen.getByTestId('trainer-week-weight')).toHaveTextContent(/−0.4 kg in 7 days/);

    await user.press(screen.getByTestId('trainer-client-tab-food'));
    await settle();
    expect(screen.getByTestId('trainer-food-day-2026-10-07')).toHaveTextContent(
      /2 meals · 1,850 \/ 2,000 kcal · 110 \/ 125 g protein · 2 of 3 planned/,
    );
    expect(screen.getByText(`Overnight oats · ${COACHING_DATA_COPY.food.onPlan}`)).toBeTruthy();
    expect(screen.getByTestId('trainer-weight')).toHaveTextContent(/64.2 kg/);
    expect(r.paths()).toEqual(
      expect.arrayContaining(['trainer.client.food', 'trainer.client.weight']),
    );
  });
});
