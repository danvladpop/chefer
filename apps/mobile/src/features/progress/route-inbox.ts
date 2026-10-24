import type {
  CelebrationLevel,
  LevelUp,
  ProgressAckInput,
  ProgressEventKind,
  ProgressInbox,
} from '@chefer/types';
import { levelUpLine, receiptLineLabel, unlockLine, xpLabel } from '@chefer/utils';

// What `ProgressHost` does with the inbox (build-plan.md Lane C §5), as a pure
// function so every celebration level is testable without a screen.
//
//  - FULL: a snackbar for the small receipts ("+15 XP · Full day logged"), a
//    level-up MODAL, a snackbar per new badge;
//  - SUBTLE: snackbars only, the level-up included;
//  - OFF: nothing shown; everything is acked quietly.
//
// Receipts the screen that earned them already shows (a finished cook, a
// workout) are acked and skipped; so is WELCOME (the intro card on Today).
// "Show XP & levels" off drops the XP receipt and the level-up. `quiet` (the
// low-intake guard) drops the food receipts. Badges are not XP, so they still
// announce themselves at FULL and SUBTLE.

/** Shown inline by their own screen, or by the intro card. */
const OWN_SCREEN_KINDS: ReadonlySet<ProgressEventKind> = new Set([
  'COOK_FINISHED',
  'WORKOUT_COMPLETED',
  'WORKOUT_PRS',
  'WELCOME',
]);
/** Food-domain receipts: skipped while `quiet`. */
const FOOD_KINDS: ReadonlySet<ProgressEventKind> = new Set([
  'MEAL_LOGGED',
  'FULL_DAY',
  'PROTEIN_GOAL',
  'TODAYS_THREE',
  'SHOP_DONE',
]);

export interface InboxContext {
  celebrations: CelebrationLevel;
  showXp: boolean;
  quiet: boolean;
}

export interface InboxPlan {
  /** Snackbar messages, in the order to show them. */
  messages: string[];
  /** The level-up to show as a modal (FULL only), else null. */
  levelUpModal: LevelUp | null;
  /** The ack to send right away (the modal's own level is acked when it closes). */
  ack: ProgressAckInput | null;
}

/** The inbox as it will be handled: nothing here has been seen before. */
export function planInbox(inbox: ProgressInbox, ctx: InboxContext): InboxPlan {
  const nothing = inbox.receipts.length === 0 && inbox.unlocks.length === 0 && !inbox.levelUp;
  if (nothing) return { messages: [], levelUpModal: null, ack: null };

  const messages: string[] = [];
  let levelUpModal: LevelUp | null = null;

  if (ctx.celebrations !== 'OFF') {
    if (ctx.showXp) {
      const shown = inbox.receipts.filter(
        (r) => !OWN_SCREEN_KINDS.has(r.kind) && !(ctx.quiet && FOOD_KINDS.has(r.kind)),
      );
      const total = shown.reduce((sum, r) => sum + r.xp, 0);
      // The biggest line stands for the lot ("+25 XP · Full day logged").
      const top = shown
        .flatMap((r) => r.lines)
        .reduce<{
          code: (typeof shown)[number]['lines'][number]['code'];
          xp: number;
          detail?: string;
        } | null>((best, line) => (best === null || line.xp > best.xp ? line : best), null);
      if (shown.length > 0 && total > 0) {
        messages.push(
          top ? `${xpLabel(total)} · ${receiptLineLabel(top.code, top.detail)}` : xpLabel(total),
        );
      }
      if (inbox.levelUp) {
        if (ctx.celebrations === 'FULL') levelUpModal = inbox.levelUp;
        else messages.push(levelUpLine(inbox.levelUp.to, inbox.levelUp.rank.title));
      }
    }
    for (const unlock of inbox.unlocks) messages.push(unlockLine(unlock.title, unlock.tier));
  }

  const ack: ProgressAckInput = {
    ...(inbox.cursor ? { upTo: inbox.cursor } : {}),
    ...(inbox.unlocks.length > 0 ? { unlockIds: inbox.unlocks.map((u) => u.id) } : {}),
    // A level-up that is not shown as a modal is done with now.
    ...(inbox.levelUp && levelUpModal === null ? { level: inbox.levelUp.to } : {}),
  };
  return { messages, levelUpModal, ack };
}
