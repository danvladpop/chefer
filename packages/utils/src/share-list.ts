import { shoppingWindowLabel } from './shopping-window';
import { formatQuantity } from './units';

// ─── Share list (UX-13, T-13.1) ────────────────────────────────────────────────
// Formats a shopping list / a week's dinners as a share-safe plain-text
// message for WhatsApp, Keep and Notes: no emoji, no markdown, `- ` bullets,
// one blank line between aisles, aisles in the list's own order, custom lines
// under their aisle. Pure and shared by mobile (`Share.share`) and web
// (`navigator.share` / Copy list). Sharing is not an AI call.

export type ShareListScope = 'everything' | 'whatsLeft';

export interface ShareListItem {
  /** The aisle id (`produce`) — grouping key, in first-appearance order. */
  aisle: string;
  name: string;
  /** A pre-formatted amount ("200 g"). Wins over `quantity` + `unit`. */
  amount?: string;
  /** Raw quantity + unit; formatted with the option's unit system. */
  quantity?: number | string;
  unit?: string;
  checked?: boolean;
  /** Pantry-covered — omitted from "What's left", marked "(have it)" in "Everything". */
  haveIt?: boolean;
  /** A line the user typed themselves — kept under its aisle like any other. */
  isCustom?: boolean;
}

export interface ShareListOptions {
  scope: ShareListScope;
  withAmounts: boolean;
  units: 'metric' | 'imperial';
  /** Append this week's dinners under the list. */
  withDinners?: boolean;
  /** "Shopping list · 28 Sep – 4 Oct" (see `shareListTitle`). */
  title?: string;
  /** "For 4 dinners · 2 portions". */
  subtitle?: string;
  /** Planned dinners, appended when `withDinners`. */
  dinners?: readonly ShareDinner[];
  /** Display names for aisle ids; the default is the id itself. */
  aisleLabels?: Readonly<Record<string, string>>;
}

export const SHARE_LIST_FOOTER_TEMPLATE = 'Made with Chefer · {url}';
export const SHARE_DINNERS_HEADING = 'This week’s dinners';

export function shareListFooter(url: string): string {
  return SHARE_LIST_FOOTER_TEMPLATE.replace('{url}', url);
}

// Emoji and pictographs (a custom item typed with one still shares cleanly).
const EMOJI_RE = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}/gu;
// Markdown a chat app could render: leading list/heading/quote markers.
const LEADING_MARKUP_RE = /^[\s\-*#>•]+/;

/** One line of text with no emoji, no leading markdown marker, single-spaced. */
function clean(text: string): string {
  return text
    .replace(EMOJI_RE, '')
    .replace(/[*`~]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(LEADING_MARKUP_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function amountOf(item: ShareListItem, options: ShareListOptions): string {
  if (item.amount) return clean(item.amount);
  if (item.quantity === undefined || item.quantity === '') return '';
  const q = Number(item.quantity);
  const system = options.units === 'imperial' ? 'IMPERIAL' : 'METRIC';
  if (Number.isFinite(q) && item.unit) return clean(formatQuantity(q, item.unit, system));
  return clean(`${item.quantity}${item.unit ? ` ${item.unit}` : ''}`);
}

function lineFor(item: ShareListItem, options: ShareListOptions): string {
  const name = clean(item.name);
  const amount = options.withAmounts ? amountOf(item, options) : '';
  const haveIt = options.scope === 'everything' && item.haveIt ? ' (have it)' : '';
  return `- ${name}${amount ? `, ${amount}` : ''}${haveIt}`;
}

/** The items that make it into the message for this scope. */
export function shareableItems(
  list: readonly ShareListItem[],
  scope: ShareListScope,
): ShareListItem[] {
  return scope === 'whatsLeft' ? list.filter((i) => !i.checked && !i.haveIt) : [...list];
}

/**
 * `formatListForSharing(list, options)` — the message body. Items are grouped
 * by aisle in first-appearance order under an upper-case aisle name, with a
 * blank line between aisles. "What's left" drops ticked and pantry-covered
 * lines; "Everything" keeps them (pantry-covered marked "(have it)").
 * `shareUrl` adds the one branding line.
 */
export function formatListForSharing(
  list: readonly ShareListItem[],
  options: ShareListOptions,
  shareUrl?: string,
): string {
  const blocks: string[] = [];
  const head = [options.title, options.subtitle].filter((l): l is string => !!l).map(clean);
  if (head.length > 0) blocks.push(head.join('\n'));

  const groups = new Map<string, ShareListItem[]>();
  for (const item of shareableItems(list, options.scope)) {
    const group = groups.get(item.aisle);
    if (group) group.push(item);
    else groups.set(item.aisle, [item]);
  }
  for (const [aisle, items] of groups) {
    const label = clean(options.aisleLabels?.[aisle] ?? aisle).toUpperCase();
    blocks.push([label, ...items.map((item) => lineFor(item, options))].join('\n'));
  }

  if (options.withDinners && options.dinners && options.dinners.length > 0) {
    blocks.push(dinnersBlock(options.dinners));
  }
  if (shareUrl) blocks.push(shareListFooter(shareUrl));
  return blocks.join('\n\n');
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Shopping list · 28 Sep – 4 Oct", or "Shopping list · Fri–Sun" for a mid-week list. */
export function shareListTitle(input: { weekStart: Date; fromDayOfWeek?: number | null }): string {
  const window = shoppingWindowLabel(input.fromDayOfWeek);
  if (window) return `Shopping list · ${window}`;
  // A fixed table, not Intl: "Sep" vs "Sept" differs by ICU build and must not vary in shared text.
  const fmt = (d: Date) => `${d.getDate()} ${SHORT_MONTHS[d.getMonth()] ?? ''}`;
  const end = new Date(input.weekStart);
  end.setDate(end.getDate() + 6);
  return `Shopping list · ${fmt(input.weekStart)} – ${fmt(end)}`;
}

/** "For 4 dinners · 2 portions" (either half may be missing). */
export function shareListSubtitle(input: {
  dinnersCount?: number;
  portions?: number | null;
}): string | undefined {
  const parts: string[] = [];
  if (input.dinnersCount && input.dinnersCount > 0) {
    parts.push(`For ${input.dinnersCount} dinner${input.dinnersCount === 1 ? '' : 's'}`);
  }
  if (input.portions && input.portions > 0) {
    parts.push(`${input.portions} portion${input.portions === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export interface ShareDinner {
  dayLabel: string;
  recipeName: string;
}

function dinnersBlock(dinners: readonly ShareDinner[]): string {
  return [
    SHARE_DINNERS_HEADING,
    ...dinners.map((d) => `${clean(d.dayLabel)}: ${clean(d.recipeName)}`),
  ].join('\n');
}

/**
 * The planned dinners of a week as ShareDinner rows, in weekday order: only
 * dinner slots that are actually planned (a dinners-only plan lists every
 * planned slot; a day with no dinner is left out).
 */
export function dinnersFromPlan(
  days: readonly {
    dayOfWeek: number;
    meals: readonly { type: string; recipe: { name: string } }[];
  }[],
  dayLabel: (dayOfWeek: number) => string,
): ShareDinner[] {
  return [...days]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .flatMap((d) =>
      d.meals
        .filter((m) => m.type === 'dinner')
        .map((m) => ({ dayLabel: dayLabel(d.dayOfWeek), recipeName: m.recipe.name })),
    );
}

/**
 * The week-summary sheet's dinners share: a heading, "Mon: Chicken Stir-fry"
 * per planned dinner, `Shopping list in Chefer`, and the branding footer.
 */
export function formatDinnersForSharing(
  dinners: readonly ShareDinner[],
  shareUrl?: string,
): string {
  const blocks = [dinnersBlock(dinners), 'Shopping list in Chefer'];
  if (shareUrl) blocks.push(shareListFooter(shareUrl));
  return blocks.join('\n\n');
}
