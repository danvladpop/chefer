// ─── Health-information consent (GDPR Art. 9; §2.8, T-26.1–T-26.4) ────────────
// Allergies, diets, dislikes, goal, body metrics and weigh-ins count as health
// information. The first time a user saves any of them, web and mobile show
// the same consent sheet. SEPARATE from the AI data consent (ai-consent.ts):
// this one is about storing the data, that one about sending it to an AI
// provider. The copy lives here so both platforms say exactly the same thing.
//
// PENDING COUNSEL REVIEW (Q-7 / UX-26): every string below is draft copy, and
// the legal ground (explicit consent for all health fields, incl. allergies)
// is the recorded default until counsel answers. Data stored before this
// consent existed is kept, and the user is asked on the next launch.

/**
 * The `x-chefer-api-level` at which a client understands the health-consent
 * error and shows the sheet before it saves anything. The header is one
 * shared counter across features (see apps/api/src/application/gym/
 * client-level.ts): 3 = cardio; the next unclaimed number is this one.
 * Under `HEALTH_CONSENT_ENFORCE=declared` the server rejects an un-consented
 * health write only from a client at or above this level — installed binaries
 * (no header, or an older level) are never rejected.
 */
export const HEALTH_CONSENT_API_LEVEL = 4;

/** Copy version recorded with a grant (`User.healthDataConsentVersion`). */
export const HEALTH_CONSENT_VERSION = '2026-10-hc1';

/** `error.data.healthConsentRequired` marker + tRPC message of the rejection. */
export const HEALTH_CONSENT_REQUIRED = 'HEALTH_CONSENT_REQUIRED';

/** The literal `privacy.withdrawHealthData` requires — a deliberate, typed confirmation. */
export const HEALTH_WITHDRAW_CONFIRM = 'WITHDRAW';

export const HEALTH_CONSENT_COPY = {
  eyebrow: 'Health information',
  title: 'Can Chefer use this to plan your food?',
  intro:
    'Allergies, diets, your goal and body measurements count as health information under EU law, so we need your clear permission.',
  what: {
    label: 'What',
    text: 'the allergies, diets and measurements you enter for you and your household',
  },
  why: { label: 'Why', text: 'to check and plan your meals and targets' },
  where: {
    label: 'Where',
    text: 'stored on our servers in the EU; sent to our AI providers only when you use an AI feature (you’ll be asked separately)',
  },
  choice: {
    label: 'Your choice',
    text: 'withdraw any time in Profile › Privacy & data — we delete it',
  },
  allow: 'Allow and save',
  decline: 'Don’t save it',
  saving: 'Saving…',
  saveError: 'Couldn’t save your choice. Please try again.',
  // After "Don't save it" (AC2)
  declinedNotice: 'Without this, Chefer can’t check plans for allergies.',
  todayCardTitle: 'Plans aren’t being checked for allergies',
  todayCardAction: 'Allow health information',
  // Profile › Privacy & data
  rowTitle: 'Health information',
  rowAllowed: 'Allowed on {date}',
  rowNotAllowed: 'Not allowed. Allergies, goal and measurements aren’t stored.',
  rowAllowAction: 'Allow health information',
  withdraw: 'Withdraw and delete',
  withdrawTitle: 'Delete your health information?',
  withdrawBody:
    'This removes allergies, diets, dislikes, goal, measurements and weigh-ins for you and your household. Plans will no longer be checked for allergies.',
  withdrawKeep: 'Keep',
  withdrawDone: 'Your health information was deleted.',
  withdrawError: 'Couldn’t delete your health information. Please try again.',
} as const;

/** Fills `{date}` in `rowAllowed`. */
export function healthConsentAllowedLine(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const formatted = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return HEALTH_CONSENT_COPY.rowAllowed.replace('{date}', formatted);
}

/** True while the user has not allowed (or has withdrawn) health information. */
export function needsHealthConsent(
  me: { healthDataConsentAt?: Date | string | null } | null | undefined,
): boolean {
  return !me?.healthDataConsentAt;
}
