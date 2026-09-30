import type { ShareListScope } from '@chefer/utils';
import { kv } from '../gym/offline/kv';

// T-13.2 — the share choice (scope, amounts, dinners) is remembered per
// device in the same on-device KV store the gym uses.

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

const KEY = 'shop.share-list.prefs.v1';

export function loadSharePrefs(): ShareListPrefs {
  const raw = kv.getJSON(KEY);
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SHARE_PREFS;
  const r = raw as Record<string, unknown>;
  return {
    scope: r.scope === 'everything' ? 'everything' : 'whatsLeft',
    withAmounts:
      typeof r.withAmounts === 'boolean' ? r.withAmounts : DEFAULT_SHARE_PREFS.withAmounts,
    withDinners:
      typeof r.withDinners === 'boolean' ? r.withDinners : DEFAULT_SHARE_PREFS.withDinners,
  };
}

export function saveSharePrefs(prefs: ShareListPrefs): void {
  kv.setJSON(KEY, prefs);
}
