import {
  dinnersHeadingFor,
  formatListForSharing,
  shareableItems,
  shareListSubtitle,
  shareListTitle,
  type ShareDinner,
  type ShareListItem,
  type ShareListScope,
  type UnitSystem,
} from '@chefer/utils';

// ─── Share the list (UX-13, T-13.3) ────────────────────────────────────────────
// The glue between the Shop page's data and the shared `formatListForSharing`:
// items mapped in the page's aisle order, title/subtitle/units, the remembered
// choice, and share-or-copy delivery. Pure (no React) so it is unit-tested; the
// dialog only calls it. Sharing is not an AI call.

export const CATEGORY_ORDER = [
  'produce',
  'proteins',
  'dairy',
  'grains',
  'frozen',
  'other',
] as const;
export const CATEGORY_LABELS: Record<string, string> = {
  produce: 'Produce',
  proteins: 'Proteins',
  dairy: 'Dairy & Eggs',
  grains: 'Grains & Pantry',
  frozen: 'Frozen',
  other: 'Other',
};

export interface ShopItemLike {
  key: string;
  ingredientName: string;
  category: string;
  quantity: number | string;
  unit: string;
  pantryCovered?: boolean | undefined;
  isCustom?: boolean | undefined;
}

/** The list's items as ShareListItems, in the page's aisle order then item order. */
export function toShareItems(
  items: readonly ShopItemLike[],
  checkedKeys: readonly string[],
): ShareListItem[] {
  const known: readonly string[] = CATEGORY_ORDER;
  const aisleOf = (i: ShopItemLike) => (known.includes(i.category) ? i.category : 'other');
  return CATEGORY_ORDER.flatMap((aisle) =>
    items
      .filter((i) => aisleOf(i) === aisle)
      .map(
        (i): ShareListItem => ({
          aisle,
          name: i.ingredientName,
          quantity: i.quantity,
          unit: i.unit,
          checked: checkedKeys.includes(i.key),
          haveIt: i.pantryCovered === true,
          isCustom: i.isCustom === true,
        }),
      ),
  );
}

/** How many lines each scope would send — the dialog's `· n items`. */
export function shareCounts(shareItems: readonly ShareListItem[]): {
  everything: number;
  whatsLeft: number;
} {
  return {
    everything: shareableItems(shareItems, 'everything').length,
    whatsLeft: shareableItems(shareItems, 'whatsLeft').length,
  };
}

/**
 * The scopes to offer, in order. When "What's left" would send exactly what
 * "Everything" does (nothing ticked, nothing pantry-covered) only `everything`
 * is offered — two identical choices are noise.
 */
export function offeredScopes(counts: { everything: number; whatsLeft: number }): ShareListScope[] {
  return counts.whatsLeft === counts.everything ? ['everything'] : ['whatsLeft', 'everything'];
}

export function scopeLabel(scope: ShareListScope, count: number): string {
  const n = `${count} item${count === 1 ? '' : 's'}`;
  return scope === 'whatsLeft' ? `What’s left to buy · ${n}` : `Everything · ${n}`;
}

export function buildShopShareText(input: {
  items: readonly ShopItemLike[];
  checkedKeys: readonly string[];
  weekStart: Date;
  fromDayOfWeek?: number | null | undefined;
  portions?: number | null | undefined;
  scope: ShareListScope;
  withAmounts: boolean;
  withDinners: boolean;
  dinners: readonly ShareDinner[];
  /** Which week the list is for — heads the dinners block (UX-PLAN-07); absent = this week. */
  weekOffset?: number | undefined;
  unitSystem: UnitSystem;
  shareUrl?: string | undefined;
}): string {
  const subtitle = shareListSubtitle({
    dinnersCount: input.dinners.length,
    portions: input.portions ?? null,
  });
  return formatListForSharing(
    toShareItems(input.items, input.checkedKeys),
    {
      scope: input.scope,
      withAmounts: input.withAmounts,
      units: input.unitSystem === 'IMPERIAL' ? 'imperial' : 'metric',
      withDinners: input.withDinners,
      dinners: input.dinners,
      ...(input.weekOffset !== undefined && {
        dinnersHeading: dinnersHeadingFor(input.weekOffset),
      }),
      title: shareListTitle({
        weekStart: input.weekStart,
        ...(input.fromDayOfWeek !== undefined && { fromDayOfWeek: input.fromDayOfWeek }),
      }),
      ...(subtitle && { subtitle }),
      aisleLabels: CATEGORY_LABELS,
    },
    input.shareUrl,
  );
}

// ─── The remembered choice ─────────────────────────────────────────────────────

export interface ShareListPrefs {
  scope: ShareListScope;
  withAmounts: boolean;
  withDinners: boolean;
}

export const DEFAULT_SHARE_PREFS: ShareListPrefs = {
  scope: 'whatsLeft',
  withAmounts: true,
  withDinners: false,
};

const PREFS_KEY = 'chefer.share-list.prefs.v1';

export function loadSharePrefs(): ShareListPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SHARE_PREFS;
    const r = parsed as { scope?: unknown; withAmounts?: unknown; withDinners?: unknown };
    return {
      scope: r.scope === 'everything' ? 'everything' : 'whatsLeft',
      withAmounts:
        typeof r.withAmounts === 'boolean' ? r.withAmounts : DEFAULT_SHARE_PREFS.withAmounts,
      withDinners:
        typeof r.withDinners === 'boolean' ? r.withDinners : DEFAULT_SHARE_PREFS.withDinners,
    };
  } catch {
    return DEFAULT_SHARE_PREFS;
  }
}

export function saveSharePrefs(prefs: ShareListPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked — the choice just isn't remembered.
  }
}

// ─── Delivery ──────────────────────────────────────────────────────────────────

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

interface ShareEnv {
  share?: ((data: { text: string }) => Promise<void>) | undefined;
  writeText?: ((text: string) => Promise<void>) | undefined;
}

/** What this browser can do: the native share sheet, or copying to the clipboard. */
export function canNativeShare(env: ShareEnv = browserEnv()): boolean {
  return typeof env.share === 'function';
}

function browserEnv(): ShareEnv {
  if (typeof navigator === 'undefined') return {};
  // Absent on insecure origins even though the DOM types say it always exists.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  return {
    share: typeof navigator.share === 'function' ? (d) => navigator.share(d) : undefined,
    writeText: clipboard ? (t) => clipboard.writeText(t) : undefined,
  };
}

/**
 * `navigator.share({ text })` when the browser has it, else the Clipboard API.
 * Dismissing the native sheet is `cancelled` (nothing to report), not a failure;
 * a share that throws for any other reason falls back to copying.
 */
export async function shareOrCopy(
  text: string,
  env: ShareEnv = browserEnv(),
): Promise<ShareOutcome> {
  if (env.share) {
    try {
      await env.share({ text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // fall through to copy
    }
  }
  if (env.writeText) {
    try {
      await env.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}
