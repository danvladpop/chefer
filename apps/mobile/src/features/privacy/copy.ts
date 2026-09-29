// Privacy copy (technical-plan.md §2.10 / T-00.6). The health-information
// consent copy is shared with web and lives in `@chefer/types`
// (HEALTH_CONSENT_COPY) so both platforms say exactly the same thing; it is
// re-exported here so this feature's strings stay in one place. Scanned by the
// `chefer/no-forbidden-copy` ESLint rule (base.js).
//
// PENDING COUNSEL REVIEW (UX-26, Q-7): every health-consent string is draft.

import { HEALTH_CONSENT_COPY } from '@chefer/types';

export { HEALTH_CONSENT_COPY };

export type PrivacyCopyKey = never;

export const PRIVACY_COPY: Record<PrivacyCopyKey, string> = {};

/** Shown where a health save was skipped because the user chose "Don't save it". */
export const HEALTH_DECLINED_BODY_NOTICE =
  'Your goal and measurements weren’t saved, so targets use the defaults.';
