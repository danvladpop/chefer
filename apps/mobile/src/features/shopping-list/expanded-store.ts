import { kv } from '../gym/offline/kv';

// UX-SHOP-02: the Shop aisles used to start collapsed on every visit, so the
// list you came to read was hidden behind six taps. The choice is remembered
// on the device (same KV store as the share prefs), and an aisle nobody has
// touched is OPEN — the list is what the screen is for.

const KEY = 'shop.aisles-expanded.v1';

export type ExpandedAisles = Record<string, boolean>;

export function loadExpandedAisles(): ExpandedAisles {
  const raw = kv.getJSON(KEY);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  );
}

export function saveExpandedAisles(aisles: ExpandedAisles): void {
  kv.setJSON(KEY, aisles);
}

/** An aisle is open unless the user closed it. */
export function isAisleExpanded(aisles: ExpandedAisles, aisle: string): boolean {
  return aisles[aisle] ?? true;
}
