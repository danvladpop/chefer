'use client';

import { useRef, useState } from 'react';
import { useAiConsent } from '@/features/ai-consent/AiConsentProvider';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { useEntitlement } from '@/hooks/useEntitlement';
import { capture } from '@/lib/analytics';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Barcode, Camera, Loader2, Upload } from 'lucide-react';
import {
  barcodeSchema,
  PACKAGED_PRODUCT_COPY,
  type BarcodeLookupResult,
  type NutritionLabelDraft,
  type PackagedProductDraft,
  type PackagedProductView,
  type ProductAllergenWarning,
  type ProductAmount,
} from '@chefer/types';
import {
  blankProductDraft,
  cleanBarcodeInput,
  draftFromProduct,
  userFacingErrorMessage,
} from '@chefer/utils';
import { productPhotoFromFile } from './product-photo';
import { ProductCard } from './ProductCard';
import { ProductForm } from './ProductForm';

// Web counterpart of mobile's products/product-flow.tsx (ADR 0005): a barcode
// photo (upload or the phone camera via `capture`) or the typed number →
// products.lookupBarcode → a product card → tracker.logProduct. Not found:
// photograph the label (premium, AI consent) or enter it yourself (free).

type Via = 'photo' | 'typed';

type Step =
  | { step: 'start' }
  | {
      step: 'product';
      product: PackagedProductView;
      warnings: ProductAllergenWarning[];
      stale: boolean;
    }
  | { step: 'not_found'; barcode: string | null; unreadable: boolean }
  | {
      step: 'form';
      initial: NutritionLabelDraft['draft'];
      scan?: Pick<NutritionLabelDraft, 'notes' | 'confidence'>;
      source: 'LABEL' | 'USER';
    };

export interface ProductFlowProps {
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  replacesSlot?: { mealType: string; slotIndex: number } | undefined;
  proteinOnly: boolean;
  initial?: { product: PackagedProductView; warnings: ProductAllergenWarning[] } | undefined;
  onLogged: (data: RouterOutputs['tracker']['logProduct'], name: string) => void;
}

const outlineButton =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-[#944a00] hover:bg-neutral-50 disabled:opacity-50';

export function ProductFlow({
  date,
  mealType,
  replacesSlot,
  proteinOnly,
  initial,
  onLogged,
}: ProductFlowProps) {
  const utils = trpc.useUtils();
  const requestAiConsent = useAiConsent();
  const { enabled: canScanLabel } = useEntitlement('mealScansPerDay');
  const [state, setState] = useState<Step>(() =>
    initial ? { step: 'product', ...initial, stale: false } : { step: 'start' },
  );
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'photo' | 'typed' | 'label' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const labelBarcode = useRef<string | null>(null);

  const photoLookup = trpc.products.lookupBarcodePhoto.useMutation({ meta: { silent: true } });
  const scanLabel = trpc.products.scanLabel.useMutation({ meta: { silent: true } });
  const create = trpc.products.create.useMutation({ meta: { silent: true } });
  const logProduct = trpc.tracker.logProduct.useMutation({ meta: { silent: true } });

  const show = (result: BarcodeLookupResult, via: Via) => {
    if (result.status === 'found') {
      capture('barcode_found', {
        source: result.origin,
        allergenWarning: result.warnings.length > 0,
      });
      setState({
        step: 'product',
        product: result.product,
        warnings: result.warnings,
        stale: result.stale,
      });
      return;
    }
    capture('barcode_not_found', { via: result.status === 'unreadable' ? 'unreadable' : via });
    setState({
      step: 'not_found',
      barcode: result.status === 'not_found' ? result.barcode : null,
      unreadable: result.status === 'unreadable',
    });
  };

  const lookupTyped = async () => {
    const parsed = barcodeSchema.safeParse(typed);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? PACKAGED_PRODUCT_COPY.unreadable);
      return;
    }
    setError(null);
    setBusy('typed');
    capture('barcode_scan', { via: 'typed' });
    try {
      show(await utils.products.lookupBarcode.fetch({ barcode: parsed.data }), 'typed');
    } catch (err) {
      setError(userFacingErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const lookupPhoto = async (file: File | undefined) => {
    if (barcodeInputRef.current) barcodeInputRef.current.value = '';
    if (!file) return;
    setError(null);
    setBusy('photo');
    capture('barcode_scan', { via: 'photo' });
    try {
      show(await photoLookup.mutateAsync(await productPhotoFromFile(file)), 'photo');
    } catch (err) {
      setError(userFacingErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  // AI data consent (R-10): asked after the label photo is picked (the file
  // picker needs the original tap) and before anything is sent — the same
  // order as the meal scan.
  const onLabelChosen = (file: File | undefined) => {
    if (labelInputRef.current) labelInputRef.current.value = '';
    if (!file) return;
    requestAiConsent('meal-scan', () => {
      void (async () => {
        setError(null);
        setBusy('label');
        try {
          const photo = await productPhotoFromFile(file);
          const result = await scanLabel.mutateAsync({ ...photo, barcode: labelBarcode.current });
          setState({
            step: 'form',
            initial: result.draft,
            scan: { notes: result.notes, confidence: result.confidence },
            source: 'LABEL',
          });
        } catch (err) {
          setError(userFacingErrorMessage(err));
        } finally {
          setBusy(null);
        }
      })();
    });
  };

  const save = (draft: PackagedProductDraft, edited: boolean, source: 'LABEL' | 'USER') => {
    setError(null);
    create.mutate(
      { ...draft, source },
      {
        onSuccess: (result) => {
          if (source === 'LABEL') capture('label_scan_saved', { edited });
          capture('packaged_product_created', { source: source === 'LABEL' ? 'label' : 'manual' });
          setState({
            step: 'product',
            product: result.product,
            warnings: result.warnings,
            stale: false,
          });
        },
        onError: (err) => setError(userFacingErrorMessage(err)),
      },
    );
  };

  const log = (
    product: PackagedProductView,
    warnings: ProductAllergenWarning[],
    amount: ProductAmount,
  ) => {
    setError(null);
    logProduct.mutate(
      {
        date,
        productId: product.id,
        amount,
        mealType,
        ...(replacesSlot && { replacesSlot }),
        rebalanceMode: 'preview',
      },
      {
        onSuccess: (data) => {
          capture('packaged_product_logged', {
            unit: amount.unit,
            allergenWarning: warnings.length > 0,
          });
          onLogged(data, product.name);
        },
        onError: (err) => setError(userFacingErrorMessage(err)),
      },
    );
  };

  const errorLine = error && (
    <p data-testid="product-flow-error" role="alert" className="text-sm text-red-600">
      {error}
    </p>
  );

  if (state.step === 'product') {
    return (
      <div className="space-y-3">
        <ProductCard
          product={state.product}
          warnings={state.warnings}
          stale={state.stale}
          proteinOnly={proteinOnly}
          logging={logProduct.isPending}
          error={error}
          onLog={(amount) => log(state.product, state.warnings, amount)}
          onCompleteNumbers={() =>
            setState({ step: 'form', initial: draftFromProduct(state.product), source: 'USER' })
          }
        />
        <button
          type="button"
          data-testid="product-scan-another"
          onClick={() => setState({ step: 'start' })}
          className="flex min-h-11 items-center gap-1 text-sm font-semibold text-[#944a00] hover:underline"
        >
          <Barcode className="h-4 w-4" aria-hidden />
          Scan another barcode
        </button>
      </div>
    );
  }

  if (state.step === 'form') {
    return (
      <ProductForm
        initial={state.initial}
        scan={state.scan}
        saving={create.isPending}
        error={error}
        onSave={(draft, edited) => save(draft, edited, state.source)}
        onCancel={() => setState({ step: 'start' })}
      />
    );
  }

  if (state.step === 'not_found') {
    return (
      <div data-testid="product-not-found" className="space-y-3">
        <div className="space-y-1 rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-sm font-semibold text-neutral-900">
            {state.unreadable
              ? PACKAGED_PRODUCT_COPY.unreadable
              : PACKAGED_PRODUCT_COPY.notFoundTitle}
          </p>
          {!state.unreadable && (
            <p className="text-xs text-neutral-600">{PACKAGED_PRODUCT_COPY.notFoundBody}</p>
          )}
        </div>
        {state.unreadable ? (
          <button
            type="button"
            data-testid="product-scan-another"
            onClick={() => setState({ step: 'start' })}
            className="min-h-11 text-sm font-semibold text-[#944a00] hover:underline"
          >
            Try again
          </button>
        ) : (
          <>
            {canScanLabel ? (
              <>
                <input
                  ref={labelInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  aria-label={PACKAGED_PRODUCT_COPY.photographLabel}
                  data-testid="product-label-file"
                  onChange={(e) => onLabelChosen(e.target.files?.[0])}
                />
                <button
                  type="button"
                  data-testid="product-photograph-label"
                  disabled={busy === 'label'}
                  onClick={() => {
                    labelBarcode.current = state.barcode;
                    labelInputRef.current?.click();
                  }}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
                >
                  {busy === 'label' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Camera className="h-4 w-4" aria-hidden />
                  )}
                  {PACKAGED_PRODUCT_COPY.photographLabel}
                </button>
              </>
            ) : (
              <div className="space-y-1 rounded-xl bg-neutral-50 p-3">
                <p className="text-sm text-neutral-700">
                  {PACKAGED_PRODUCT_COPY.photographLabel} is part of Premium.
                </p>
                <UpgradeButton source="snap-scan" className="w-full px-4 py-2.5 text-sm" />
              </div>
            )}
            <button
              type="button"
              data-testid="product-enter-manually"
              onClick={() =>
                setState({
                  step: 'form',
                  initial: blankProductDraft(state.barcode),
                  source: 'USER',
                })
              }
              className="min-h-11 w-full rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              {PACKAGED_PRODUCT_COPY.enterProduct}
            </button>
          </>
        )}
        {errorLine}
      </div>
    );
  }

  return (
    <div data-testid="product-start" className="space-y-3">
      <p className="text-sm text-neutral-500">{PACKAGED_PRODUCT_COPY.scanBarcodeHint}</p>
      <input
        ref={barcodeInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Photo of the barcode"
        data-testid="product-barcode-file"
        onChange={(e) => void lookupPhoto(e.target.files?.[0])}
      />
      <button
        type="button"
        data-testid="product-barcode-photo"
        disabled={busy === 'photo'}
        onClick={() => barcodeInputRef.current?.click()}
        className={outlineButton}
      >
        {busy === 'photo' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-4 w-4" aria-hidden />
        )}
        Take or upload a photo
      </button>
      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          void lookupTyped();
        }}
      >
        <label htmlFor="product-barcode-input" className="text-xs font-medium text-neutral-600">
          {PACKAGED_PRODUCT_COPY.typeBarcode}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="product-barcode-input"
            type="text"
            inputMode="numeric"
            data-testid="product-barcode-input"
            value={typed}
            onChange={(e) => {
              setTyped(cleanBarcodeInput(e.target.value));
              setError(null);
            }}
            placeholder="e.g. 5000159484695"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'product-flow-error' : undefined}
            className="min-h-11 w-full min-w-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
          />
          <button
            type="submit"
            data-testid="product-barcode-find"
            disabled={typed.length < 8 || busy === 'typed'}
            className="min-h-11 shrink-0 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {PACKAGED_PRODUCT_COPY.findProduct}
          </button>
        </div>
      </form>
      {error && (
        <p
          id="product-flow-error"
          data-testid="product-flow-error"
          role="alert"
          className="text-sm text-red-600"
        >
          {error}
        </p>
      )}
      <p className="text-xs text-neutral-500">{PACKAGED_PRODUCT_COPY.attribution} (ODbL)</p>
    </div>
  );
}
