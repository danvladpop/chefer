import type { Translator } from '@chefer/i18n';
import type { ListPersonDto } from '@chefer/types';

// Lane J phase 4: the Shop screens' words built from the translator — the
// list window ("Fri–Sun"), the provenance line, aisle names and the shared
// list's "who" line. Both the old Shop tab and the shell's Shop use them.

type T = Translator['t'];

const SHORT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** null for a whole-week list; otherwise "Fri–Sun" or "Sun only" (shoppingWindowLabel). */
export function shopWindowText(t: T, fromDayOfWeek: number | null | undefined): string | null {
  if (fromDayOfWeek == null || fromDayOfWeek <= 0) return null;
  const from = t(`common.weekdaysShort.${SHORT_DAYS[Math.min(6, fromDayOfWeek)] ?? 'sun'}`);
  return fromDayOfWeek >= 6
    ? t('plan.shopping.windowOnly', { day: from })
    : t('plan.shopping.windowRange', { from, to: t('common.weekdaysShort.sun') });
}

/** "From your plan's recipes · Mon–Sun" (shoppingProvenanceText). */
export function shopProvenanceText(t: T, fromDayOfWeek: number | null | undefined): string {
  const window =
    shopWindowText(t, fromDayOfWeek) ??
    t('plan.shopping.windowRange', {
      from: t('common.weekdaysShort.mon'),
      to: t('common.weekdaysShort.sun'),
    });
  return t('plan.shopping.provenance', { window });
}

// The API's `other` aisle is the catalog's `misc` key (an `other` key reads as a plural).
const AISLE_KEYS = {
  produce: 'produce',
  proteins: 'proteins',
  dairy: 'dairy',
  grains: 'grains',
  frozen: 'frozen',
  other: 'misc',
} as const;
const aisleKey = (category: string) =>
  Object.prototype.hasOwnProperty.call(AISLE_KEYS, category)
    ? AISLE_KEYS[category as keyof typeof AISLE_KEYS]
    : null;

/** The old Shop tab's aisle name (CATEGORY_LABELS). */
export function shopCategoryLabel(t: T, category: string): string {
  const key = aisleKey(category);
  return key ? t(`plan.shopping.categories.${key}`) : category;
}

/** The shell Shop's aisle name (SHOP_GROUP_LABELS). */
export function shellAisleLabel(t: T, category: string): string {
  const key = aisleKey(category);
  return key ? t(`plan.shopping.shellAisles.${key}`) : category;
}

/** "Ticked by Maria" / "Ticked by you" (ADR 0003). */
export function checkedByText(t: T, person: ListPersonDto): string {
  return person.isYou
    ? t('household.sharing.checkedByYou')
    : t('household.sharing.checkedBy', { name: person.name });
}

/** "Added by Maria" / "Added by you" (ADR 0003). */
export function addedByText(t: T, person: ListPersonDto): string {
  return person.isYou
    ? t('household.sharing.addedByYou')
    : t('household.sharing.addedBy', { name: person.name });
}
