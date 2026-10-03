import type { Href } from 'expo-router';

// The in-app legal pages (`app/legal/[doc].tsx`). UX-ACC-19: every Terms /
// Privacy link in the app opens THIS screen (a pinned WebView, App Review
// R-01), not the system browser — Welcome, Register, More, Settings and
// Profile all go through `legalHref`. The two documents are the only ones
// there are: an unknown `/legal/<anything>` is "page not found", never a
// silent Terms.

export type LegalDoc = 'terms' | 'privacy';

export const LEGAL_TITLES: Record<LegalDoc, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

/** The route param → a known document, or null (also for `['terms']` array params). */
export function legalDocFor(raw: string | string[] | undefined): LegalDoc | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'terms' || value === 'privacy' ? value : null;
}

/** A `#section` of the page, e.g. `analytics`: letters, digits and dashes only. */
export function legalAnchorFor(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && /^[a-z][a-z0-9-]{0,40}$/i.test(value) ? value : null;
}

/** The website path behind a document (`/privacy`). */
export function legalWebPath(doc: LegalDoc): string {
  return `/${doc}`;
}

/** The in-app route for a document, optionally scrolled to a `#section`. */
export function legalHref(doc: LegalDoc, anchor?: string): Href {
  return anchor ? `/legal/${doc}?anchor=${anchor}` : `/legal/${doc}`;
}
