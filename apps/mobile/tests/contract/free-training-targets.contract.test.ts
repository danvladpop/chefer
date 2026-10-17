import { beforeAll, describe, expect, it } from 'vitest';
import { PLAN_FEATURES } from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// WP-07 ("Premium is for heavy AI only"): training-day nutrition has no AI, so
// a FREE muscle-gain lifter gets the training-day targets applied — on Today
// (dashboard.summary), the tracker and the plan view — and the plan features
// say so. Against the REAL API. The goal is set while the Premium toggle is on
// (profile setup is a premium action), then the account is switched back to
// Free for every assertion.

const { client, setToken } = makeContractClient();

const today = new Date();
const TODAY = localDateStr(today);
const todayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;
// Train today, plus three other days (distinct weekdays).
const plannedWeekdays = [
  ...new Set([todayIndex, (todayIndex + 2) % 7, (todayIndex + 3) % 7, (todayIndex + 5) % 7]),
].sort();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('free-training'),
    password: 'Contract@123!',
    firstName: 'Lifter',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);

  await client.user.upgradePlan.mutate();
  await client.preferences.setup.mutate({
    goal: 'GAIN_MUSCLE',
    biologicalSex: 'MALE',
    age: 28,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'MODERATELY_ACTIVE',
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
    cuisinePreferences: [],
    mealsPerDay: 3,
  });
  await client.user.downgradePlan.mutate();
  expect((await client.user.me.query()).planTier).toBe('FREE');

  await client.gym.profile.completeSetup.mutate({
    days: plannedWeekdays.length,
    experience: 'INTERMEDIATE',
    equipmentAccess: 'FULL_GYM',
    unit: 'KG',
    templateKey: 'ul4-intermediate',
    plannedWeekdays,
    reminderTime: null,
  });
  await client.mealPlan.generate.mutate({ weekOffset: 0 });
}, 60_000);

describe('a Free muscle-gain user gets training-day targets', () => {
  it('Today applies the bump: higher kcal and protein than a rest day, same numbers as the tracker', async () => {
    const summary = await client.dashboard.summary.query({ localDate: TODAY, localHour: 9 });
    const training = summary.nutrition.trainingDay;
    expect(training).toMatchObject({ isTrainingDay: true, applied: true });
    expect(training?.kcalBonus).toBeGreaterThanOrEqual(150);
    const adjusted = summary.nutrition.adjustedTargets;
    if (!adjusted) throw new Error('expected adjusted targets for a free lifter on a training day');
    expect(adjusted.proteinG).toBeGreaterThan(summary.nutrition.protein.targetG);

    const day = await client.tracker.getDay.query({ date: TODAY });
    expect(day.trainingDay).toMatchObject({ isTrainingDay: true, applied: true });
    expect(day.adjustedTargets).toEqual(summary.nutrition.adjustedTargets);
  });

  it('the plan view marks the training day as applied, not as a locked preview', async () => {
    const week = await client.mealPlan.getForWeek.query({ weekOffset: 0 });
    const trainingDay = week?.trainingDays?.find((d) => d.dayOfWeek === todayIndex);
    expect(trainingDay).toMatchObject({ applied: true });
  });

  it('the plan-feature matrix says free for week rebalance and training-day nutrition', () => {
    expect(PLAN_FEATURES.weekRebalance).toMatchObject({ free: true, premium: true });
    expect(PLAN_FEATURES.trainingNutrition.free).toBe(true);
    expect(PLAN_FEATURES.trainingDayTargets.free).toBe(true);
    // Heavy AI stays premium.
    expect(PLAN_FEATURES.photoLogging.free).toBe(false);
    expect(PLAN_FEATURES.aiMealPlans.free).toBe(false);
  });
});
