import {
  chefProfileRepository,
  dietaryPreferencesRepository,
  type IChefProfileRepository,
  type IDietaryPreferencesRepository,
} from '@chefer/database';
import {
  planSlotSchema,
  type MealReminders,
  type MealRemindersDto,
  type PlanSlot,
} from '@chefer/types';
import {
  defaultMealReminders,
  parseStoredMealReminders,
  resolvePlanDays,
  resolvePlanSlots,
} from '@chefer/utils';

// ─── Meal-time reminders (market review 2026-10, lane E1) ────────────────────
// The stored choice behind the phone's local meal-time notifications. The
// server never sends anything: it keeps `{ enabled, times }` on the chef
// profile so the onboarding offer, mobile Settings and the web Settings card
// all read and write one value. A never-chosen user gets defaults pre-filled
// from their planned meals (the resolved plan shape).

export class MealRemindersService {
  constructor(
    private readonly profiles: IChefProfileRepository = chefProfileRepository,
    private readonly dietary: IDietaryPreferencesRepository = dietaryPreferencesRepository,
  ) {}

  async get(userId: string): Promise<MealRemindersDto> {
    const [profile, prefs] = await Promise.all([
      this.profiles.findByUserId(userId),
      this.dietary.findByUserId(userId),
    ]);
    const storedSlots = (prefs?.planSlots ?? []).flatMap((raw): PlanSlot[] => {
      const slot = planSlotSchema.safeParse(raw);
      return slot.success ? [slot.data] : [];
    });
    const planSlots = [...resolvePlanSlots(storedSlots)];
    const planDays = [...resolvePlanDays(prefs?.planDays ?? [])];
    const stored = parseStoredMealReminders(profile?.mealReminders ?? null);
    return {
      reminders: stored ?? defaultMealReminders(planSlots),
      chosen: stored !== null,
      planSlots,
      planDays,
    };
  }

  async set(userId: string, reminders: MealReminders): Promise<MealRemindersDto> {
    await this.profiles.upsert(userId, { mealReminders: reminders });
    return this.get(userId);
  }
}

export const mealRemindersService = new MealRemindersService();
