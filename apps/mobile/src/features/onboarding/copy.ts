// Onboarding copy (technical-plan.md §2.10 / T-00.6, filled in by L-HOME
// wave 2 — UX-03 "Onboarding by job"). Every user-facing string in the jobs
// step, training-days step, How-you-cook step and the goal step's "Just
// good food" card lives here so it can't drift between mobile and web
// (same copy table, `03-ux-design-spec.md` §UX-03). Scanned by the
// `chefer/no-forbidden-copy` ESLint rule (base.js).

export type OnboardingCopyKey =
  | 'jobsTitle'
  | 'jobsHelper'
  | 'continueSkip'
  | 'jobTrainTitle'
  | 'jobTrainDetail'
  | 'jobPlanMealsTitle'
  | 'jobPlanMealsDetail'
  | 'jobHouseholdTitle'
  | 'jobHouseholdDetail'
  | 'jobUseWhatIHaveTitle'
  | 'jobUseWhatIHaveDetail'
  | 'jobSavedRecipesTitle'
  | 'jobSavedRecipesDetail'
  | 'jobTrackTitle'
  | 'jobTrackDetail'
  | 'trainingDaysTitle'
  | 'trainingDaysHelper'
  | 'trainingDaysNotSure'
  | 'trainingDaysRunQuestion'
  | 'currencyHelper'
  | 'unitsSwitchedToMetric'
  | 'unitsSwitchedToImperial'
  | 'goodFoodTitle'
  | 'goodFoodDetail'
  | 'autoPlanQuestion'
  | 'autoPlanHelper'
  | 'finishFood'
  | 'finishTrainFood'
  | 'generatingWeek'
  | 'generatingFailed'
  | 'settingsAddTrain'
  | 'settingsAddFood';

export const ONBOARDING_COPY: Record<OnboardingCopyKey, string> = {
  jobsTitle: 'What should Chefer help with?',
  jobsHelper: 'Pick all that fit. You can change this any time in Settings.',
  continueSkip: 'Just looking around',
  jobTrainTitle: 'Train',
  jobTrainDetail: 'Workouts that tell you what to lift next. Free.',
  jobPlanMealsTitle: 'Plan my meals',
  jobPlanMealsDetail: 'A week of meals that fits your time and taste, with one shopping list.',
  jobHouseholdTitle: 'Feed my household',
  jobHouseholdDetail: 'One plan for everyone at my table, allergies included.',
  jobUseWhatIHaveTitle: 'Use what I have',
  jobUseWhatIHaveDetail: 'Keep track of what’s in my kitchen and use it first.',
  jobSavedRecipesTitle: 'Cook my saved recipes',
  jobSavedRecipesDetail: 'Keep recipes from links and videos, and plan with them.',
  jobTrackTitle: 'Track what I eat',
  jobTrackDetail: 'Log meals fast against my own calorie and protein targets.',
  trainingDaysTitle: 'Which days do you usually train?',
  trainingDaysHelper:
    'We’ll plan more food on these days and remind you to train. You can change them any time.',
  trainingDaysNotSure: 'Not sure yet',
  trainingDaysRunQuestion: 'Do you also run or ride?',
  currencyHelper: 'We guessed from your phone’s region — change it if it’s wrong.',
  unitsSwitchedToMetric: 'Switched to metric because you entered cm and kg.',
  unitsSwitchedToImperial: 'Switched to imperial because you entered ft and lb.',
  goodFoodTitle: 'Just good food',
  goodFoodDetail: 'No calorie target. We’ll plan balanced meals and never count for you.',
  autoPlanQuestion: 'Plan my next week automatically every Sunday?',
  autoPlanHelper: 'We’ll have next week ready on Monday. You can change this any time.',
  finishFood: 'Plan my first week',
  finishTrainFood: 'Next: set up training',
  generatingWeek: 'Planning your week…',
  generatingFailed: 'We couldn’t plan your week just now.',
  settingsAddTrain: 'Set up training now',
  settingsAddFood: 'Set up your food — 3 quick questions',
};
