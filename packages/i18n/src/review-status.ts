import type { Namespace } from './types';

// ─── Romanian review status (Lane J) ─────────────────────────────────────────
// Romanian copy is drafted by an agent and read by a native speaker before it
// is considered final. Every namespace has a row, so a new namespace cannot
// ship without someone deciding its status. `pnpm --filter @chefer/i18n
// review-sheet` writes docs/i18n/ro-review.md (English and Romanian side by
// side) from the namespaces still marked 'machine-draft'.

export type ReviewStatus = 'machine-draft' | 'owner-reviewed';

export const roReviewStatus: Readonly<Record<Namespace, ReviewStatus>> = {
  common: 'machine-draft',
  settings: 'machine-draft',
  email: 'machine-draft',
  auth: 'machine-draft',
  legal: 'machine-draft',
  consent: 'machine-draft',
  recipes: 'machine-draft',
  cook: 'machine-draft',
  gym: 'machine-draft',
  friends: 'machine-draft',
  nav: 'machine-draft',
};
