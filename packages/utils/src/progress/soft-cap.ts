import { candidateXp, type ProgressCandidate } from './candidates';
import { UNCAPPED_KINDS, XP } from './xp-table';

/**
 * The daily soft cap: the part of `raw` that fits under `cap - dayXpBefore`
 * counts in full, the rest is halved (rounded up). Never a hard stop: extra
 * actions always still count.
 */
export function capXp(dayXpBefore: number, raw: number, cap: number = XP.DAILY_SOFT_CAP): number {
  const room = Math.max(0, cap - dayXpBefore);
  const full = Math.min(raw, room);
  return full + Math.ceil((raw - full) / 2);
}

/** What one candidate earns on a day that already holds `dayXpBefore` capped XP. */
export function scoreAgainstDay(
  candidate: ProgressCandidate,
  dayXpBefore: number,
): { xp: number; capped: boolean } {
  const raw = candidateXp(candidate);
  if (UNCAPPED_KINDS.includes(candidate.kind)) return { xp: raw, capped: false };
  const xp = capXp(dayXpBefore, raw);
  return { xp, capped: xp < raw };
}
