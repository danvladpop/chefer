import type { CelebrationLevel, LevelUp, ProgressEventKind, ProgressInbox } from '@chefer/types';
import { receiptLineLabel, tierNumeral, xpLabel } from '@chefer/utils';
import { PROGRESS_WEB_COPY } from './copy';

// ─── What the host shows for an inbox (tech-plan §6 "Moments", lane C5) ───────
// Pure, so the routing by celebration level is testable without a DOM.
//   FULL    small receipts and new badges as a toast; a level-up as a modal.
//   SUBTLE  toasts only, the level-up included.
//   OFF     nothing (the caller still acks, so nothing piles up).
// Receipts a screen already shows inline (a finished cook, a workout summary)
// are skipped here. `quiet` (low-intake guard) drops the receipt toasts, and
// "Show XP & levels" off drops receipts and level-ups.

/** Kinds whose own screen renders the receipt. */
const SHOWN_INLINE: ReadonlySet<ProgressEventKind> = new Set([
  'COOK_FINISHED',
  'WORKOUT_COMPLETED',
  'WORKOUT_PRS',
  // The welcome card on Today covers the back-dated welcome.
  'WELCOME',
]);

export type InboxPlan = { toast: string | null; levelUp: LevelUp | null };

export type InboxSettings = { celebrations: CelebrationLevel; showXp: boolean; quiet: boolean };

export function planInbox(inbox: ProgressInbox, settings: InboxSettings): InboxPlan {
  if (settings.celebrations === 'OFF') return { toast: null, levelUp: null };

  const parts: string[] = [];

  if (settings.showXp && !settings.quiet) {
    const receipts = inbox.receipts.filter((r) => !SHOWN_INLINE.has(r.kind));
    const total = receipts.reduce((sum, r) => sum + r.xp, 0);
    if (receipts.length > 0 && total > 0) {
      // The reason shown is the single biggest line across the batch.
      const top = receipts
        .flatMap((r) => r.lines)
        .reduce((best, line) => (line.xp > best.xp ? line : best));
      parts.push(`${xpLabel(total)} · ${receiptLineLabel(top.code, top.detail)}`);
    }
  }

  const unlock = inbox.unlocks.at(-1);
  if (unlock) {
    const more = inbox.unlocks.length > 1 ? ` +${inbox.unlocks.length - 1}` : '';
    parts.push(`${PROGRESS_WEB_COPY.newBadge}: ${unlock.title} ${tierNumeral(unlock.tier)}${more}`);
  }

  let levelUp: LevelUp | null = null;
  if (inbox.levelUp && settings.showXp) {
    if (settings.celebrations === 'FULL') levelUp = inbox.levelUp;
    else parts.push(`${PROGRESS_WEB_COPY.levelUpToast}: Lv ${inbox.levelUp.to}`);
  }

  return { toast: parts.length > 0 ? parts.join(' · ') : null, levelUp };
}

/** A stable identity for an inbox's contents, so the host handles each batch once. */
export function inboxKey(inbox: ProgressInbox): string | null {
  const key = [
    ...inbox.receipts.map((r) => r.id),
    ...inbox.unlocks.map((u) => u.id),
    inbox.levelUp ? `L${inbox.levelUp.to}` : '',
  ]
    .filter(Boolean)
    .join('|');
  return key === '' ? null : key;
}
