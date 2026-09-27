// Privacy copy (technical-plan.md §2.10 / T-00.6). Empty scaffold: the
// L-CONSENT / L-DATA lanes fill this in as they build the privacy & data
// surfaces (UX-12, UX-26, UX-39), so every user-facing string in this
// feature lives in one place instead of inline in JSX. Scanned by the
// `chefer/no-forbidden-copy` ESLint rule (base.js).

export type PrivacyCopyKey = never;

export const PRIVACY_COPY: Record<PrivacyCopyKey, string> = {};
