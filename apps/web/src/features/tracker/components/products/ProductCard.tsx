'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  PACKAGED_PRODUCT_COPY,
  type PackagedProductView,
  type ProductAllergenWarning,
  type ProductAmount,
} from '@chefer/types';
import {
  formatNumber,
  productAllergenLine,
  productAllergenWarningText,
  productAmountGrams,
  productDisplayName,
  productMaxGrams,
  scaleProduct,
} from '@chefer/utils';

// Web counterpart of mobile's products/product-card.tsx (ADR 0005): warnings
// first (never blocking), the honest allergen line, grams or servings with a
// live preview from the same `scaleProduct` the server logs with, and the
// Open Food Facts (ODbL) attribution.

const GRAM_CHIPS = [30, 50, 100, 150, 200];
const SERVING_CHIPS = [0.5, 1, 1.5, 2];
const ONE_DP = { maximumFractionDigits: 1 };

export const chipClass = (selected: boolean) =>
  `min-h-11 rounded-full border px-3 text-xs font-medium ${selected ? 'border-[#944a00] bg-[#944a00] text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`;

export interface ProductCardProps {
  product: PackagedProductView;
  warnings: ProductAllergenWarning[];
  stale?: boolean;
  proteinOnly: boolean;
  logging: boolean;
  error: string | null;
  onLog: (amount: ProductAmount) => void;
  onCompleteNumbers: () => void;
}

function parseAmount(text: string): number {
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function ProductCard({
  product,
  warnings,
  stale = false,
  proteinOnly,
  logging,
  error,
  onLog,
  onCompleteNumbers,
}: ProductCardProps) {
  const hasServing = product.servingSizeG !== null;
  const [unit, setUnit] = useState<ProductAmount['unit']>(hasServing ? 'serving' : 'g');
  const [amountText, setAmountText] = useState(hasServing ? '1' : '100');

  const amountValue = parseAmount(amountText);
  const amount: ProductAmount =
    unit === 'g' ? { unit, grams: amountValue } : { unit, servings: amountValue };
  const grams = amountValue > 0 ? productAmountGrams(amount, product.servingSizeG) : null;
  const maxGrams = productMaxGrams(product.per100g);
  const tooMuch = grams !== null && grams > maxGrams;
  const scaled = grams !== null && !tooMuch ? scaleProduct(product.per100g, grams) : null;
  const complete = product.per100g.kcal !== null;

  const switchUnit = (next: ProductAmount['unit']) => {
    setUnit(next);
    setAmountText(next === 'g' ? String(product.servingSizeG ?? 100) : '1');
  };

  return (
    <div
      data-testid="product-card"
      className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3"
    >
      <div className="flex items-center gap-3">
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- Open Food Facts thumbnails, any host size
          <img
            src={product.imageUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p data-testid="product-name" className="text-sm font-semibold text-neutral-900">
            {productDisplayName(product)}
          </p>
          <p className="text-xs text-neutral-500">
            {product.isOwn
              ? product.source === 'LABEL'
                ? 'Your product · from a label photo'
                : 'Your product'
              : complete
                ? `${formatNumber(product.per100g.kcal ?? 0)} kcal / 100 g`
                : 'No calories yet'}
          </p>
        </div>
      </div>

      {warnings.length > 0 && (
        <div
          data-testid="product-allergen-warnings"
          role="alert"
          className="space-y-1 rounded-lg bg-amber-50 p-3"
        >
          {warnings.map((w) => (
            <p
              key={`${w.kind}:${w.allergenId}`}
              className="flex items-start gap-2 text-sm font-medium text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">{productAllergenWarningText(w)}</span>
            </p>
          ))}
        </div>
      )}
      <p data-testid="product-allergen-line" className="text-xs text-neutral-600">
        {productAllergenLine(product.allergens)}
      </p>
      {stale && <p className="text-xs text-amber-700">{PACKAGED_PRODUCT_COPY.stale}</p>}

      {complete ? (
        <>
          {hasServing && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Amount unit">
              <button
                type="button"
                data-testid="product-unit-serving"
                aria-pressed={unit === 'serving'}
                onClick={() => switchUnit('serving')}
                className={chipClass(unit === 'serving')}
              >
                Servings ({formatNumber(product.servingSizeG ?? 0, ONE_DP)} g)
              </button>
              <button
                type="button"
                data-testid="product-unit-g"
                aria-pressed={unit === 'g'}
                onClick={() => switchUnit('g')}
                className={chipClass(unit === 'g')}
              >
                Grams
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(unit === 'g' ? GRAM_CHIPS : SERVING_CHIPS).map((value) => (
              <button
                key={value}
                type="button"
                data-testid={`product-amount-${value}`}
                onClick={() => setAmountText(String(value))}
                className={chipClass(amountValue === value)}
              >
                {unit === 'g' ? `${value} g` : formatNumber(value, ONE_DP)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-500">
            <input
              type="number"
              inputMode="decimal"
              data-testid="product-amount-input"
              aria-label={unit === 'g' ? 'Grams eaten' : 'Servings eaten'}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className="min-h-11 w-full min-w-0 rounded-lg border border-neutral-200 px-3 text-sm text-neutral-900"
            />
            <span className="shrink-0">{unit === 'g' ? 'g' : 'servings'}</span>
          </label>
          <p
            data-testid="product-live-nutrition"
            aria-live="polite"
            className="text-xs text-neutral-600"
          >
            {tooMuch
              ? `One entry holds up to ${formatNumber(maxGrams)} g.`
              : scaled
                ? proteinOnly
                  ? `${scaled.protein} g protein`
                  : `${scaled.kcal} kcal · ${scaled.protein} g P · ${scaled.carbs} g C · ${scaled.fat} g F`
                : '—'}
          </p>
          <button
            type="button"
            data-testid="product-log"
            disabled={!scaled || logging}
            onClick={() => onLog(amount)}
            className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {logging ? 'Logging…' : scaled && !proteinOnly ? `Log ${scaled.kcal} kcal` : 'Log it'}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-neutral-700">{PACKAGED_PRODUCT_COPY.incomplete}</p>
          <button
            type="button"
            data-testid="product-complete-numbers"
            onClick={onCompleteNumbers}
            className="min-h-11 w-full rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            Add the numbers from the pack
          </button>
        </div>
      )}
      {error && (
        <p data-testid="product-log-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {product.source === 'OFF' && (
        <p className="text-xs text-neutral-500">
          <a
            data-testid="product-off-attribution"
            href={
              product.barcode
                ? `${PACKAGED_PRODUCT_COPY.attributionUrl}/product/${product.barcode}`
                : PACKAGED_PRODUCT_COPY.attributionUrl
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center hover:underline"
          >
            {PACKAGED_PRODUCT_COPY.attribution} · ODbL
          </a>
        </p>
      )}
    </div>
  );
}
