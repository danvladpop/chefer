// ─── Legal document versions (T-39.1, §2.13) ───────────────────────────────────
// The single source of truth for "which version of the Terms/Privacy Policy is
// current" — registration, the re-accept sheet (`privacy.acceptTerms`) and the
// in-app legal screen all read from here, so a document update only needs one
// constant bumped. Each date matches the `EFFECTIVE_DATE` printed on its page:
// apps/web/src/app/terms/page.tsx and .../privacy/page.tsx — bump them together.
//
// Terms and Privacy are accepted as one combined action ("I agree to the Terms
// and the Privacy Policy"), so `CURRENT_TERMS_VERSION` — the later of the two
// dates — is the one version string sent as `auth.register`'s
// `acceptedTermsVersion`, logged for both the TERMS and PRIVACY consent kinds,
// and compared by the re-accept sheet (web + mobile). Updating either document
// therefore asks signed-in users to accept again. The server accepts any
// version string, so binaries still carrying an older constant keep working.

export const LEGAL_VERSIONS = {
  terms: '2026-09-26',
  // Wave 4: the policy now describes the health-information consent, the
  // export's contents and the app's optional usage analytics.
  privacy: '2026-09-30',
} as const;

/** The combined version string clients send/compare (`YYYY-MM-DD`, the later document date). */
function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

export const CURRENT_TERMS_VERSION: string = laterOf(LEGAL_VERSIONS.terms, LEGAL_VERSIONS.privacy);

export type LegalDoc = 'terms' | 'privacy';
