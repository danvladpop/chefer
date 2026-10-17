// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SAFETY_VALUE, toggleQuickSafety } from '@chefer/utils';
import { OnboardingV4 } from './onboarding-v4';
import { ONBOARDING_V4_WELCOME_KEY } from './welcome-card';

// Onboarding V4 (flag `onboardingV4`): step order, the saves the steps send,
// the Premium step's tier gate and the first-week generate → Ready path.
const m = vi.hoisted(() => ({
  push: vi.fn(),
  setJobs: vi.fn(),
  displayPrefs: vi.fn(),
  safety: vi.fn(),
  basics: vi.fn(),
  generate: vi.fn(),
  upgrade: vi.fn(),
  completeSetup: vi.fn(),
  completeSimpleSetup: vi.fn<[Record<string, unknown>], undefined>(),
  flags: { simpleTraining: false },
  requestAiConsent: vi.fn((_feature: string, run: () => void) => run()),
}));

// The health-consent guard has its own tests: here consent is on record.
vi.mock('@/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({
  useAiConsent: () => m.requestAiConsent,
  useAiConsentOpen: () => false,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/features/flags/use-flags', () => ({ useFlags: () => m.flags }));

vi.mock('@/lib/trpc', () => {
  const asyncMutation = (fn: (...a: unknown[]) => unknown) => () => ({
    mutate: fn,
    mutateAsync: fn,
    isPending: false,
  });
  const invalidate = () => ({ invalidate: vi.fn() });
  return {
    trpc: {
      useUtils: () => ({
        preferences: { invalidate: vi.fn(), get: invalidate() },
        dashboard: invalidate(),
        mealPlan: invalidate(),
        shoppingList: invalidate(),
        user: invalidate(),
        profile: invalidate(),
        gym: { bootstrap: { setData: vi.fn(), invalidate: vi.fn() } },
      }),
      preferences: {
        setJobs: { useMutation: asyncMutation((...a) => m.setJobs(...a)) },
        setDisplayPreferences: { useMutation: asyncMutation((...a) => m.displayPrefs(...a)) },
        updateSafety: { useMutation: asyncMutation((...a) => m.safety(...a)) },
        saveProfileBasics: { useMutation: asyncMutation((...a) => m.basics(...a)) },
      },
      mealPlan: {
        generate: { useMutation: asyncMutation((...a) => m.generate(...a)) },
        getForWeek: {
          useQuery: () => ({
            data: {
              days: [
                {
                  dayOfWeek: 1,
                  meals: [
                    {
                      type: 'breakfast',
                      recipe: { name: 'Porridge', nutritionInfo: { calories: 300 } },
                    },
                    {
                      type: 'dinner',
                      recipe: { name: 'Salmon and greens', nutritionInfo: { calories: 480 } },
                    },
                  ],
                },
                {
                  dayOfWeek: 0,
                  meals: [
                    {
                      type: 'dinner',
                      recipe: { name: 'Chicken rice bowl', nutritionInfo: { calories: 520 } },
                    },
                  ],
                },
              ],
            },
          }),
        },
      },
      shoppingList: {
        getForWeek: { useQuery: () => ({ data: { items: new Array(23).fill({}) } }) },
      },
      user: {
        upgradePlan: {
          useMutation: (opts: { onSuccess?: () => void }) => {
            const state = { isPending: false, isSuccess: false, isError: false };
            return {
              ...state,
              mutate: () => {
                m.upgrade();
                opts.onSuccess?.();
              },
            };
          },
        },
      },
      gym: {
        profile: {
          recommend: {
            useQuery: () => ({
              data: {
                recommendedKey: 'fb3-beginner',
                reason: null,
                alternatives: [{ key: 'ul3-beginner', name: 'Upper/Lower 3×', daysPerWeek: 3 }],
              },
              isLoading: false,
            }),
          },
          completeSetup: {
            useMutation: (opts: { onSuccess?: (b: unknown) => void }) => ({
              isPending: false,
              mutate: (input: unknown) => {
                m.completeSetup(input);
                opts.onSuccess?.({});
              },
            }),
          },
          completeSimpleSetup: {
            useMutation: (opts: { onSuccess?: (b: unknown) => void }) => ({
              isPending: false,
              mutate: (input: unknown) => {
                m.completeSimpleSetup(input as Record<string, unknown>);
                opts.onSuccess?.({});
              },
            }),
          },
        },
      },
    },
  };
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.flags.simpleTraining = false;
  window.localStorage.clear();
  m.setJobs.mockResolvedValue({});
  m.displayPrefs.mockResolvedValue({});
  m.safety.mockResolvedValue({});
  m.basics.mockResolvedValue({});
  m.generate.mockResolvedValue({});
});

const cont = () => fireEvent.click(screen.getByTestId('onb-v4-continue'));
const onStep = (step: string) => screen.findByTestId(`onb-v4-step-${step}`);

async function answerJobsAndGoal(jobs: string[], goal = 'LOSE_WEIGHT') {
  for (const job of jobs) fireEvent.click(screen.getByTestId(`v4-job-${job}`));
  cont();
  await onStep('goal');
  fireEvent.click(screen.getByTestId(`v4-goal-${goal}`));
  cont();
  await onStep('aboutYou');
}

describe('OnboardingV4 — step order', () => {
  it('meals + train: jobs → goal → about you → safety → building → ready → premium → train', async () => {
    render(<OnboardingV4 isPremium={false} />);
    await answerJobsAndGoal(['PLAN_MEALS', 'TRAIN']);
    // Four question segments (jobs, goal, about you, safety); this is the third.
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('4');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3');

    // Train picked → the training-day chips are on About you.
    fireEvent.click(screen.getByTestId('v4-weekday-0'));
    fireEvent.click(screen.getByTestId('v4-weekday-2'));
    fireEvent.click(screen.getByTestId('v4-weekday-4'));
    cont();
    await onStep('safety');
    expect(screen.getByTestId('onb-v4-continue').textContent).toBe('Build my week');
    cont();

    await onStep('ready');
    expect(m.setJobs).toHaveBeenLastCalledWith({
      jobs: ['PLAN_MEALS', 'TRAIN'],
      trainingWeekdays: [0, 2, 4],
    });
    expect(m.basics).toHaveBeenCalledWith({ goal: 'LOSE_WEIGHT' });
    expect(m.generate).toHaveBeenCalledWith({ weekOffset: 0 });

    fireEvent.click(screen.getByTestId('v4-ready-continue'));
    await onStep('premium');
    fireEvent.click(screen.getByTestId('v4-premium-later'));
    await onStep('train');
    expect(screen.getByText('Fits your 3 training days')).toBeTruthy();
    fireEvent.click(screen.getByTestId('v4-train-start'));

    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/dashboard'));
    expect(m.completeSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        days: 3,
        experience: 'BEGINNER',
        equipmentAccess: 'FULL_GYM',
        templateKey: 'fb3-beginner',
        plannedWeekdays: [0, 2, 4],
        reminderTime: null,
      }),
    );
    expect(window.localStorage.getItem(ONBOARDING_V4_WELCOME_KEY)).toBe('both');
  });

  it('train only: no safety, no week reveal; finishes on the gym page', async () => {
    render(<OnboardingV4 isPremium={false} />);
    await answerJobsAndGoal(['TRAIN'], 'GAIN_MUSCLE');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('3');
    cont();

    await onStep('premium');
    expect(m.safety).not.toHaveBeenCalled();
    expect(m.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('v4-premium-later'));
    await onStep('train');
    fireEvent.click(screen.getByTestId('v4-train-change'));
    fireEvent.click(screen.getByTestId('v4-train-start'));

    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/gym'));
    expect(m.completeSetup).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'ul3-beginner', plannedWeekdays: [] }),
    );
    expect(window.localStorage.getItem(ONBOARDING_V4_WELCOME_KEY)).toBe('train');
  });

  it('simple training on: "Keep it simple" skips the program and sets up with no routine', async () => {
    m.flags.simpleTraining = true;
    render(<OnboardingV4 isPremium={false} />);
    await answerJobsAndGoal(['TRAIN'], 'GAIN_MUSCLE');
    cont();
    await onStep('premium');
    fireEvent.click(screen.getByTestId('v4-premium-later'));
    await onStep('train');
    // The question comes first; nothing else until it is answered.
    expect(screen.queryByTestId('v4-train-program')).toBeNull();
    fireEvent.click(screen.getByTestId('v4-train-style-classes'));
    expect(screen.queryByTestId('v4-train-exp-BEGINNER')).toBeNull();
    fireEvent.click(screen.getByTestId('v4-train-start'));

    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/gym'));
    // The units from About you; no training days were picked, so no weekly goal is sent.
    expect(m.completeSimpleSetup).toHaveBeenCalledTimes(1);
    const sent = m.completeSimpleSetup.mock.calls[0]?.[0] ?? {};
    expect(Object.keys(sent)).toEqual(['unit']);
    expect(['KG', 'LB']).toContain(sent['unit']);
    expect(m.completeSetup).not.toHaveBeenCalled();
  });

  it('simple training on: "I follow a program" keeps the program and says PROGRESSIVE', async () => {
    m.flags.simpleTraining = true;
    render(<OnboardingV4 isPremium={false} />);
    await answerJobsAndGoal(['TRAIN'], 'GAIN_MUSCLE');
    cont();
    await onStep('premium');
    fireEvent.click(screen.getByTestId('v4-premium-later'));
    await onStep('train');
    fireEvent.click(screen.getByTestId('v4-train-style-program'));
    fireEvent.click(screen.getByTestId('v4-train-start'));

    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/gym'));
    expect(m.completeSetup).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'fb3-beginner', trainingStyle: 'PROGRESSIVE' }),
    );
    expect(m.completeSimpleSetup).not.toHaveBeenCalled();
  });

  it('Premium step is hidden for premium users', async () => {
    render(<OnboardingV4 isPremium />);
    await answerJobsAndGoal(['PLAN_MEALS'], 'GOOD_FOOD');
    // "Just good food" shows no numbers.
    expect(screen.queryByTestId('v4-target-kcal')).toBeNull();
    cont();
    await onStep('safety');
    cont();
    await onStep('ready');
    fireEvent.click(screen.getByTestId('v4-ready-continue'));

    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByTestId('v4-premium')).toBeNull();
    // No goal for "Just good food", and nothing else typed → no profile basics.
    expect(m.basics).not.toHaveBeenCalled();
  });

  it('free users can turn Premium on, then continue', async () => {
    render(<OnboardingV4 isPremium={false} />);
    await answerJobsAndGoal(['TRACK']);
    cont();
    await onStep('safety');
    expect(screen.getByTestId('onb-v4-continue').textContent).toBe('Continue');
    cont();
    await onStep('premium');
    fireEvent.click(screen.getByTestId('v4-premium-turn-on'));
    expect(m.upgrade).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingV4 — safety', () => {
  it('quick chips become the updateSafety payload', async () => {
    render(<OnboardingV4 isPremium />);
    await answerJobsAndGoal(['PLAN_MEALS']);
    cont();
    await onStep('safety');
    expect(screen.getByTestId('v4-safety-everything').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('v4-safety-vegan'));
    fireEvent.click(screen.getByTestId('v4-safety-nuts'));
    expect(screen.getByTestId('v4-safety-everything').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('v4-safety-nuts').getAttribute('aria-pressed')).toBe('true');
    cont();

    await onStep('ready');
    const expected = toggleQuickSafety(toggleQuickSafety(EMPTY_SAFETY_VALUE, 'vegan'), 'nuts');
    expect(expected.allergies).toContain('Tree nuts');
    expect(m.safety).toHaveBeenCalledWith(expected);
  });

  it('"I eat everything" clears the picks again', async () => {
    render(<OnboardingV4 isPremium />);
    await answerJobsAndGoal(['PLAN_MEALS']);
    cont();
    await onStep('safety');
    fireEvent.click(screen.getByTestId('v4-safety-dairy'));
    fireEvent.click(screen.getByTestId('v4-safety-everything'));
    cont();
    await onStep('ready');
    expect(m.safety).toHaveBeenCalledWith(EMPTY_SAFETY_VALUE);
  });
});

describe('OnboardingV4 — building your week', () => {
  async function toBuilding() {
    render(<OnboardingV4 isPremium />);
    await answerJobsAndGoal(['PLAN_MEALS']);
    cont();
    await onStep('safety');
    cont();
  }

  it('waits for generate, then shows the dinners and the list count', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    m.generate.mockReturnValue(new Promise((r) => (resolve = r)));
    await toBuilding();
    await screen.findByTestId('v4-building');
    expect(screen.getByText('Building your week…')).toBeTruthy();

    resolve({});
    await onStep('ready');
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    // One row per day in day order: the dinner, not breakfast.
    expect(rows[0]).toContain('Mon');
    expect(rows[0]).toContain('Chicken rice bowl');
    expect(rows[0]).toContain('520 kcal');
    expect(rows[1]).toContain('Salmon and greens');
    expect(screen.queryByText('Porridge')).toBeNull();
    expect(screen.getByTestId('v4-ready-list').textContent).toBe('23 items on your list');
  });

  it('a failed generate offers Try again and Skip', async () => {
    m.generate.mockRejectedValueOnce(new Error('boom'));
    await toBuilding();
    await screen.findByTestId('v4-building-failed');
    expect(screen.getByText('We couldn’t build your week just now.')).toBeTruthy();

    fireEvent.click(screen.getByTestId('v4-building-retry'));
    await onStep('ready');
    expect(m.generate).toHaveBeenCalledTimes(2);
  });

  it('Skip leaves the reveal out and finishes', async () => {
    m.generate.mockRejectedValueOnce(new Error('boom'));
    await toBuilding();
    fireEvent.click(await screen.findByTestId('v4-building-skip'));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/dashboard'));
    expect(window.localStorage.getItem(ONBOARDING_V4_WELCOME_KEY)).toBe('none');
  });
});
