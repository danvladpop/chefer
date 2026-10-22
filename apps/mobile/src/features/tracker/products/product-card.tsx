import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Chip, DONE_FIELD_PROPS, Input, SegmentedControl, Text } from '@chefer/ui-mobile';
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
import { RecipeImage } from '../../recipes/recipe-image';

// A packaged product, ready to log (ADR 0002): allergen warnings first (they
// never block — the user may be logging it for someone else), the honest
// allergen line, an amount in grams or servings with a live preview computed
// by the same `scaleProduct` the server logs with, and the Open Food Facts
// attribution the ODbL asks for.

const GRAM_CHIPS = [30, 50, 100, 150, 200];
const SERVING_CHIPS = [0.5, 1, 1.5, 2];

type Unit = ProductAmount['unit'];

export interface ProductCardProps {
  product: PackagedProductView;
  warnings: ProductAllergenWarning[];
  /** Served from Chefer's copy because Open Food Facts was unreachable. */
  stale?: boolean;
  proteinOnly: boolean;
  logging: boolean;
  error: string | null;
  onLog: (amount: ProductAmount) => void;
  /** No calories yet: complete the numbers from the pack (saved as the user's own product). */
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
  const [unit, setUnit] = useState<Unit>(hasServing ? 'serving' : 'g');
  const [amountText, setAmountText] = useState(hasServing ? '1' : '100');

  const amountValue = parseAmount(amountText);
  const amount: ProductAmount =
    unit === 'g' ? { unit, grams: amountValue } : { unit, servings: amountValue };
  const grams = amountValue > 0 ? productAmountGrams(amount, product.servingSizeG) : null;
  const maxGrams = productMaxGrams(product.per100g);
  const tooMuch = grams !== null && grams > maxGrams;
  const scaled = grams !== null && !tooMuch ? scaleProduct(product.per100g, grams) : null;
  const complete = product.per100g.kcal !== null;
  const name = productDisplayName(product);

  const switchUnit = (next: Unit) => {
    setUnit(next);
    setAmountText(next === 'g' ? String(product.servingSizeG ?? 100) : '1');
  };

  return (
    <View testID="product-card" className="gap-3 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-center gap-3">
        <RecipeImage imageUrl={product.imageUrl} className="h-12 w-12 rounded-lg" />
        <View className="min-w-0 flex-1">
          <Text testID="product-name" numberOfLines={2} className="text-sm font-semibold text-gray-900">
            {name}
          </Text>
          <Text className="text-xs text-gray-500">
            {product.isOwn
              ? product.source === 'LABEL'
                ? 'Your product · from a label photo'
                : 'Your product'
              : complete
                ? `${formatNumber(product.per100g.kcal ?? 0)} kcal / 100 g`
                : 'No calories yet'}
          </Text>
        </View>
      </View>

      {warnings.length > 0 && (
        <View
          testID="product-allergen-warnings"
          accessibilityRole="alert"
          className="gap-1 rounded-lg bg-amber-50 p-3"
        >
          {warnings.map((w) => (
            <View key={`${w.kind}:${w.allergenId}`} className="flex-row items-start gap-2">
              <Ionicons name="warning-outline" size={16} color="#92400e" />
              <Text className="min-w-0 flex-1 text-sm font-medium text-amber-900">
                {productAllergenWarningText(w)}
              </Text>
            </View>
          ))}
        </View>
      )}
      <Text testID="product-allergen-line" className="text-xs text-gray-600">
        {productAllergenLine(product.allergens)}
      </Text>
      {stale && <Text className="text-xs text-amber-700">{PACKAGED_PRODUCT_COPY.stale}</Text>}

      {complete ? (
        <>
          {hasServing && (
            <SegmentedControl
              size="sm"
              options={[
                {
                  value: 'serving',
                  label: `Servings (${formatNumber(product.servingSizeG ?? 0, { maximumFractionDigits: 1 })} g)`,
                  testID: 'product-unit-serving',
                },
                { value: 'g', label: 'Grams', testID: 'product-unit-g' },
              ]}
              value={unit}
              onChange={switchUnit}
              accessibilityLabel="Amount unit"
            />
          )}
          <View className="flex-row flex-wrap gap-1.5">
            {(unit === 'g' ? GRAM_CHIPS : SERVING_CHIPS).map((value) => (
              <Chip
                key={value}
                testID={`product-amount-${value}`}
                label={unit === 'g' ? `${value} g` : `${formatNumber(value, { maximumFractionDigits: 1 })}`}
                selected={amountValue === value}
                onPress={() => setAmountText(String(value))}
              />
            ))}
          </View>
          <View className="flex-row items-center gap-2">
            <Input
              testID="product-amount-input"
              accessibilityLabel={unit === 'g' ? 'Grams eaten' : 'Servings eaten'}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              className="min-w-0 flex-1"
              {...DONE_FIELD_PROPS}
            />
            <Text className="text-sm text-muted-foreground">{unit === 'g' ? 'g' : 'servings'}</Text>
          </View>
          <Text
            testID="product-live-nutrition"
            accessibilityLiveRegion="polite"
            className="text-xs text-gray-600"
          >
            {tooMuch
              ? `One entry holds up to ${formatNumber(maxGrams)} g.`
              : scaled
                ? proteinOnly
                  ? `${scaled.protein} g protein`
                  : `${scaled.kcal} kcal · ${scaled.protein} g P · ${scaled.carbs} g C · ${scaled.fat} g F`
                : '—'}
          </Text>
          <Button
            testID="product-log"
            loading={logging}
            disabled={!scaled}
            onPress={() => onLog(amount)}
          >
            {scaled && !proteinOnly ? `Log ${scaled.kcal} kcal` : 'Log it'}
          </Button>
        </>
      ) : (
        <View className="gap-2">
          <Text className="text-sm text-gray-700">{PACKAGED_PRODUCT_COPY.incomplete}</Text>
          <Button testID="product-complete-numbers" variant="outline" onPress={onCompleteNumbers}>
            Add the numbers from the pack
          </Button>
        </View>
      )}
      {error && (
        <Text testID="product-log-error" accessibilityLiveRegion="polite" className="text-sm text-red-600">
          {error}
        </Text>
      )}

      {product.source === 'OFF' && (
        <Pressable
          testID="product-off-attribution"
          accessibilityRole="link"
          accessibilityLabel={`${PACKAGED_PRODUCT_COPY.attribution}, ${PACKAGED_PRODUCT_COPY.attributionLicence}`}
          onPress={() =>
            void Linking.openURL(
              product.barcode
                ? `${PACKAGED_PRODUCT_COPY.attributionUrl}/product/${product.barcode}`
                : PACKAGED_PRODUCT_COPY.attributionUrl,
            )
          }
          className="min-h-11 justify-center"
        >
          <Text className="text-xs text-gray-500">
            {PACKAGED_PRODUCT_COPY.attribution} ·{' '}
            <Text className="text-xs text-gray-500 underline">ODbL</Text>
          </Text>
        </Pressable>
      )}
    </View>
  );
}
