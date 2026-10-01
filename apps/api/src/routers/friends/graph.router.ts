import { TRPCError, type TRPCRouterRecord } from '@trpc/server';
import { z } from 'zod';
import {
  activateFriendsInputSchema,
  deactivateFriendsInputSchema,
  FRIENDS_COPY,
  FRIENDS_LIMITS,
  friendsPageInputSchema,
  friendsSearchInputSchema,
  markActivityReadInputSchema,
  targetUserInputSchema,
  updateFriendsSettingsInputSchema,
} from '@chefer/types';
import { activityService } from '../../application/friends/activity.service.js';
import { blockService } from '../../application/friends/block.service.js';
import { followService } from '../../application/friends/follow.service.js';
import { friendSearchService } from '../../application/friends/friend-search.service.js';
import { socialProfileService } from '../../application/friends/social-profile.service.js';
import { suggestionService } from '../../application/friends/suggestion.service.js';
import {
  activeFriendsProcedure,
  friendsProcedure,
  requireSocialAccess,
} from '../../lib/friends-middleware.js';
import { consume } from '../../lib/rate-limit.js';

// friends.* — the social graph (L-GRAPH): me, activate, updateSettings,
// deactivate, search, suggestions, follows, lists, activity, blocks.
// Procedure map: docs/friends/implementation-plan.md §4.2.
// A plain procedure RECORD, not a router(): routers/friends/index.ts spreads
// the four records into one friends router, so parallel lanes never share a
// file. Keys must be unique across the four records (index.test.ts checks).
// Thin handlers: input schema + rate limit + one service call. Every output
// is a @chefer/types DTO built field by field in the services (no email,
// INV-6).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Per-user rate limit (plan §4.2 "Rate limit" column) on the shared
 * in-memory limiter, with a message the app can show as is.
 */
function limit(
  procedure: string,
  userId: string,
  max: number,
  windowMs: number,
  message = 'Too many attempts. Please wait a few minutes and try again.',
): void {
  if (!consume(`friends.${procedure}:${userId}`, max, windowMs)) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message });
  }
}

const source = (isMobileClient: boolean) => (isMobileClient ? 'mobile' : 'web');

const suggestionsInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(FRIENDS_LIMITS.suggestionsAll)
      .default(FRIENDS_LIMITS.suggestionsHome),
  })
  .default({});

export const graphProcedures = {
  // ─── My social profile ──────────────────────────────────────────────────────
  me: friendsProcedure.query(({ ctx }) => socialProfileService.me(ctx.user.id)),

  activate: friendsProcedure.input(activateFriendsInputSchema).mutation(({ ctx, input }) => {
    limit('activate', ctx.user.id, 10, HOUR);
    return socialProfileService.activate(ctx.user.id, input, source(ctx.isMobileClient));
  }),

  updateSettings: activeFriendsProcedure
    .input(updateFriendsSettingsInputSchema)
    .mutation(({ ctx, input }) => {
      limit('updateSettings', ctx.user.id, 60, HOUR);
      return socialProfileService.updateSettings(ctx.user.id, input, source(ctx.isMobileClient));
    }),

  deactivate: activeFriendsProcedure.input(deactivateFriendsInputSchema).mutation(({ ctx }) => {
    limit('deactivate', ctx.user.id, 5, HOUR);
    return socialProfileService.deactivate(ctx.user.id, source(ctx.isMobileClient));
  }),

  // ─── Finding people ─────────────────────────────────────────────────────────
  search: activeFriendsProcedure.input(friendsSearchInputSchema).query(({ ctx, input }) => {
    limit('search', ctx.user.id, 60, MINUTE, FRIENDS_COPY.search.rateLimited);
    return friendSearchService.search(ctx.user.id, input);
  }),

  suggestions: activeFriendsProcedure
    .input(suggestionsInputSchema)
    .query(({ ctx, input }) => suggestionService.list(ctx.user.id, input.limit)),

  dismissSuggestion: activeFriendsProcedure
    .input(targetUserInputSchema)
    .mutation(({ ctx, input }) => {
      limit('dismissSuggestion', ctx.user.id, 120, HOUR);
      return suggestionService.dismiss(ctx.user.id, input.userId);
    }),

  // ─── The follow lifecycle ───────────────────────────────────────────────────
  follow: activeFriendsProcedure
    .input(targetUserInputSchema)
    .use(requireSocialAccess('header'))
    .mutation(({ ctx, input }) => {
      limit('follow', ctx.user.id, 60, HOUR);
      return followService.follow(ctx.user.id, input.userId, ctx.socialMemo);
    }),

  unfollow: activeFriendsProcedure.input(targetUserInputSchema).mutation(({ ctx, input }) => {
    limit('unfollow', ctx.user.id, 60, HOUR);
    return followService.unfollow(ctx.user.id, input.userId);
  }),

  acceptRequest: activeFriendsProcedure.input(targetUserInputSchema).mutation(({ ctx, input }) => {
    limit('answerRequest', ctx.user.id, 300, HOUR);
    return followService.accept(ctx.user.id, input.userId);
  }),

  declineRequest: activeFriendsProcedure.input(targetUserInputSchema).mutation(({ ctx, input }) => {
    limit('answerRequest', ctx.user.id, 300, HOUR);
    return followService.decline(ctx.user.id, input.userId);
  }),

  removeFollower: activeFriendsProcedure.input(targetUserInputSchema).mutation(({ ctx, input }) => {
    limit('removeFollower', ctx.user.id, 60, HOUR);
    return followService.removeFollower(ctx.user.id, input.userId);
  }),

  // ─── My lists ───────────────────────────────────────────────────────────────
  following: activeFriendsProcedure
    .input(friendsPageInputSchema)
    .query(({ ctx, input }) => followService.listFollowing(ctx.user.id, input)),

  followers: activeFriendsProcedure
    .input(friendsPageInputSchema)
    .query(({ ctx, input }) => followService.listFollowers(ctx.user.id, input)),

  requests: activeFriendsProcedure
    .input(friendsPageInputSchema)
    .query(({ ctx, input }) => followService.listRequests(ctx.user.id, input)),

  // ─── Activity ───────────────────────────────────────────────────────────────
  activity: activeFriendsProcedure
    .input(friendsPageInputSchema)
    .query(({ ctx, input }) => activityService.list(ctx.user.id, input)),

  markActivityRead: activeFriendsProcedure
    .input(markActivityReadInputSchema)
    .mutation(({ ctx, input }) => activityService.markReadUpTo(ctx.user.id, input.upTo)),

  // ─── Blocks ─────────────────────────────────────────────────────────────────
  block: activeFriendsProcedure.input(targetUserInputSchema).mutation(({ ctx, input }) => {
    limit('block', ctx.user.id, 30, DAY);
    return blockService.block(ctx.user.id, input.userId);
  }),

  unblock: activeFriendsProcedure.input(targetUserInputSchema).mutation(({ ctx, input }) => {
    limit('unblock', ctx.user.id, 30, DAY);
    return blockService.unblock(ctx.user.id, input.userId);
  }),

  blocked: activeFriendsProcedure
    .input(friendsPageInputSchema)
    .query(({ ctx, input }) => blockService.list(ctx.user.id, input)),
} satisfies TRPCRouterRecord;
