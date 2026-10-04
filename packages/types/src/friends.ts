import { z } from 'zod';

// ─── Following (code name: friends) shared contracts (implementation-plan §3.1) ─
// The user-facing label is "Following"; identifiers keep `friends`. Every other
// user's data reaches the client only through the allow-list DTOs below
// (INV-2). Additive changes only once mobile ships.

export const PROFILE_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
export type Relation = 'self' | 'none' | 'requested' | 'following';

export const FRIENDS_LIMITS = {
  pageSize: 20,
  searchMinChars: 2,
  searchMaxChars: 100,
  workoutsDays: 7, // PRD FD-15: owner's today − 6 … today
  workoutsMax: 30,
  suggestionsHome: 5,
  suggestionsAll: 30,
  suggestionCacheMs: 10 * 60_000,
  dismissalDays: 90,
  requestExpiryDays: 90,
  activityRetentionDays: 90,
  popularMinFollowers: 3,
  popularActiveDays: 30,
} as const;

/** PRD §9.3 (approved by the owner, Q-F-13). Change here only. */
export const MODERATION = {
  RECIPE_HIDE_REPORTERS: 3,
  ACCOUNT_RESTRICT_REPORTERS: 5,
  REPORTER_MIN_ACCOUNT_AGE_HOURS: 24,
  REPORTER_REQUIRES_VERIFIED_EMAIL: true,
  /**
   * Retention of reports and the moderation log (owner decision 2026-10-01):
   * deleted after 24 months by the maintenance worker. A log row that explains
   * an action still in effect (a recipe still hidden, an account still forced
   * private) is kept until the action is lifted.
   */
  RECORD_RETENTION_MONTHS: 24,
} as const;

const personName = z.string().trim().min(1).max(50);
export const friendUserIdSchema = z.string().cuid();
export const targetUserInputSchema = z.object({ userId: friendUserIdSchema });
export const friendsPageInputSchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).default(FRIENDS_LIMITS.pageSize),
});
export const activateFriendsInputSchema = z.object({
  visibility: z.enum(PROFILE_VISIBILITIES),
  firstName: personName,
  lastName: personName,
  documentVersion: z.string().max(20).optional(), // defaults to LEGAL_VERSIONS.privacy
});
export const updateFriendsSettingsInputSchema = z
  .object({
    visibility: z.enum(PROFILE_VISIBILITIES),
    sharePlan: z.boolean(),
    shareRecipes: z.boolean(),
    shareWorkouts: z.boolean(),
    shareTargets: z.boolean(),
    firstName: personName,
    lastName: personName,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const deactivateFriendsInputSchema = z.object({ confirm: z.literal('TURN_OFF') });
export const friendsSearchInputSchema = friendsPageInputSchema.extend({
  query: z.string().trim().min(FRIENDS_LIMITS.searchMinChars).max(FRIENDS_LIMITS.searchMaxChars),
});
export const friendRecipesInputSchema = friendsPageInputSchema.extend({
  userId: friendUserIdSchema,
  search: z.string().trim().max(100).optional(),
});
export const addRecipeToWeekInputSchema = z.object({
  recipeId: z.string().min(1).max(64),
  weekOffset: z.number().int().min(0).max(1),
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  mode: z.enum(['add', 'replace']),
  slotIndex: z.number().int().min(0).max(9).optional(), // required when mode = 'replace'
  acknowledgeConflict: z.boolean().optional(),
});
export const undoAddToWeekInputSchema = z.object({
  planId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  slotIndex: z.number().int().min(0).max(9),
  addedRecipeId: z.string().min(1),
  previousRecipeId: z.string().min(1).optional(),
  /**
   * Whether the replaced slot was `Your pick` (from `addRecipeToWeek`'s
   * result, F3.1). Optional and additive: without it the restored slot is a
   * pick, the original behaviour.
   */
  previousPinned: z.boolean().optional(),
});
export const REPORT_REASONS = ['INAPPROPRIATE', 'SPAM', 'HARASSMENT', 'UNSAFE', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const reportInputSchema = z.object({
  userId: friendUserIdSchema,
  recipeId: z.string().min(1).max(64).optional(),
  reason: z.enum(REPORT_REASONS),
});
export const markActivityReadInputSchema = z.object({ upTo: z.date() });

// ─── DTOs (the API returns exactly these) ─────────────────────────────────────

export interface FriendUserSummary {
  id: string;
  displayName: string; // "{first} {last}", fallback name, fallback "Chefer user"
  firstName: string;
  imageUrl: string | null;
  relation: Relation;
  followsYou: boolean;
  requestedYou: boolean;
}
export interface FriendsAvailabilityDto {
  enabled: boolean;
}
export interface FriendsMeDto {
  activated: boolean;
  firstName: string | null;
  lastName: string | null;
  settings: null | {
    visibility: ProfileVisibility;
    forcedPrivate: boolean;
    sharePlan: boolean;
    shareRecipes: boolean;
    shareWorkouts: boolean;
    shareTargets: boolean;
  };
  counts: {
    followers: number;
    following: number;
    pendingRequests: number;
    unreadActivity: number;
    blocked: number;
  };
  badgeCount: number; // pendingRequests + unreadActivity
}
export interface ActivateResultDto extends FriendsMeDto {
  filterHiddenRecipes: number;
}
export type SectionAccess = 'visible' | 'locked' | 'not_shared';
export interface FriendProfileDto {
  user: FriendUserSummary;
  isSelf: boolean;
  visibility: ProfileVisibility;
  counts: { followers: number; following: number };
  access: { plan: SectionAccess; recipes: SectionAccess; workouts: SectionAccess };
  recipeCount: number | null;
}
export interface FriendMacroTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
export interface FriendRecipeCard {
  id: string;
  name: string;
  imageUrl: string | null;
  imageStatus: 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';
  perServing: FriendMacroTotals;
  totalTimeMins: number;
  byOwner: boolean; // the owner's own MANUAL recipe (the UI shows "By")
  sourceDomain: string | null; // Q-F-7: hostname of sourceUrl, "www." stripped
  sourceUrl: string | null;
  isFavourite: boolean; // the VIEWER's heart
  hidden: boolean; // auto-hidden: name/photo withheld (the name is "Hidden recipe"), not openable
}
export interface FriendWeekDto {
  weekStartDate: string; // YYYY-MM-DD, owner's Monday
  todayIndex: number; // 0..6, owner's time zone
  days: {
    dayOfWeek: number;
    meals: {
      type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      portion: number;
      leftoverOf?: string;
      recipe: FriendRecipeCard;
      totals: FriendMacroTotals;
    }[];
    totals: FriendMacroTotals;
  }[];
  averageKcal: number | null;
  targets: FriendMacroTotals | null;
}
export interface FriendRoutineDto {
  name: string;
  days: {
    position: number;
    name: string;
    plannedWeekday: number | null;
    exercises: {
      exerciseId: string;
      name: string;
      isCustom: boolean;
      sets: number;
      repMin: number;
      repMax: number;
      restSec: number;
      supersetGroup: string | null;
      trackingType: string;
    }[];
  }[];
}
export interface FriendWorkoutDto {
  id: string;
  name: string;
  localDate: string;
  startedAt: string;
  durationMin: number | null;
  exercises: {
    exerciseId: string;
    name: string;
    isCustom: boolean;
    trackingType: string;
    /** UX-GYM-19: a dumbbell / kettlebell load is per hand ("30 kg each"). Omitted when false; additive. */
    perHand?: boolean;
    sets: { weightKg: number; reps: number; durationSec?: number; distanceM?: number }[];
  }[];
}
export interface ActivityItemDto {
  id: string;
  kind: 'FOLLOW_REQUEST' | 'NEW_FOLLOWER' | 'REQUEST_ACCEPTED';
  actor: FriendUserSummary;
  createdAt: Date;
  readAt: Date | null;
  requestState?: 'pending' | 'accepted' | 'declined';
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
