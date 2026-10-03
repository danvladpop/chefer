import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackMealLogged, trackOnboardingCompleted } from './analytics-events';

const capture = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ capture }));

beforeEach(() => capture.mockClear());

describe('trackMealLogged', () => {
  it('sends the source and a plan-slot meal type', () => {
    trackMealLogged('planned', 'dinner');
    expect(capture).toHaveBeenCalledWith('meal_logged', { source: 'planned', mealType: 'dinner' });
  });

  it('drops a meal type that is not one of the four slots (never free text)', () => {
    trackMealLogged('quick', 'second breakfast');
    expect(capture).toHaveBeenCalledWith('meal_logged', { source: 'quick' });
    trackMealLogged('snap', undefined);
    expect(capture).toHaveBeenLastCalledWith('meal_logged', { source: 'snap' });
  });
});

describe('trackOnboardingCompleted', () => {
  it('sends trainingStyles only when there are some', () => {
    trackOnboardingCompleted(['PLAN_WEEK'], []);
    expect(capture).toHaveBeenLastCalledWith('onboarding_completed', { jobs: ['PLAN_WEEK'] });
    trackOnboardingCompleted(['PLAN_WEEK'], ['strength']);
    expect(capture).toHaveBeenLastCalledWith('onboarding_completed', {
      jobs: ['PLAN_WEEK'],
      trainingStyles: ['strength'],
    });
  });
});
