import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// Lane E1 mealtime reminders: notifications.getMealReminders /
// setMealReminders, the server-side choice the phone schedules from.
// Registers ONE throwaway user.

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('meal-reminders'),
    password: 'Contract@123!',
    firstName: 'Reminders',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
});

describe('notifications.getMealReminders / setMealReminders (lane E1)', () => {
  it('starts unchosen and off, pre-filled from the default plan shape', async () => {
    const fresh = await client.notifications.getMealReminders.query();
    expect(fresh).toEqual({
      reminders: {
        enabled: false,
        times: { breakfast: '08:00', lunch: '12:30', dinner: '18:30', snack: null },
      },
      chosen: false,
      planSlots: ['breakfast', 'lunch', 'dinner'],
      planDays: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it('stores the choice and reads it back', async () => {
    const next = {
      enabled: true,
      times: { breakfast: null, lunch: '13:00', dinner: '19:15', snack: '16:00' },
    };
    const saved = await client.notifications.setMealReminders.mutate(next);
    expect(saved).toMatchObject({ reminders: next, chosen: true });
    expect((await client.notifications.getMealReminders.query()).reminders).toEqual(next);
  });

  it('rejects a time off the 5-minute grid', async () => {
    await expect(
      client.notifications.setMealReminders.mutate({
        enabled: true,
        times: { breakfast: '08:03', lunch: null, dinner: null, snack: null },
      }),
    ).rejects.toBeTruthy();
  });
});
