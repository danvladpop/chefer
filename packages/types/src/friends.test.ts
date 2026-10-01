import { describe, expect, it } from 'vitest';
import { ALL_FEATURE_FLAGS_OFF, FEATURE_FLAG_KEYS } from './feature-flags';
import {
  activateFriendsInputSchema,
  addRecipeToWeekInputSchema,
  deactivateFriendsInputSchema,
  FRIENDS_LIMITS,
  friendsPageInputSchema,
  friendsSearchInputSchema,
  MODERATION,
  reportInputSchema,
  updateFriendsSettingsInputSchema,
} from './friends';

describe('friends feature flag', () => {
  it('exists and is off by default', () => {
    expect(FEATURE_FLAG_KEYS).toContain('friends');
    expect(ALL_FEATURE_FLAGS_OFF.friends).toBe(false);
  });
});

describe('friends constants', () => {
  it('match PRD §9.3 and plan §3.1', () => {
    expect(MODERATION).toEqual({
      RECIPE_HIDE_REPORTERS: 3,
      ACCOUNT_RESTRICT_REPORTERS: 5,
      REPORTER_MIN_ACCOUNT_AGE_HOURS: 24,
      REPORTER_REQUIRES_VERIFIED_EMAIL: true,
      RECORD_RETENTION_MONTHS: 24,
    });
    expect(FRIENDS_LIMITS.workoutsDays).toBe(7);
    expect(FRIENDS_LIMITS.pageSize).toBe(20);
  });
});

describe('friends schemas', () => {
  it('page input defaults the limit and bounds it', () => {
    expect(friendsPageInputSchema.parse({}).limit).toBe(20);
    expect(friendsPageInputSchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it('search needs 2..100 trimmed chars and treats @ as text', () => {
    expect(friendsSearchInputSchema.safeParse({ query: 'a' }).success).toBe(false);
    expect(friendsSearchInputSchema.safeParse({ query: ' a ' }).success).toBe(false);
    expect(friendsSearchInputSchema.safeParse({ query: 'x'.repeat(101) }).success).toBe(false);
    expect(friendsSearchInputSchema.parse({ query: '  ana@pop ' }).query).toBe('ana@pop');
  });

  it('activation requires both names and a visibility', () => {
    expect(
      activateFriendsInputSchema.safeParse({
        visibility: 'PRIVATE',
        firstName: ' Ștefan ',
        lastName: 'Pop',
      }).data?.firstName,
    ).toBe('Ștefan');
    expect(
      activateFriendsInputSchema.safeParse({ visibility: 'PRIVATE', firstName: '', lastName: 'P' })
        .success,
    ).toBe(false);
    expect(
      activateFriendsInputSchema.safeParse({ visibility: 'OPEN', firstName: 'A', lastName: 'P' })
        .success,
    ).toBe(false);
  });

  it('settings update must change something', () => {
    expect(updateFriendsSettingsInputSchema.safeParse({}).success).toBe(false);
    expect(updateFriendsSettingsInputSchema.safeParse({ shareTargets: true }).success).toBe(true);
  });

  it('deactivation needs the literal confirm', () => {
    expect(deactivateFriendsInputSchema.safeParse({ confirm: 'TURN_OFF' }).success).toBe(true);
    expect(deactivateFriendsInputSchema.safeParse({ confirm: 'yes' }).success).toBe(false);
  });

  it('report input has no free-text field', () => {
    const shape = Object.keys(reportInputSchema.shape);
    expect(shape.sort()).toEqual(['reason', 'recipeId', 'userId']);
  });

  it('add-to-week validates slots', () => {
    const ok = {
      recipeId: 'r1',
      weekOffset: 0,
      dayOfWeek: 2,
      mealType: 'lunch',
      mode: 'add',
    };
    expect(addRecipeToWeekInputSchema.safeParse(ok).success).toBe(true);
    expect(addRecipeToWeekInputSchema.safeParse({ ...ok, weekOffset: 2 }).success).toBe(false);
    expect(addRecipeToWeekInputSchema.safeParse({ ...ok, dayOfWeek: 7 }).success).toBe(false);
  });
});
