'use client';

import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Sheet } from '@chefer/ui';
import {
  dinnersFromPlan,
  weekdayShortName,
  type ShareListScope,
  type UnitSystem,
} from '@chefer/utils';
import {
  buildShopShareText,
  canNativeShare,
  loadSharePrefs,
  offeredScopes,
  saveSharePrefs,
  scopeLabel,
  shareCounts,
  shareOrCopy,
  toShareItems,
  type ShareListPrefs,
  type ShopItemLike,
} from '../share-list';

// ─── Send the list (UX-13, T-13.3) ─────────────────────────────────────────────
// Web mirror of mobile's share-list sheet. Builds the text with the shared
// `formatListForSharing` and hands it to `navigator.share` when the browser has
// it, else copies it (Copy list → "List copied."). The choice is remembered on
// this device. Sharing is not an AI call.

export interface ShareListDialogProps {
  open: boolean;
  onClose: () => void;
  items: readonly ShopItemLike[];
  checkedKeys: readonly string[];
  weekOffset: number;
  weekStart: Date;
  fromDayOfWeek?: number | null | undefined;
  portions?: number | null | undefined;
  unitSystem: UnitSystem;
}

export function ShareListDialog({
  open,
  onClose,
  items,
  checkedKeys,
  weekOffset,
  weekStart,
  fromDayOfWeek,
  portions,
  unitSystem,
}: ShareListDialogProps) {
  const [prefs, setPrefs] = useState<ShareListPrefs>(() => loadSharePrefs());
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const native = canNativeShare();

  // The planned dinners come from the same week's plan; only fetched when opened.
  const { data: plan } = trpc.mealPlan.getForWeek.useQuery({ weekOffset }, { enabled: open });
  const dinners = useMemo(() => (plan ? dinnersFromPlan(plan.days, weekdayShortName) : []), [plan]);

  useEffect(() => {
    if (open) {
      setPrefs(loadSharePrefs());
      setStatus('idle');
    }
  }, [open]);

  const counts = shareCounts(toShareItems(items, checkedKeys));
  const scopes = offeredScopes(counts);
  // A remembered "What's left" is not on offer when nothing is left to filter.
  const scope: ShareListScope = scopes.includes(prefs.scope) ? prefs.scope : 'everything';
  const empty = items.length === 0;

  const update = (patch: Partial<ShareListPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveSharePrefs(next);
    setStatus('idle');
  };

  const send = async () => {
    const text = buildShopShareText({
      items,
      checkedKeys,
      weekStart,
      fromDayOfWeek,
      portions,
      scope,
      withAmounts: prefs.withAmounts,
      withDinners: prefs.withDinners && dinners.length > 0,
      dinners,
      unitSystem,
      shareUrl: window.location.origin,
    });
    const outcome = await shareOrCopy(text);
    if (outcome === 'shared') onClose();
    else if (outcome === 'copied') setStatus('copied');
    else if (outcome === 'failed') setStatus('failed');
  };

  const checkboxCls =
    'h-5 w-5 rounded border-gray-300 text-[#944a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Send the list"
      description="Share it as plain text, ready for WhatsApp or Notes"
      size="sm"
      footer={
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            data-testid="share-list-send"
            disabled={empty}
            onClick={() => void send()}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {native ? 'Share…' : 'Copy list'}
          </button>
          <p
            role="status"
            aria-live="polite"
            data-testid="share-list-status"
            className="min-h-4 text-center text-xs text-gray-600"
          >
            {status === 'copied' && 'List copied.'}
            {status === 'failed' && 'Couldn’t share the list. Try again.'}
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 pb-4">
        <fieldset className="flex flex-col">
          <legend className="sr-only">What to send</legend>
          {scopes.map((s) => (
            <label key={s} className="flex min-h-11 items-center gap-3 text-sm text-gray-800">
              <input
                type="radio"
                name="share-list-scope"
                data-testid={`share-list-scope-${s}`}
                checked={scope === s}
                onChange={() => update({ scope: s })}
                className="h-5 w-5 border-gray-300 text-[#944a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]"
              />
              {scopeLabel(s, s === 'whatsLeft' ? counts.whatsLeft : counts.everything)}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col">
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-gray-800">
            Include amounts
            <input
              type="checkbox"
              data-testid="share-list-amounts"
              checked={prefs.withAmounts}
              onChange={(e) => update({ withAmounts: e.target.checked })}
              className={checkboxCls}
            />
          </label>
          {dinners.length > 0 && (
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-gray-800">
              Add this week’s dinners
              <input
                type="checkbox"
                data-testid="share-list-dinners"
                checked={prefs.withDinners}
                onChange={(e) => update({ withDinners: e.target.checked })}
                className={checkboxCls}
              />
            </label>
          )}
        </div>
      </div>
    </Sheet>
  );
}
