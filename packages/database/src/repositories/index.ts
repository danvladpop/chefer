export {
  UserRepository,
  userRepository,
  type IUserRepository,
  type FindManyOptions,
  type CreateUserData,
  type UpdateUserData,
} from './user.repository';

export {
  ChefProfileRepository,
  chefProfileRepository,
  type IChefProfileRepository,
  type UpsertChefProfileData,
  type ActivityLevel,
  type BiologicalSex,
  type Goal,
} from './chef-profile.repository';

export {
  DietaryPreferencesRepository,
  dietaryPreferencesRepository,
  type IDietaryPreferencesRepository,
  type UpsertDietaryPreferencesData,
} from './dietary-preferences.repository';

export {
  MealPlanRepository,
  mealPlanRepository,
  type IMealPlanRepository,
  type CreateRecipeData,
  type CreateMealPlanData,
} from './meal-plan.repository';

export {
  FavouriteRecipeRepository,
  favouriteRecipeRepository,
  type IFavouriteRecipeRepository,
  type FavouriteRecipeWithRecipe,
  type CreateManualRecipeData,
} from './favourite-recipe.repository';

export {
  MealRatingRepository,
  mealRatingRepository,
  type IMealRatingRepository,
  type RatingSignal,
} from './meal-rating.repository';

export {
  DailyLogRepository,
  dailyLogRepository,
  type IDailyLogRepository,
  type LoggedMealEntry,
  type UpsertDailyLogData,
} from './daily-log.repository';

export {
  WeightEntryRepository,
  weightEntryRepository,
  type IWeightEntryRepository,
  type CreateWeightEntryData,
} from './weight-entry.repository';

export {
  ChefReviewRepository,
  chefReviewRepository,
  type IChefReviewRepository,
  type UpsertChefReviewData,
} from './chef-review.repository';

export {
  HouseholdMemberRepository,
  householdMemberRepository,
  type IHouseholdMemberRepository,
  type CreateHouseholdMemberData,
  type UpdateHouseholdMemberData,
} from './household-member.repository';

export {
  PantryItemRepository,
  pantryItemRepository,
  type IPantryItemRepository,
  type UpsertPantryItemData,
} from './pantry-item.repository';

export {
  FeedbackRepository,
  feedbackRepository,
  type IFeedbackRepository,
  type CreateFeedbackData,
} from './feedback.repository';

// ─── Gym (gym_plan.md §4.1) ───────────────────────────────────────────────────

export {
  ExerciseRepository,
  exerciseRepository,
  type IExerciseRepository,
  type ExerciseWriteData,
  type CuratedExerciseUpdate,
} from './exercise.repository';

export {
  GymProfileRepository,
  gymProfileRepository,
  type IGymProfileRepository,
  type GymProfileWriteData,
  type GymProfileUpdateData,
  type InitialProgressionData,
  type CompleteSetupData,
} from './gym-profile.repository';

export {
  RoutineRepository,
  routineRepository,
  type IRoutineRepository,
  type RoutineWithDays,
  type RoutineDayWithExercises,
  type RoutineCreateData,
  type RoutineDayWriteData,
  type RoutineExerciseWriteData,
  type RoutineListRow,
  type ReplaceRoutineResult,
} from './routine.repository';

export {
  WorkoutSessionRepository,
  workoutSessionRepository,
  type IWorkoutSessionRepository,
  type SessionWithChildren,
  type SessionExerciseWithSets,
  type SessionDocWriteData,
  type SessionExerciseWriteData,
  type SessionSetWriteData,
  type StoredSessionSnapshot,
  type UpsertSessionResult,
  type UpsertSessionOptions,
  type SessionCursor,
} from './workout-session.repository';

export {
  ExerciseProgressionRepository,
  exerciseProgressionRepository,
  type IExerciseProgressionRepository,
  type ProgressionStateWrite,
} from './exercise-progression.repository';

export {
  TrainingPauseRepository,
  trainingPauseRepository,
  type ITrainingPauseRepository,
  type CreateTrainingPauseData,
} from './training-pause.repository';
