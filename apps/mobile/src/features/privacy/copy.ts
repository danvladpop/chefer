// Privacy copy. The health-consent and AI-consent text lives in the `consent`
// catalog (@chefer/i18n); only the English body notice below is still passed
// around as a constant by the screens that show it (health-notices.tsx
// recognises it and shows `consent.health.declinedBody`).

/** Shown where a health save was skipped because the user chose "Don't save it". */
export const HEALTH_DECLINED_BODY_NOTICE =
  'Your goal and measurements weren’t saved, so targets use the defaults.';
