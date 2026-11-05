'use client';

import { useEffect, useState } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Camera, Pencil } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import {
  EAT_OUT_CUISINE_LABELS,
  EAT_OUT_CUISINES,
  EAT_OUT_SIZE_HINTS,
  EAT_OUT_SIZE_LABELS,
  EAT_OUT_SIZES,
  eatOutEstimate,
  eatOutLogValues,
  eatOutMealName,
  formatEatOutKcal,
  formatEatOutProtein,
  HIDE_NUMBERS_COPY,
  proteinLabel,
  QUICK_ADD_MEAL_TYPES,
  type EatOutCuisine,
  type EatOutSize,
} from '@chefer/utils';
import type { ReplacementInput, SlotTarget } from '../lib/use-slot-actions';

// ─── "Ate something else" (WP-06, Food 1) ─────────────────────────────────────
// ONE sheet, three ways in, for what you had instead of a planned meal:
//   1. Quick estimate — cuisine + size → a RANGE, free, no AI. Logs the middle
//      of the range with carbs and fat marked unknown.
//   2. Recent — what you've logged before (custom entries and recipes), one
//      tap. A recipe is logged as a custom entry carrying that recipe's
//      numbers, so the planned slot is replaced rather than a second recipe
//      ticked on it.
//   3. Describe or snap — the quick-add text flow and the photo scan, both
//      pre-targeted at this slot (they live in SlotActionsHost).
// The quick-estimate path is: ⋯ → "Ate something else" → cuisine → Log it
// (the cuisine and size you used last are remembered, so a repeat is three taps).

type Tab = 'estimate' | 'recent' | 'describe';

const TABS: Tab[] = ['estimate', 'recent', 'describe'];

const LAST_KEY = 'chefer.ate-else.last';

type Last = { cuisine: EatOutCuisine; size: EatOutSize };

function readLast(): Last | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LAST_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { cuisine, size } = parsed as Record<string, unknown>;
    const c = EAT_OUT_CUISINES.find((x) => x === cuisine);
    const s = EAT_OUT_SIZES.find((x) => x === size);
    return c && s ? { cuisine: c, size: s } : null;
  } catch {
    return null; // private window / blocked storage: no memory, nothing breaks
  }
}

function writeLast(last: Last): void {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify(last));
  } catch {
    // ignore — remembering is a convenience
  }
}

interface AteSomethingElseSheetProps {
  open: boolean;
  onClose: () => void;
  target: SlotTarget | null;
  /** Logs the replacement (the flow's optimistic write). */
  onLog: (slot: SlotTarget, input: ReplacementInput) => void;
  onDescribe: () => void;
  onSnap: () => void;
}

export function AteSomethingElseSheet({
  open,
  onClose,
  target,
  onLog,
  onDescribe,
  onSnap,
}: AteSomethingElseSheetProps) {
  const { t } = useT();
  // WP-08: protein-only mode asks protein first and never shows a calorie figure.
  const { proteinOnly, noNumbers } = useNumbersMode();
  const [tab, setTab] = useState<Tab>('estimate');
  const [cuisine, setCuisine] = useState<EatOutCuisine | null>(null);
  const [size, setSize] = useState<EatOutSize>('normal');

  useEffect(() => {
    if (!open) return;
    setTab('estimate');
    const last = readLast();
    setCuisine(last?.cuisine ?? null);
    setSize(last?.size ?? 'normal');
  }, [open]);

  const recents = trpc.tracker.recents.useQuery(
    { limit: 15 },
    { enabled: open && tab === 'recent' },
  );

  const estimate = cuisine ? eatOutEstimate(cuisine, size) : null;
  // The slot's meal as it sits in a sentence ("in place of dinner").
  const mealType = QUICK_ADD_MEAL_TYPES.find((m) => m === target?.mealType) ?? 'snack';
  const label = t(`tracker.mealInSentence.${mealType}`);

  const logEstimate = () => {
    if (!target || !cuisine || !estimate) return;
    writeLast({ cuisine, size });
    const { kcal, protein } = eatOutLogValues(estimate);
    onLog(target, {
      name: eatOutMealName(cuisine, size),
      kcal,
      protein,
      // Restaurant carbs and fat are not guessed at — they are marked unknown.
      unknownMacros: ['carbs', 'fat'],
      estimatedBy: 'manual',
    });
    onClose();
  };

  const chip = (selected: boolean) =>
    `min-h-11 min-w-0 rounded-full border px-3 text-sm font-medium ${
      selected
        ? 'border-[#944a00] bg-[#944a00] text-white'
        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
    }`;

  return (
    <Sheet
      open={open && target !== null}
      onClose={onClose}
      title={t('tracker.ateElse.title')}
      description={t('tracker.ateElse.inPlaceOf', { meal: label })}
      size="sm"
      footer={
        tab === 'estimate' ? (
          <button
            type="button"
            data-testid="ate-else-log"
            onClick={logEstimate}
            disabled={!estimate}
            className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {t('tracker.ateElse.logIt')}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4 px-5 pb-4">
        <div
          role="tablist"
          aria-label={t('tracker.ateElse.tabsLabel')}
          className="flex gap-1 rounded-xl bg-neutral-100 p-1"
        >
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={`ate-else-tab-${id}`}
              onClick={() => setTab(id)}
              className={`min-h-11 min-w-0 flex-1 rounded-lg px-1 text-xs font-semibold ${
                tab === id ? 'bg-white text-[#944a00] shadow-sm' : 'text-neutral-600'
              }`}
            >
              {t(`tracker.ateElse.tabs.${id}`)}
            </button>
          ))}
        </div>

        {tab === 'estimate' && (
          <div className="space-y-4">
            <div
              role="group"
              aria-label={t('tracker.ateElse.cuisinesLabel')}
              className="flex flex-wrap gap-2"
            >
              {EAT_OUT_CUISINES.map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid={`ate-else-cuisine-${c}`}
                  aria-pressed={cuisine === c}
                  onClick={() => setCuisine(c)}
                  className={chip(cuisine === c)}
                >
                  {EAT_OUT_CUISINE_LABELS[c]}
                </button>
              ))}
            </div>
            <div
              role="group"
              aria-label={t('tracker.ateElse.sizeLabel')}
              className="grid grid-cols-3 gap-2"
            >
              {EAT_OUT_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`ate-else-size-${s}`}
                  aria-pressed={size === s}
                  onClick={() => setSize(s)}
                  className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-center ${
                    size === s
                      ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <span className="text-sm font-semibold">{EAT_OUT_SIZE_LABELS[s]}</span>
                  {cuisine && (
                    <span className="mt-0.5 text-xs leading-tight text-neutral-500">
                      {EAT_OUT_SIZE_HINTS[cuisine][s]}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p
              data-testid="ate-else-range"
              aria-live="polite"
              className="min-w-0 rounded-xl bg-neutral-50 px-3 py-3 text-center text-sm font-semibold text-neutral-800"
            >
              {estimate
                ? noNumbers
                  ? HIDE_NUMBERS_COPY.estimateHidden
                  : proteinOnly
                    ? formatEatOutProtein(estimate)
                    : `${formatEatOutKcal(estimate)} · ${formatEatOutProtein(estimate)}`
                : t('tracker.ateElse.pick')}
            </p>
          </div>
        )}

        {tab === 'recent' && (
          <div className="space-y-1.5">
            {recents.isLoading && (
              <p className="py-2 text-sm text-neutral-500">{t('common.states.loading')}</p>
            )}
            {recents.isError && (
              <p role="alert" className="py-2 text-sm text-neutral-600">
                {t('tracker.ateElse.recentError')}
              </p>
            )}
            {recents.data?.length === 0 && (
              <p className="py-2 text-sm text-neutral-500">{t('tracker.ateElse.recentEmpty')}</p>
            )}
            {recents.data?.map((r) => (
              <div
                key={r.key}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800">{r.name}</p>
                  {noNumbers ? null : (
                    <p className="text-xs text-neutral-500">
                      {proteinOnly
                        ? proteinLabel(r.protein)
                        : t('tracker.ateElse.recentKcal', { kcal: Math.round(r.kcal) })}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  data-testid={`ate-else-recent-${r.key}`}
                  aria-label={t('tracker.ateElse.logFor', { name: r.name, meal: label })}
                  onClick={() => {
                    if (!target) return;
                    onLog(target, {
                      name: r.name,
                      kcal: r.kcal,
                      protein: r.protein,
                      carbs: r.carbs,
                      fat: r.fat,
                      ...(r.unknownMacros && { unknownMacros: r.unknownMacros }),
                      estimatedBy: r.estimatedBy ?? 'manual',
                    });
                    onClose();
                  }}
                  className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-[#944a00] hover:bg-[#fff2e2]"
                >
                  {t('tracker.ateElse.log')}
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'describe' && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-testid="ate-else-describe"
              onClick={onDescribe}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              <Pencil className="h-4 w-4 shrink-0 text-[#944a00]" aria-hidden="true" />
              <span className="min-w-0">{t('tracker.ateElse.describe')}</span>
            </button>
            <button
              type="button"
              data-testid="ate-else-snap"
              onClick={onSnap}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              <Camera className="h-4 w-4 shrink-0 text-[#944a00]" aria-hidden="true" />
              <span className="min-w-0">{t('tracker.ateElse.snap')}</span>
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
