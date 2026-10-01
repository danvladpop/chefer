import {
  blockRepository,
  followRepository,
  socialProfileRepository,
  type FollowStatus,
  type IBlockRepository,
  type IFollowRepository,
  type ISocialProfileRepository,
  type ProfileVisibility,
  type SocialProfile,
} from '@chefer/database';
import type { SectionAccess } from '@chefer/types';
import { friendsLockedError, profileNotAvailableError } from '../../lib/friends-errors.js';

// ─── Following: authorization (docs/friends/implementation-plan.md §4.3) ──────
// THE place that decides what one user may see of another (INV-1). Every
// friends.* procedure that reads or acts on another user goes through
// `requireSocialAccess(scope)` (lib/friends-middleware.ts) or calls
// `assert` here; recipe access (application/recipe/recipe-access.ts) calls
// `resolve`. The PRD §7.1 matrix is the test oracle
// (social-access.service.test.ts).
//
// Rules, in order:
//   0. The viewer must have turned on Following (a SocialProfile), else not
//      visible — PRD §7.1 "A viewer must have turned on Following themselves
//      to see any profile". The middleware checks it first; this repeats it
//      for callers outside the middleware chain (recipe access).
//   1. Self → visible, every section visible, targets true.
//   2. The owner has no SocialProfile → not visible.
//   3. A Block in either direction → not visible.
//   4. Otherwise the header is visible. Each section is
//      `outgoing === ACCEPTED ? (share ? 'visible' : 'not_shared') : 'locked'`
//      for public and private profiles alike (Q-F-4); targets = plan visible
//      && owner.shareTargets.
// Forced private changes nothing here: an existing follower keeps ACCEPTED.
//
// Not visible is ONE value whatever the reason (INV-3): it carries no
// visibility, no follow state and no section detail.

export type SocialScope = 'header' | 'plan' | 'recipes' | 'workouts';

export interface SocialAccess {
  visible: boolean;
  isSelf: boolean;
  ownerVisibility: ProfileVisibility | null;
  /** viewer → owner */
  outgoing: FollowStatus | null;
  /** owner → viewer */
  incoming: FollowStatus | null;
  can: { plan: SectionAccess; recipes: SectionAccess; workouts: SectionAccess; targets: boolean };
}

/**
 * Per-request memo (plan §4.3: "memoised per request on ctx, no cross-request
 * cache"). `requireActivated` creates one per procedure call and puts it on
 * `ctx.socialMemo`; pass it back to `resolve`/`assert` so a procedure that
 * checks the same pair twice queries once. Never share one across requests.
 * A service that changes the graph mid-request (follow, block) must not
 * re-resolve through the same memo — or call `clear()` first.
 */
export class SocialAccessMemo {
  readonly profiles = new Map<string, Promise<SocialProfile | null>>();
  readonly access = new Map<string, Promise<SocialAccess>>();

  clear(): void {
    this.profiles.clear();
    this.access.clear();
  }
}

export type SocialAccessProfileRepository = Pick<ISocialProfileRepository, 'find'>;
export type SocialAccessFollowRepository = Pick<IFollowRepository, 'findPair'>;
export type SocialAccessBlockRepository = Pick<IBlockRepository, 'existsEither'>;

function notVisible(): SocialAccess {
  return {
    visible: false,
    isSelf: false,
    ownerVisibility: null,
    outgoing: null,
    incoming: null,
    can: { plan: 'locked', recipes: 'locked', workouts: 'locked', targets: false },
  };
}

function self(profile: SocialProfile): SocialAccess {
  return {
    visible: true,
    isSelf: true,
    ownerVisibility: profile.visibility,
    outgoing: null,
    incoming: null,
    can: { plan: 'visible', recipes: 'visible', workouts: 'visible', targets: true },
  };
}

/** Memoises a promise under `key`; a rejection is forgotten so a retry queries again. */
function remember<T>(
  map: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const hit = map.get(key);
  if (hit) return hit;
  const promise = load();
  map.set(key, promise);
  promise.catch(() => map.delete(key));
  return promise;
}

export class SocialAccessService {
  constructor(
    private readonly profiles: SocialAccessProfileRepository = socialProfileRepository,
    private readonly follows: SocialAccessFollowRepository = followRepository,
    private readonly blocks: SocialAccessBlockRepository = blockRepository,
  ) {}

  /** The user's SocialProfile (null = hasn't turned on Following). */
  profile(userId: string, memo?: SocialAccessMemo): Promise<SocialProfile | null> {
    if (!memo) return this.profiles.find(userId);
    return remember(memo.profiles, userId, () => this.profiles.find(userId));
  }

  /** What `viewerId` may see of `ownerId` (rules above). Never throws for "not visible". */
  resolve(viewerId: string, ownerId: string, memo?: SocialAccessMemo): Promise<SocialAccess> {
    if (!memo) return this.compute(viewerId, ownerId, undefined);
    return remember(memo.access, `${viewerId}\u0000${ownerId}`, () =>
      this.compute(viewerId, ownerId, memo),
    );
  }

  /**
   * `resolve`, then enforce `scope`: not visible → NOT_FOUND `Profile not
   * available` (INV-3); a closed section → FORBIDDEN with
   * `data.friendsLocked`. Returns the access for the caller to use.
   */
  async assert(
    viewerId: string,
    ownerId: string,
    scope: SocialScope,
    memo?: SocialAccessMemo,
  ): Promise<SocialAccess> {
    const access = await this.resolve(viewerId, ownerId, memo);
    if (!access.visible) throw profileNotAvailableError();
    if (scope !== 'header') {
      const section = access.can[scope];
      if (section !== 'visible') throw friendsLockedError(section);
    }
    return access;
  }

  private async compute(
    viewerId: string,
    ownerId: string,
    memo: SocialAccessMemo | undefined,
  ): Promise<SocialAccess> {
    if (viewerId === ownerId) {
      const own = await this.profile(viewerId, memo);
      return own ? self(own) : notVisible();
    }
    // Independent reads, in parallel; the rules are applied in order below.
    const [viewer, owner, blocked, pair] = await Promise.all([
      this.profile(viewerId, memo),
      this.profile(ownerId, memo),
      this.blocks.existsEither(viewerId, ownerId),
      this.follows.findPair(viewerId, ownerId),
    ]);
    if (!viewer) return notVisible(); // rule 0
    if (!owner) return notVisible(); // rule 2
    if (blocked) return notVisible(); // rule 3

    // Rule 4. A block deletes the follows both ways, so `pair` is never a
    // leftover from a block; it is read only once the header is visible.
    const outgoing = pair.outgoing?.status ?? null;
    const incoming = pair.incoming?.status ?? null;
    const section = (shared: boolean): SectionAccess =>
      outgoing === 'ACCEPTED' ? (shared ? 'visible' : 'not_shared') : 'locked';
    const plan = section(owner.sharePlan);
    return {
      visible: true,
      isSelf: false,
      ownerVisibility: owner.visibility,
      outgoing,
      incoming,
      can: {
        plan,
        recipes: section(owner.shareRecipes),
        workouts: section(owner.shareWorkouts),
        targets: plan === 'visible' && owner.shareTargets,
      },
    };
  }
}

export const socialAccessService = new SocialAccessService();
