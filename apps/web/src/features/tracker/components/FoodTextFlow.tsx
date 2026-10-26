'use client';

import { useState } from 'react';
import { useAiConsent } from '@/features/ai-consent/AiConsentProvider';
import { capture } from '@/lib/analytics';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { X } from 'lucide-react';
import {
  FOOD_TEXT_COPY,
  FOOD_TEXT_LIMITS,
  foodTextSchema,
  type ParsedFoodItem,
} from '@chefer/types';
import {
  foodTextTotal,
  parsedItemAmount,
  parsedItemToLogItem,
  userFacingErrorMessage,
} from '@chefer/utils';

// Web counterpart of mobile's food-text-flow.tsx (lane A4): type what you
// ate → tracker.parseFoodText (AI consent; free 10 a day) → review and edit
// the matched items → tracker.logItems. The browser's own dictation works in
// the field; there is no custom voice capture.

export interface FoodTextFlowProps {
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  proteinOnly: boolean;
  onLogged: (data: RouterOutputs['tracker']['logItems'], count: number) => void;
}

export function FoodTextFlow({ date, mealType, proteinOnly, onLogged }: FoodTextFlowProps) {
  const requestAiConsent = useAiConsent();
  const [text, setText] = useState('');
  const [items, setItems] = useState<ParsedFoodItem[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseMutation = trpc.tracker.parseFoodText.useMutation({ meta: { silent: true } });
  const logMutation = trpc.tracker.logItems.useMutation({ meta: { silent: true } });

  const read = () => {
    const parsed = foodTextSchema.safeParse(text);
    if (!parsed.success) {
      setError('Type what you ate, e.g. “2 eggs and toast”.');
      return;
    }
    setError(null);
    requestAiConsent('food-text', () => {
      parseMutation.mutate(
        { text: parsed.data },
        {
          onSuccess: (result) => {
            capture('food_text_parsed', {
              itemCount: result.items.length,
              estimated: result.items.filter((i) => i.source === 'estimate').length,
            });
            setItems(result.items);
            setEdited(false);
            setAmounts(
              Object.fromEntries(result.items.map((i) => [i.key, String(parsedItemAmount(i))])),
            );
            if (result.items.length === 0) setError(FOOD_TEXT_COPY.nothingFound);
          },
          onError: (err) => setError(userFacingErrorMessage(err)),
        },
      );
    });
  };

  const amountOf = (item: ParsedFoodItem) => Number((amounts[item.key] ?? '').replace(',', '.'));
  const logItems = (items ?? []).map((item) => parsedItemToLogItem(item, amountOf(item)));
  const ready = logItems.filter((i): i is NonNullable<typeof i> => i !== null);
  const total = foodTextTotal(logItems);

  const log = () => {
    if (ready.length === 0) return;
    logMutation.mutate(
      { date, mealType, items: ready, rebalanceMode: 'preview' },
      {
        onSuccess: (data) => {
          capture('food_text_logged', { itemCount: ready.length, edited });
          onLogged(data, ready.length);
        },
        onError: (err) => setError(userFacingErrorMessage(err)),
      },
    );
  };

  const errorLine = error && (
    <p
      id="food-text-error"
      data-testid="food-text-error"
      role="alert"
      className="text-sm text-red-600"
    >
      {error}
    </p>
  );

  if (items && items.length > 0) {
    const countLabel = `${ready.length} ${ready.length === 1 ? 'item' : 'items'}`;
    return (
      <div data-testid="food-text-review" className="space-y-3">
        <p className="text-xs text-neutral-500">{FOOD_TEXT_COPY.reviewHint}</p>
        {items.map((item) => {
          const logged = parsedItemToLogItem(item, amountOf(item));
          const inputId = `food-text-amount-${item.key}`;
          return (
            <div
              key={item.key}
              data-testid={`food-text-item-${item.key}`}
              className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900">{item.name}</p>
                  <p className="text-xs text-neutral-500">
                    {`“${item.text}” · ${FOOD_TEXT_COPY.sourceLabel[item.source]}`}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid={`food-text-remove-${item.key}`}
                  aria-label={`Remove ${item.name}`}
                  onClick={() => {
                    setItems((prev) => (prev ?? []).filter((i) => i.key !== item.key));
                    setEdited(true);
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <label htmlFor={inputId} className="flex items-center gap-2 text-sm text-neutral-500">
                <span className="sr-only">
                  Amount of {item.name}, in {item.unit === 'g' ? 'grams' : 'servings'}
                </span>
                <input
                  id={inputId}
                  type="text"
                  inputMode="decimal"
                  data-testid={inputId}
                  value={amounts[item.key] ?? ''}
                  onChange={(e) => {
                    setAmounts((prev) => ({ ...prev, [item.key]: e.target.value }));
                    setEdited(true);
                  }}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-neutral-200 px-3 text-sm text-neutral-900"
                />
                <span className="shrink-0">{item.unit === 'g' ? 'g' : 'servings'}</span>
              </label>
              <p className="text-xs text-neutral-500">
                {logged
                  ? proteinOnly
                    ? `${logged.protein} g protein`
                    : `${logged.kcal} kcal · ${logged.protein} g P`
                  : '—'}
              </p>
            </div>
          );
        })}
        {errorLine}
        <button
          type="button"
          data-testid="food-text-log"
          disabled={ready.length === 0 || logMutation.isPending}
          onClick={log}
          className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
        >
          {logMutation.isPending
            ? 'Logging…'
            : proteinOnly
              ? `Log ${countLabel}`
              : `Log ${countLabel} · ${total} kcal`}
        </button>
        <button
          type="button"
          data-testid="food-text-again"
          onClick={() => setItems(null)}
          className="min-h-11 text-sm font-semibold text-[#944a00] hover:underline"
        >
          Change what I typed
        </button>
      </div>
    );
  }

  return (
    <form
      data-testid="food-text-start"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        read();
      }}
    >
      <label htmlFor="food-text-input" className="text-xs font-medium text-neutral-600">
        {FOOD_TEXT_COPY.entry}
      </label>
      <input
        id="food-text-input"
        type="text"
        data-testid="food-text-input"
        value={text}
        maxLength={FOOD_TEXT_LIMITS.maxChars}
        placeholder={FOOD_TEXT_COPY.placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'food-text-error' : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        className="min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
      />
      {errorLine}
      <button
        type="submit"
        data-testid="food-text-read"
        disabled={text.trim().length < 2 || parseMutation.isPending}
        className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
      >
        {parseMutation.isPending ? 'Reading…' : FOOD_TEXT_COPY.read}
      </button>
    </form>
  );
}
