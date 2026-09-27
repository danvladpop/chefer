// ─── Share list (§T-13.1 W0 scaffold) ──────────────────────────────────────────
// Formats a shopping list / a week's dinners as a share-safe (no emoji, no
// markdown) plain-text message. This wave ships the shape and a working
// baseline join; T-13.1 (wave 1, owned by L-PLAN2) fills in aisle ordering,
// custom lines under their aisle, the "have it" pantry-covered suffix and
// the checked-omitted "What's left" scope.

export type ShareListScope = 'everything' | 'whatsLeft';

export interface ShareListItem {
  aisle: string;
  name: string;
  amount?: string;
  checked?: boolean;
  /** Pantry-covered — rendered as "(have it)" in the "Everything" scope. */
  haveIt?: boolean;
}

export interface ShareListOptions {
  scope: ShareListScope;
  withAmounts: boolean;
  units: 'metric' | 'imperial';
}

export const SHARE_LIST_FOOTER_TEMPLATE = 'Made with Chefer · {url}';

export function shareListFooter(url: string): string {
  return SHARE_LIST_FOOTER_TEMPLATE.replace('{url}', url);
}

/**
 * `formatListForSharing(list, options)` — the sharing message body. Baseline
 * behaviour: one line per item (name + amount when requested), checked items
 * omitted from "What's left", pantry-covered items suffixed "(have it)" in
 * "Everything". Aisle grouping/ordering is wave 1.
 */
export function formatListForSharing(
  list: readonly ShareListItem[],
  options: ShareListOptions,
  shareUrl?: string,
): string {
  const visible = options.scope === 'whatsLeft' ? list.filter((item) => !item.checked) : list;
  const lines = visible.map((item) => formatItemLine(item, options));
  const body = lines.join('\n');
  return shareUrl ? `${body}\n\n${shareListFooter(shareUrl)}` : body;
}

function formatItemLine(item: ShareListItem, options: ShareListOptions): string {
  const amount = options.withAmounts && item.amount ? `${item.amount} ` : '';
  const haveIt = item.haveIt ? ' (have it)' : '';
  return `${amount}${item.name}${haveIt}`;
}

export interface ShareDinner {
  dayLabel: string;
  recipeName: string;
}

/** "Mon: Chicken Stir-fry" per day — the week-summary sheet's dinners share. */
export function formatDinnersForSharing(
  dinners: readonly ShareDinner[],
  shareUrl?: string,
): string {
  const body = dinners.map((d) => `${d.dayLabel}: ${d.recipeName}`).join('\n');
  return shareUrl ? `${body}\n\n${shareListFooter(shareUrl)}` : body;
}
