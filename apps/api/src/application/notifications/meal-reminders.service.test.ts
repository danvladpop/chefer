import { describe, expect, it, vi } from 'vitest';
import type { IChefProfileRepository, IDietaryPreferencesRepository } from '@chefer/database';
import type { MealReminders } from '@chefer/types';
import { MealRemindersService } from './meal-reminders.service';

const USER = 'user-1';

function makeService(stored: unknown, planSlots: string[] = [], planDays: number[] = []) {
  let mealReminders = stored;
  const profiles = {
    findByUserId: vi.fn(async () => ({ mealReminders })),
    upsert: vi.fn(async (_userId: string, data: { mealReminders?: unknown }) => {
      mealReminders = data.mealReminders;
      return { mealReminders };
    }),
    delete: vi.fn(),
  } as unknown as IChefProfileRepository;
  const dietary = {
    findByUserId: vi.fn(async () => ({ planSlots, planDays })),
    upsert: vi.fn(),
    delete: vi.fn(),
  } as unknown as IDietaryPreferencesRepository;
  return { service: new MealRemindersService(profiles, dietary), profiles };
}

describe('MealRemindersService', () => {
  it('pre-fills defaults from the legacy plan shape for a never-chosen user', async () => {
    const { service } = makeService(null);
    await expect(service.get(USER)).resolves.toEqual({
      reminders: {
        enabled: false,
        times: { breakfast: '08:00', lunch: '12:30', dinner: '18:30', snack: null },
      },
      chosen: false,
      planSlots: ['breakfast', 'lunch', 'dinner'],
      planDays: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it('pre-fills only the planned meals, ignoring unknown stored slot names', async () => {
    const { service } = makeService(null, ['dinner', 'snack', 'brunch'], [0, 1, 2, 3, 4]);
    const dto = await service.get(USER);
    expect(dto.planSlots).toEqual(['dinner', 'snack']);
    expect(dto.reminders.times).toEqual({
      breakfast: null,
      lunch: null,
      dinner: '18:30',
      snack: '16:00',
    });
    expect(dto.planDays).toEqual([0, 1, 2, 3, 4]);
  });

  it('stores the choice and reads it back as chosen', async () => {
    const { service, profiles } = makeService(null);
    const next: MealReminders = {
      enabled: true,
      times: { breakfast: null, lunch: '13:00', dinner: '19:15', snack: null },
    };
    const dto = await service.set(USER, next);
    expect(profiles.upsert).toHaveBeenCalledWith(USER, { mealReminders: next });
    expect(dto).toMatchObject({ reminders: next, chosen: true });
  });

  it('treats a malformed stored value as never chosen', async () => {
    const { service } = makeService({ enabled: 'yes' });
    await expect(service.get(USER)).resolves.toMatchObject({ chosen: false });
  });
});
