import { useState } from 'react';
import { Keyboard, Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { Button, DONE_FIELD_PROPS, Input, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  blankProductDraft,
  cleanBarcodeInput,
  draftFromProduct,
  userFacingErrorMessage,
} from '@chefer/utils';
import { useEntitlement } from '../../../hooks/use-entitlement';
import { track } from '../../../lib/analytics';
import { trpc, type RouterOutputs } from '../../../lib/trpc';
import { useAiConsent } from '../../ai-consent/ai-consent-provider';
import { openPremium } from '../../premium/open-premium';
import { pickProductPhoto } from './pick-product-photo';
import { ProductCard } from './product-card';
import { ProductForm } from './product-form';

// The Log sheet's packaged-food path (ADR 0005). Barcode photo or typed
// number → products.lookupBarcode → a product card → tracker.logProduct.
// Not found: photograph the label (premium, Snap-to-Log quota, AI consent) or
// enter it yourself (free). Both save the user's own product, which then
// shows up in their search and Recents.

type Found = Extract<BarcodeLookupResult, { status: 'found' }>;
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
  /** Opened from a search row: start on that product's card. */
  initial?: { product: PackagedProductView; warnings: ProductAllergenWarning[] } | undefined;
  onLogged: (data: RouterOutputs['tracker']['logProduct'], name: string) => void;
}

export function ProductFlow({
  date,
  mealType,
  replacesSlot,
  proteinOnly,
  initial,
  onLogged,
}: ProductFlowProps) {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const requestAiConsent = useAiConsent();
  const { enabled: canScanLabel } = useEntitlement('mealScansPerDay');
  const [state, setState] = useState<Step>(() =>
    initial ? { step: 'product', ...initial, stale: false } : { step: 'start' },
  );
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'photo' | 'typed' | 'label' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);

  const photoLookup = trpc.products.lookupBarcodePhoto.useMutation({ meta: { silent: true } });
  const scanLabel = trpc.products.scanLabel.useMutation({ meta: { silent: true } });
  const create = trpc.products.create.useMutation({ meta: { silent: true } });
  const logProduct = trpc.tracker.logProduct.useMutation({ meta: { silent: true } });

  const pick = (result: Found) => ({
    product: result.product,
    warnings: result.warnings,
    stale: result.stale,
  });

  const show = (result: BarcodeLookupResult, via: Via) => {
    if (result.status === 'found') {
      track('barcode_found', {
        source: result.origin,
        allergenWarning: result.warnings.length > 0,
      });
      setState({ step: 'product', ...pick(result) });
      return;
    }
    track('barcode_not_found', { via: result.status === 'unreadable' ? 'unreadable' : via });
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
    Keyboard.dismiss();
    setError(null);
    setBusy('typed');
    track('barcode_scan', { via: 'typed' });
    try {
      show(await utils.products.lookupBarcode.fetch({ barcode: parsed.data }), 'typed');
    } catch (err) {
      setError(userFacingErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const lookupPhoto = async (source: 'camera' | 'library') => {
    setError(null);
    setCameraDenied(false);
    const photo = await pickProductPhoto(source).catch((err: unknown) => {
      setError(userFacingErrorMessage(err));
      return null;
    });
    if (photo === 'denied') {
      setCameraDenied(true);
      return;
    }
    if (!photo) return;
    setBusy('photo');
    track('barcode_scan', { via: 'photo' });
    try {
      show(await photoLookup.mutateAsync(photo), 'photo');
    } catch (err) {
      setError(userFacingErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const photographLabel = (barcode: string | null) => {
    if (!canScanLabel) {
      openPremium('snap-scan');
      return;
    }
    // The label photo goes to the AI provider: consent first (R-10), same
    // sheet and wording as a meal scan.
    requestAiConsent('meal-scan', () => {
      void (async () => {
        setError(null);
        const photo = await pickProductPhoto('camera').catch((err: unknown) => {
          setError(userFacingErrorMessage(err));
          return null;
        });
        if (photo === 'denied') {
          setCameraDenied(true);
          return;
        }
        if (!photo) return;
        setBusy('label');
        try {
          const result = await scanLabel.mutateAsync({ ...photo, barcode });
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
          if (source === 'LABEL') track('label_scan_saved', { edited });
          track('packaged_product_created', { source: source === 'LABEL' ? 'label' : 'manual' });
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
          track('packaged_product_logged', {
            unit: amount.unit,
            allergenWarning: warnings.length > 0,
          });
          onLogged(data, product.name);
        },
        onError: (err) => setError(userFacingErrorMessage(err)),
      },
    );
  };

  if (state.step === 'product') {
    return (
      <View className="gap-3">
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
        <ScanAnother onPress={() => setState({ step: 'start' })} />
      </View>
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

  const cameraNotice = cameraDenied && (
    <View className="gap-2 rounded-lg bg-muted p-3">
      <Text variant="muted" className="text-xs">
        Chefer needs camera access to photograph a barcode. You can turn it on in Settings, or pick
        a photo instead.
      </Text>
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={() => void Linking.openSettings()}>
          Open Settings
        </Button>
        <Button variant="outline" className="flex-1" onPress={() => void lookupPhoto('library')}>
          Choose a photo
        </Button>
      </View>
    </View>
  );

  if (state.step === 'not_found') {
    return (
      <View testID="product-not-found" className="gap-3">
        <View className="gap-1 rounded-xl border border-border bg-card p-3">
          <Text className="text-sm font-semibold text-label">
            {state.unreadable
              ? PACKAGED_PRODUCT_COPY.unreadable
              : PACKAGED_PRODUCT_COPY.notFoundTitle}
          </Text>
          {!state.unreadable && (
            <Text className="text-xs text-label-secondary">
              {PACKAGED_PRODUCT_COPY.notFoundBody}
            </Text>
          )}
        </View>
        {state.unreadable ? (
          <ScanAnother label="Try again" onPress={() => setState({ step: 'start' })} />
        ) : (
          <>
            <Button
              testID="product-photograph-label"
              loading={busy === 'label'}
              onPress={() => photographLabel(state.barcode)}
            >
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="camera-outline" size={16} color={colors.onBrand} />
                <Text className="text-sm font-medium text-primary-foreground">
                  {PACKAGED_PRODUCT_COPY.photographLabel}
                  {canScanLabel ? '' : ' · Premium'}
                </Text>
              </View>
            </Button>
            <Button
              testID="product-enter-manually"
              variant="outline"
              onPress={() =>
                setState({
                  step: 'form',
                  initial: blankProductDraft(state.barcode),
                  source: 'USER',
                })
              }
            >
              {PACKAGED_PRODUCT_COPY.enterProduct}
            </Button>
          </>
        )}
        {cameraNotice}
        {error && (
          <Text testID="product-flow-error" className="text-sm text-danger">
            {error}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View testID="product-start" className="gap-3">
      <Text variant="muted" className="text-sm">
        {PACKAGED_PRODUCT_COPY.scanBarcodeHint}
      </Text>
      <View className="flex-row gap-2">
        <Button
          testID="product-barcode-camera"
          variant="outline"
          className="flex-1"
          loading={busy === 'photo'}
          onPress={() => void lookupPhoto('camera')}
        >
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="barcode-outline" size={16} color={colors.brand} />
            <Text className="text-sm font-medium text-primary">Camera</Text>
          </View>
        </Button>
        <Button
          testID="product-barcode-library"
          variant="outline"
          className="flex-1"
          loading={busy === 'photo'}
          onPress={() => void lookupPhoto('library')}
        >
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="images-outline" size={16} color={colors.brand} />
            <Text className="text-sm font-medium text-primary">Photos</Text>
          </View>
        </Button>
      </View>
      {cameraNotice}
      <View className="gap-1">
        <Text className="text-xs font-medium text-label-secondary">
          {PACKAGED_PRODUCT_COPY.typeBarcode}
        </Text>
        <View className="flex-row items-center gap-2">
          <Input
            testID="product-barcode-input"
            accessibilityLabel={PACKAGED_PRODUCT_COPY.typeBarcode}
            value={typed}
            onChangeText={(text) => {
              setTyped(cleanBarcodeInput(text));
              setError(null);
            }}
            placeholder="e.g. 5000159484695"
            keyboardType="number-pad"
            className="min-w-0 flex-1"
            {...DONE_FIELD_PROPS}
            onSubmitEditing={() => void lookupTyped()}
          />
          <Button
            testID="product-barcode-find"
            size="sm"
            loading={busy === 'typed'}
            disabled={typed.length < 8}
            onPress={() => void lookupTyped()}
          >
            {PACKAGED_PRODUCT_COPY.findProduct}
          </Button>
        </View>
      </View>
      {error && (
        <Text
          testID="product-flow-error"
          accessibilityLiveRegion="polite"
          className="text-sm text-danger"
        >
          {error}
        </Text>
      )}
      <Text className="text-xs text-label-secondary">
        {PACKAGED_PRODUCT_COPY.attribution} (ODbL)
      </Text>
    </View>
  );
}

function ScanAnother({
  label = 'Scan another barcode',
  onPress,
}: {
  label?: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID="product-scan-another"
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-1 self-start"
    >
      <Ionicons name="barcode-outline" size={16} color={colors.brand} />
      <Text className="text-sm font-medium text-primary">{label}</Text>
    </Pressable>
  );
}
