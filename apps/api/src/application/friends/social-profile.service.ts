import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import {
  blockRepository,
  followRepository,
  moderationRepository,
  Prisma,
  socialProfileRepository,
  type IBlockRepository,
  type IFollowRepository,
  type IModerationRepository,
  type ISocialProfileRepository,
  type SocialProfile,
  type SocialUserRow,
  type UpdateSocialProfileData,
} from '@chefer/database';
import {
  FRIENDS_COPY,
  LEGAL_VERSIONS,
  type activateFriendsInputSchema,
  type ActivateResultDto,
  type FriendsMeDto,
  type updateFriendsSettingsInputSchema,
} from '@chefer/types';
import { containsBlockedTerm, normalizeSearchName } from '@chefer/utils';
import { friendsNotActivatedError, textRejectedError } from '../../lib/friends-errors.js';
import { consentService, type ConsentService } from '../privacy/consent.service.js';
import {
  activityService,
  runSocialTx,
  type ActivityService,
  type SocialTx,
} from './activity.service.js';
import { moderationService, type ModerationService } from './moderation.service.js';
import { suggestionService, type SuggestionInvalidator } from './suggestion.service.js';

// ─── Following: my social profile (PRD E1, FR-02–FR-05; plan §4.4) ────────────
//
//   me              the badge + settings + counts (`friends.me`), also before
//                   turning on (names prefilled from the account, FR-02.6)
//   activate        turn on: name filter → one transaction (User names +
//                   SocialProfile) → SOCIAL_SHARING consent → word filter over
//                   my existing recipes (`filterHiddenRecipes`, FR-02.7)
//   updateSettings  visibility, sharing switches, names. Private → Public
//                   accepts every pending request (REQUEST_ACCEPTED items,
//                   `autoAccepted`); forced private refuses Public (FR-03.5);
//                   going public and sharing targets log consent (PRD §14);
//                   recipes off → on re-runs the word filter
//   deactivate      turn off (FD-14): consent withdrawal, then one
//                   transaction deleting follows both ways, blocks I made,
//                   dismissals, Activity both ways and the profile. Reports
//                   and the moderation log stay.
//
// Names: the word filter (PRD §9.4) runs on the first name, the last name and
// the two together; a match logs ONE `NAME_REJECTED` moderation row (never
// the name itself) and throws BAD_REQUEST + `data.textRejected: 'name'`.
// The same answer for a name that passes itself off as Chefer (F3.1): any
// name word starting with "chefer" ("Chefer Kitchen", "Chefer_Team",
// "CheferSupport") is reserved for the featured profile — the ops script
// (scripts/create-chefer-kitchen.ts) passes `allowReservedName`, and a
// featured profile may rename itself.
//
// ConsentService.record has no transaction parameter (it isn't this lane's
// file), so the turn-on consent is written right after the profile
// transaction commits; if that write fails the profile is deleted again and
// the error surfaces, so a social profile never exists without its consent
// event.

export type ActivateInput = z.infer<typeof activateFriendsInputSchema>;
export type UpdateSettingsInput = z.infer<typeof updateFriendsSettingsInputSchema>;
export type UpdateSettingsResultDto = ActivateResultDto & { autoAccepted?: number };
/** Where the consent was given: 'mobile' | 'web' (ConsentEvent.source). */
export type ConsentSource = string;

export type ProfileServiceProfileRepository = Pick<
  ISocialProfileRepository,
  'find' | 'findUsers' | 'create' | 'update' | 'updateUserNames' | 'deleteCascadeSocial'
>;
export type ProfileServiceFollowRepository = Pick<
  IFollowRepository,
  'counts' | 'acceptAllPendingTo'
>;
export type ProfileServiceBlockRepository = Pick<IBlockRepository, 'countMade'>;
export type ProfileServiceModerationRepository = Pick<IModerationRepository, 'log'>;

function isPrismaCode(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

/** The brand word no ordinary profile may use (F3.1, impersonation of Chefer Kitchen). */
const RESERVED_NAME_PREFIX = 'chefer';

/** Whether a display name passes itself off as Chefer (any normalised word starting "chefer"). */
export function isReservedName(firstName: string, lastName: string): boolean {
  return normalizeSearchName(firstName, lastName)
    .split(' ')
    .some((word) => word.startsWith(RESERVED_NAME_PREFIX));
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** FR-02.6 prefill: `firstName`/`lastName`, else the account `name` split at the first space. */
export function prefillNames(
  user: Pick<SocialUserRow, 'firstName' | 'lastName' | 'name'> | undefined,
): {
  firstName: string | null;
  lastName: string | null;
} {
  const first = nonEmpty(user?.firstName);
  const last = nonEmpty(user?.lastName);
  if (first || last) return { firstName: first, lastName: last };
  const words = (user?.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { firstName: null, lastName: null };
  return { firstName: words[0] ?? null, lastName: words.slice(1).join(' ') || null };
}

function forcedPrivateError(): TRPCError {
  return new TRPCError({ code: 'FORBIDDEN', message: FRIENDS_COPY.settings.forcedPrivate });
}

export class SocialProfileService {
  constructor(
    private readonly profiles: ProfileServiceProfileRepository = socialProfileRepository,
    private readonly follows: ProfileServiceFollowRepository = followRepository,
    private readonly blocks: ProfileServiceBlockRepository = blockRepository,
    private readonly activity: Pick<ActivityService, 'notify' | 'unreadCount'> = activityService,
    private readonly moderationLog: ProfileServiceModerationRepository = moderationRepository,
    private readonly moderation: Pick<ModerationService, 'hideFilteredRecipes'> = moderationService,
    private readonly consent: Pick<ConsentService, 'record'> = consentService,
    private readonly suggestions: SuggestionInvalidator = suggestionService,
    private readonly tx: SocialTx = runSocialTx,
  ) {}

  async me(userId: string): Promise<FriendsMeDto> {
    const [profile, users] = await Promise.all([
      this.profiles.find(userId),
      this.profiles.findUsers([userId]),
    ]);
    const names = prefillNames(users[0]);
    if (!profile) {
      return {
        activated: false,
        ...names,
        settings: null,
        counts: { followers: 0, following: 0, pendingRequests: 0, unreadActivity: 0, blocked: 0 },
        badgeCount: 0,
      };
    }
    const [follows, unreadActivity, blocked] = await Promise.all([
      this.follows.counts(userId),
      this.activity.unreadCount(userId),
      this.blocks.countMade(userId),
    ]);
    return {
      activated: true,
      ...names,
      settings: settingsOf(profile),
      counts: {
        followers: follows.followers,
        following: follows.following,
        pendingRequests: follows.pendingRequests,
        unreadActivity,
        blocked,
      },
      badgeCount: follows.pendingRequests + unreadActivity,
    };
  }

  /** Turn on Following (FR-02). Idempotent: an activated user gets their current state back. */
  async activate(
    userId: string,
    input: ActivateInput,
    source: ConsentSource,
    opts: { allowReservedName?: boolean } = {},
  ): Promise<ActivateResultDto> {
    if (await this.profiles.find(userId))
      return { ...(await this.me(userId)), filterHiddenRecipes: 0 };

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    await this.assertNameAllowed(userId, firstName, lastName, opts.allowReservedName === true);

    try {
      await this.tx(async (db) => {
        await this.profiles.updateUserNames(userId, firstName, lastName, db);
        await this.profiles.create(
          {
            userId,
            visibility: input.visibility,
            searchName: normalizeSearchName(firstName, lastName),
          },
          db,
        );
      });
    } catch (err) {
      // A concurrent activate (double tap) created the profile first.
      if (!isPrismaCode(err, 'P2002')) throw err;
      return { ...(await this.me(userId)), filterHiddenRecipes: 0 };
    }

    try {
      await this.consent.record({
        userId,
        kind: 'SOCIAL_SHARING',
        granted: true,
        source,
        documentVersion: input.documentVersion ?? LEGAL_VERSIONS.privacy,
      });
    } catch (err) {
      await this.profiles.deleteCascadeSocial(userId);
      throw err;
    }

    const filterHiddenRecipes = await this.moderation.hideFilteredRecipes(userId);
    return { ...(await this.me(userId)), filterHiddenRecipes };
  }

  /** Sharing & privacy (FR-03, FR-04) and the display name. Unchanged values are no-ops. */
  async updateSettings(
    userId: string,
    input: UpdateSettingsInput,
    source: ConsentSource,
  ): Promise<UpdateSettingsResultDto> {
    const profile = await this.profiles.find(userId);
    if (!profile) throw friendsNotActivatedError();
    if (input.visibility === 'PUBLIC' && profile.forcedPrivateAt !== null) {
      throw forcedPrivateError();
    }

    let names: { firstName: string; lastName: string } | null = null;
    if (input.firstName !== undefined || input.lastName !== undefined) {
      const [user] = await this.profiles.findUsers([userId]);
      const current = prefillNames(user);
      names = {
        firstName: (input.firstName ?? current.firstName ?? '').trim(),
        lastName: (input.lastName ?? current.lastName ?? '').trim(),
      };
      await this.assertNameAllowed(userId, names.firstName, names.lastName, profile.featured);
    }

    const goingPublic = input.visibility === 'PUBLIC' && profile.visibility === 'PRIVATE';
    const recipesOn = input.shareRecipes === true && !profile.shareRecipes;
    const targetsOn = input.shareTargets === true && !profile.shareTargets;

    const data: UpdateSocialProfileData = {
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      ...(input.sharePlan !== undefined && { sharePlan: input.sharePlan }),
      ...(input.shareRecipes !== undefined && { shareRecipes: input.shareRecipes }),
      ...(input.shareWorkouts !== undefined && { shareWorkouts: input.shareWorkouts }),
      ...(input.shareTargets !== undefined && { shareTargets: input.shareTargets }),
      ...(names && { searchName: normalizeSearchName(names.firstName, names.lastName) }),
    };

    const autoAccepted = await this.tx(async (db) => {
      if (names) await this.profiles.updateUserNames(userId, names.firstName, names.lastName, db);
      if (Object.keys(data).length > 0) await this.profiles.update(userId, data, db);
      if (!goingPublic) return 0;
      // FR-03.2: every pending request to me is accepted, and each requester is told.
      const accepted = await this.follows.acceptAllPendingTo(userId, db);
      for (const requesterId of accepted) {
        await this.activity.notify(requesterId, 'REQUEST_ACCEPTED', userId, db);
      }
      return accepted.length;
    });

    // PRD §14: consent is captured when going public and when sharing targets.
    if (goingPublic) await this.recordConsent(userId, true, source);
    if (targetsOn) await this.recordConsent(userId, true, source);
    if (goingPublic) this.suggestions.invalidate(userId);

    const filterHiddenRecipes = recipesOn ? await this.moderation.hideFilteredRecipes(userId) : 0;
    const result: UpdateSettingsResultDto = { ...(await this.me(userId)), filterHiddenRecipes };
    if (goingPublic) result.autoAccepted = autoAccepted;
    return result;
  }

  /**
   * Turn off Following (FR-05, FD-14). The withdrawal is logged first (it is
   * what the user asked for), then everything social is deleted in one
   * transaction. Idempotent: without a profile nothing is written.
   */
  async deactivate(userId: string, source: ConsentSource): Promise<{ ok: true }> {
    const profile = await this.profiles.find(userId);
    if (!profile) return { ok: true };
    await this.recordConsent(userId, false, source);
    await this.profiles.deleteCascadeSocial(userId);
    // Everyone's suggestions may hold this person; dropping them all is cheap
    // and deactivation is rare.
    this.suggestions.invalidateAll();
    return { ok: true };
  }

  private async recordConsent(userId: string, granted: boolean, source: ConsentSource) {
    await this.consent.record({
      userId,
      kind: 'SOCIAL_SHARING',
      granted,
      source,
      documentVersion: LEGAL_VERSIONS.privacy,
    });
  }

  /**
   * PRD §9.4: first, last, and the full name. One NAME_REJECTED row, never the
   * text. A reserved (Chefer) name is rejected the same way unless `allowReserved`.
   */
  private async assertNameAllowed(
    userId: string,
    firstName: string,
    lastName: string,
    allowReserved: boolean,
  ) {
    const blocked =
      containsBlockedTerm(firstName) ||
      containsBlockedTerm(lastName) ||
      containsBlockedTerm(`${firstName} ${lastName}`);
    const reserved = !allowReserved && isReservedName(firstName, lastName);
    if (!blocked && !reserved) return;
    await this.moderationLog.log({
      action: 'NAME_REJECTED',
      targetUserId: userId,
      reason: blocked ? 'blocked term in name' : 'reserved name',
      actor: 'system',
    });
    throw textRejectedError('name');
  }
}

function settingsOf(profile: SocialProfile): NonNullable<FriendsMeDto['settings']> {
  return {
    visibility: profile.visibility,
    forcedPrivate: profile.forcedPrivateAt !== null,
    sharePlan: profile.sharePlan,
    shareRecipes: profile.shareRecipes,
    shareWorkouts: profile.shareWorkouts,
    shareTargets: profile.shareTargets,
  };
}

export const socialProfileService = new SocialProfileService();
