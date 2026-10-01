import { FRIENDS_LIMITS } from '@chefer/types';

// PRD §11. Computed on read; the caller has already removed me, people I follow
// or asked, blocks, dismissals and moderation-restricted accounts. This file only
// scores and orders what is left.

export type SuggestionReason = 'mutual' | 'follows_you' | 'popular';

export type SuggestionSignals = {
  /** People I follow who follow the candidate (accepted edges). */
  mutualCount: number;
  /** The candidate follows me and I don't follow back. */
  followsYou: boolean;
  /** Accepted follower count. */
  followers: number;
  /** Set only by the ops script that creates Chefer Kitchen (Q-F-8). */
  featured: boolean;
};

export type SuggestionCandidate = SuggestionSignals & {
  userId: string;
  /** Last time the owner was active; a tie-break ("recent activity"). */
  lastActiveAt?: Date | null;
};

export type RankedSuggestion<T extends SuggestionCandidate> = T & {
  score: number;
  reason: SuggestionReason;
};

const MUTUAL_WEIGHT = 10;
const FOLLOWS_YOU_BONUS = 25;

function popularScore({ followers, featured }: SuggestionSignals): number {
  // Chefer Kitchen is always eligible while it has fewer than the popularity
  // minimum: it scores as if it had exactly that many followers (cold start).
  const effective = featured
    ? Math.max(followers, FRIENDS_LIMITS.popularMinFollowers)
    : followers >= FRIENDS_LIMITS.popularMinFollowers
      ? followers
      : 0;
  return effective > 0 ? 2 * Math.log(1 + effective) : 0;
}

/** `10 × mutualCount` + `25` if they follow me + `2 × ln(1 + followers)` when popular. */
export function scoreSuggestion(signals: SuggestionSignals): number {
  const mutual = Math.max(0, signals.mutualCount) * MUTUAL_WEIGHT;
  const follows = signals.followsYou ? FOLLOWS_YOU_BONUS : 0;
  return mutual + follows + popularScore(signals);
}

/** The reason line's source: mutual beats follows-you beats popular; null = not a candidate. */
export function suggestionReason(signals: SuggestionSignals): SuggestionReason | null {
  if (signals.mutualCount > 0) return 'mutual';
  if (signals.followsYou) return 'follows_you';
  if (popularScore(signals) > 0) return 'popular';
  return null;
}

/**
 * Score, then followers, then recent activity, then id (deterministic). People
 * who qualify through none of the three sources are dropped. Top `limit`.
 */
export function rankSuggestions<T extends SuggestionCandidate>(
  candidates: readonly T[],
  limit: number,
): RankedSuggestion<T>[] {
  const ranked: RankedSuggestion<T>[] = [];
  for (const c of candidates) {
    const reason = suggestionReason(c);
    if (reason === null) continue;
    ranked.push({ ...c, score: scoreSuggestion(c), reason });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.followers - a.followers ||
      (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0) ||
      a.userId.localeCompare(b.userId),
  );
  return ranked.slice(0, Math.max(0, limit));
}
