import { COACHING_COPY, routineChangesLine, type CoachingNoticeDto } from '@chefer/types';

// ─── Coaching notices → cards (PRD 2026-10 §4.2, §4.3) ────────────────────────
// `coaching.notices` returns both sides' notices in one list. Each side's cards
// read only the notices whose other person plays the opposite role, so someone
// who is a trainer AND a client sees each card on the right screen.

export type NoticeSide = 'client' | 'trainer';

export interface NoticeView {
  id: string;
  /** The card's one line ("Ana updated your routine"). */
  text: string;
  /** The changes line ("+ Romanian deadlift · Squat 3×8 → 4×6"), when there is one. */
  detail: string | null;
  /** Where "View" goes (opening it dismisses the card); null = Dismiss only. */
  href: string | null;
  testId: string;
}

const copy = COACHING_COPY.notices;

function changesDetail(notice: CoachingNoticeDto): string | null {
  const changes = notice.changes ?? [];
  return changes.length > 0 ? routineChangesLine(changes) : null;
}

/** A client's card for a notice from their trainer, or null when it has none. */
export function clientNoticeView(notice: CoachingNoticeDto): NoticeView | null {
  if (notice.read || notice.other.role !== 'TRAINER') return null;
  const name = notice.other.name;
  const base = { id: notice.id, detail: null, href: null, testId: 'coaching-notice' };
  switch (notice.kind) {
    case 'ROUTINE_UPDATED':
      return {
        ...base,
        text: copy.routineUpdated(name),
        detail: changesDetail(notice),
        href: '/gym/routine',
        testId: 'coaching-routine-updated',
      };
    case 'COACHING_ENDED':
      // The client's own Leave needs no card.
      if (notice.endedBy === 'CLIENT') return null;
      return {
        ...base,
        text:
          notice.endedBy === 'SYSTEM' && notice.other.id === null
            ? copy.trainerGone
            : copy.endedByTrainer(name),
      };
    case 'REQUEST_ACCEPTED':
      return { ...base, text: copy.requestAccepted(name) };
    case 'REQUEST_DECLINED':
      return { ...base, text: copy.requestDeclined(name) };
    case 'REQUEST_RECEIVED':
      return null;
  }
}

/** A trainer's card for a notice about one of their clients, or null when it has none. */
export function trainerNoticeView(notice: CoachingNoticeDto): NoticeView | null {
  if (notice.read || notice.other.role !== 'CLIENT') return null;
  const name = notice.other.name;
  const base = { id: notice.id, detail: null, href: null, testId: 'trainer-notice' };
  switch (notice.kind) {
    case 'ROUTINE_UPDATED':
      return {
        ...base,
        text: copy.clientUpdated(name),
        detail: changesDetail(notice),
        href:
          notice.other.id === null
            ? null
            : `/trainer/${encodeURIComponent(notice.other.id)}/routine`,
      };
    case 'COACHING_ENDED':
      // The trainer's own "End coaching" needs no card.
      if (notice.endedBy === 'TRAINER') return null;
      return { ...base, text: copy.endedByClient(name) };
    case 'REQUEST_RECEIVED':
      return { ...base, text: copy.requestReceived(name), href: '#trainer-requests' };
    case 'REQUEST_ACCEPTED':
    case 'REQUEST_DECLINED':
      return null;
  }
}

export function noticeViews(notices: readonly CoachingNoticeDto[], side: NoticeSide): NoticeView[] {
  const view = side === 'client' ? clientNoticeView : trainerNoticeView;
  return notices.flatMap((n) => {
    const v = view(n);
    return v ? [v] : [];
  });
}
