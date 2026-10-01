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
  type PlanMealSlotJson,
} from './meal-plan.repository';

export {
  MealPlanTailoringRepository,
  mealPlanTailoringRepository,
  stableSlotsJson,
  type IMealPlanTailoringRepository,
  type CreateTailoringData,
  type TailoringProgressPatch,
  type TailoringSnapshots,
  type TailoringUserGate,
} from './meal-plan-tailoring.repository';

export {
  FavouriteRecipeRepository,
  favouriteRecipeRepository,
  type IFavouriteRecipeRepository,
  type FavouriteRecipeWithRecipe,
  type CreateManualRecipeData,
  type ManualRecipeLines,
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

// ─── Weekly emails (audit P2-5) ───────────────────────────────────────────────

export {
  WeeklyEmailRepository,
  weeklyEmailRepository,
  type IWeeklyEmailRepository,
  type WeeklyEmailKind,
  type WeeklyEmailRecipient,
  type WeeklyEmailPreferences,
  type WeekLogRow,
} from './weekly-email.repository';

// ─── Wave-0 schema contracts (T-00.10) ─────────────────────────────────────────

export {
  SafetyReportRepository,
  safetyReportRepository,
  type ISafetyReportRepository,
  type CreateSafetyReportData,
} from './safety-report.repository';

export {
  TargetChangeRepository,
  targetChangeRepository,
  type ITargetChangeRepository,
  type CreateTargetChangeData,
} from './target-change.repository';

export {
  IngredientPriceRepository,
  ingredientPriceRepository,
  type IIngredientPriceRepository,
  type IngredientCatalogRow,
} from './ingredient-price.repository';

export {
  ConsentEventRepository,
  consentEventRepository,
  type IConsentEventRepository,
  type RecordConsentEventData,
} from './consent-event.repository';

// ─── Following (docs/friends/implementation-plan.md §2.4) ──────────────────────

export {
  SocialProfileRepository,
  socialProfileRepository,
  socialUserSelect,
  type ISocialProfileRepository,
  type SocialDbClient,
  type SocialKeysetCursor,
  type SocialUserRow,
  type SocialProfileWithUser,
  type SocialSearchCursor,
  type PopularProfileRow,
  type CreateSocialProfileData,
  type UpdateSocialProfileData,
  type DeleteCascadeSocialResult,
} from './social-profile.repository';

export {
  FollowRepository,
  followRepository,
  type IFollowRepository,
  type CreateFollowData,
  type FollowPair,
  type FollowCounts,
  type MutualCandidateRow,
  type ExpiredFollowRequest,
} from './follow.repository';

export { BlockRepository, blockRepository, type IBlockRepository } from './block.repository';

export {
  SuggestionDismissalRepository,
  suggestionDismissalRepository,
  type ISuggestionDismissalRepository,
} from './suggestion-dismissal.repository';

export {
  UserReportRepository,
  userReportRepository,
  type IUserReportRepository,
  type CreateUserReportData,
  type ReportCountsSince,
} from './user-report.repository';

export {
  ModerationRepository,
  moderationRepository,
  type IModerationRepository,
  type ModerationLogEntry,
  type ModerationWeeklyCounts,
  type FilterableRecipeRow,
} from './moderation.repository';

export {
  NotificationRepository,
  notificationRepository,
  type INotificationRepository,
  type SocialNotificationData,
} from './notification.repository';

export {
  FriendRecipeRepository,
  friendRecipeRepository,
  type IFriendRecipeRepository,
  type ListSharedRecipesOptions,
} from './friend-recipe.repository';

export {
  RecipeLineRepository,
  recipeLineRepository,
  toIngredientsMirror,
  toLineRows,
  toNutritionColumns,
  type IRecipeLineRepository,
  type RecipeLineWrite,
  type RecipeNutritionFacts,
  type RecipeNutritionWrite,
  type RecipeForRecompute,
  type StoredRecipeLineRow,
} from './recipe-line.repository';

export {
  IngredientRepository,
  ingredientRepository,
  type IIngredientRepository,
  type CatalogIngredientRow,
  type IngredientKeyMatch,
  type PrivateIngredientData,
  type PrivateReviewRow,
} from './ingredient.repository';

export {
  IngredientNoticeRepository,
  ingredientNoticeRepository,
  type IIngredientNoticeRepository,
} from './ingredient-notice.repository';
