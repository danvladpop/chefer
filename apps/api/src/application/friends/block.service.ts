import { TRPCError } from '@trpc/server';
import {
  blockRepository,
  followRepository,
  notificationRepository,
  socialProfileRepository,
  suggestionDismissalRepository,
  type Block,
  type IBlockRepository,
  type IFollowRepository,
  type INotificationRepository,
  type ISocialProfileRepository,
  type ISuggestionDismissalRepository,
  type SocialDbClient,
} from '@chefer/database';
import type { FriendUserSummary, Page } from '@chefer/types';
import {
  friendSummaryHydrator,
  pageOf,
  runSocialTx,
  toKeyset,
  type FriendSummaryHydrator,
  type SocialTx,
} from './activity.service.js';
import type { FriendsPageInput } from './follow.service.js';
import { suggestionService, type SuggestionInvalidator } from './suggestion.service.js';

// ─── Following: block (PRD §9.1, FR-13.1–13.3; plan §4.4) ─────────────────────
// Instant and mutual. ONE transaction: follows and requests both ways are
// deleted, every Activity item between the two is withdrawn, suggestion
// dismissals both ways are cleared, and the Block row is written. From then on
// SocialAccessService hides each from the other (INV-3), search and
// suggestions exclude the pair, and the blocked person's recipes leave the
// blocker's Saved list (recipe access reads the same rules). Nobody is told.
//
// `blockInTx` is the reusable core: L-MODERATION's report-and-block runs it
// inside its own SERIALIZABLE transaction.
//
// Answers never reveal whether the other id exists (INV-3): blocking an
// unknown id is the same `ok` (nothing is written — the FK would fail);
// unblocking is always `ok`. Unblocking restores nothing (FR-13.3).

export type BlockServiceBlockRepository = Pick<IBlockRepository, 'create' | 'delete' | 'listMade'>;
export type BlockServiceFollowRepository = Pick<IFollowRepository, 'deleteBothWays'>;
export type BlockServiceNotificationRepository = Pick<INotificationRepository, 'withdrawBetween'>;
export type BlockServiceDismissalRepository = Pick<ISuggestionDismissalRepository, 'deleteBetween'>;
export type BlockServiceProfileRepository = Pick<ISocialProfileRepository, 'findUsers'>;

export class BlockService {
  constructor(
    private readonly blocks: BlockServiceBlockRepository = blockRepository,
    private readonly follows: BlockServiceFollowRepository = followRepository,
    private readonly notifications: BlockServiceNotificationRepository = notificationRepository,
    private readonly dismissals: BlockServiceDismissalRepository = suggestionDismissalRepository,
    private readonly profiles: BlockServiceProfileRepository = socialProfileRepository,
    private readonly suggestions: SuggestionInvalidator = suggestionService,
    private readonly hydrator: FriendSummaryHydrator = friendSummaryHydrator,
    private readonly tx: SocialTx = runSocialTx,
  ) {}

  /** Block `blockedId` (FR-13.2). Idempotent; self → BAD_REQUEST. */
  async block(blockerId: string, blockedId: string): Promise<{ ok: true }> {
    if (blockerId === blockedId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'You can’t block yourself.' });
    }
    const [target] = await this.profiles.findUsers([blockedId]);
    if (target) {
      await this.tx((db) => this.blockInTx(db, blockerId, blockedId));
    }
    // After the commit too, so a recompute that raced the transaction can't keep a stale row.
    this.invalidateCaches(blockerId, blockedId);
    return { ok: true };
  }

  /**
   * The block's writes, inside the caller's transaction `db` (report-and-block
   * passes its own). Order: edges and items first, then the Block row.
   * Re-blocking keeps the original row. Also clears both users' suggestion
   * caches; a caller that commits later should call `invalidateCaches` again
   * after its commit (as `block` does).
   */
  async blockInTx(db: SocialDbClient, blockerId: string, blockedId: string): Promise<Block> {
    await this.follows.deleteBothWays(blockerId, blockedId, db);
    await this.notifications.withdrawBetween(blockerId, blockedId, db);
    await this.dismissals.deleteBetween(blockerId, blockedId, db);
    const row = await this.blocks.create(blockerId, blockedId, db);
    this.invalidateCaches(blockerId, blockedId);
    return row;
  }

  /** Both people's "Suggested for you" lose each other at once. */
  invalidateCaches(a: string, b: string): void {
    this.suggestions.invalidate(a);
    this.suggestions.invalidate(b);
  }

  /** Unblock (FR-13.3): removes only the caller's own block; restores nothing. Idempotent. */
  async unblock(blockerId: string, blockedId: string): Promise<{ ok: true }> {
    if (blockerId !== blockedId) await this.blocks.delete(blockerId, blockedId);
    this.invalidateCaches(blockerId, blockedId);
    return { ok: true };
  }

  /** `Blocked people`: blocks the caller made, newest first. */
  async list(blockerId: string, input: FriendsPageInput): Promise<Page<FriendUserSummary>> {
    const rows = await this.blocks.listMade(blockerId, toKeyset(input.cursor), input.limit + 1);
    const people = await this.hydrator.hydrate(
      blockerId,
      rows.slice(0, input.limit).map((b) => b.blockedId),
    );
    return pageOf(
      rows,
      input.limit,
      (b) => ({ createdAt: b.createdAt, id: b.blockedId }),
      (page) =>
        page.flatMap((b) => {
          const s = people.summary(b.blockedId);
          return s ? [s] : [];
        }),
    );
  }
}

export const blockService = new BlockService();
