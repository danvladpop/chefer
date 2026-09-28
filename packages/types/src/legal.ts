// ─── Legal document versions (T-39.1, §2.13) ───────────────────────────────────
// The single source of truth for "which version of the Terms/Privacy Policy is
// current" — registration, the re-accept sheet (`privacy.acceptTerms`) and the
// in-app legal screen all read from here, so a document update only needs one
// constant bumped. Dates match the `EFFECTIVE_DATE` printed on
// apps/web/src/app/terms/page.tsx and .../privacy/page.tsx — bump both together.
//
// Terms and Privacy are accepted as one combined action ("I agree to the Terms
// and the Privacy Policy"), so `CURRENT_TERMS_VERSION` is the one version string
// sent as `auth.register`'s `acceptedTermsVersion` and logged for both the
// TERMS and PRIVACY consent kinds.

export const LEGAL_VERSIONS = {
  terms: '2026-09-26',
  privacy: '2026-09-26',
} as const;

/** The combined version string clients send/compare (`YYYY-MM-DD`, terms date). */
export const CURRENT_TERMS_VERSION: string = LEGAL_VERSIONS.terms;

export type LegalDoc = 'terms' | 'privacy';
