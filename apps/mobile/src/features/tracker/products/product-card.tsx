import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Translator } from '@chefer/i18n';
import {
  PACKAGED_PRODUCT_COPY,
  type PackagedProductView,
  type ProductAllergenWarning,
  type ProductAmount,
} from '@chefer/types';
import {
  Button,
  Chip,
  DONE_FIELD_PROPS,
  Input,
  SegmentedControl,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  formatNumber,
  HIDE_NUMBERS_COPY,
  productAmountGrams,
  productDisplayName,
  productMaxGrams,
  scaleProduct,
} from '@chefer/utils';
import { useT } from '../../../lib/i18n';
import { rich } from '../../../lib/i18n/rich';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { RecipeImage } from '../../recipes/recipe-image';

// A packaged product, ready to log (ADR 0006): allergen warnings first (they
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

/** "Contains dairy: you and Maria avoid it." in the UI language (allergen names come from the server). */
export function allergenWarningText(t: Translator['t'], warning: ProductAllergenWarning): string {
  const you = t('tracker.productCard.warning.you');
  const who = warning.who.length > 0 ? warning.who.map((w) => (w === 'you' ? you : w)) : [you];
  const last = who.at(-1) ?? you;
  const whoText =
    who.length === 1
      ? last
      : t('tracker.productCard.warning.whoList', { list: who.slice(0, -1).join(', '), last });
  const one = who.length === 1 && warning.who.length === 1 && warning.who[0] !== 'you';
  const params = { allergen: warning.label.toLowerCase(), who: whoText };
  if (warning.kind === 'contains') {
    return one
      ? t('tracker.productCard.warning.containsOne', params)
      : t('tracker.productCard.warning.contains', params);
  }
  return one
    ? t('tracker.productCard.warning.mayContainOne', params)
    : t('tracker.productCard.warning.mayContain', params);
}

/** The allergen line under a product: what it contains, or an honest "unknown". */
export function allergenLine(t: Translator['t'], allergens: PackagedProductView['allergens']) {
  if (allergens.status === 'unknown') return t('tracker.packaged.allergensUnknown');
  if (allergens.status === 'none-listed') return t('tracker.packaged.allergensNoneListed');
  const contains = allergens.contains.map((a) => a.label).join(', ');
  const traces = allergens.mayContain.map((a) => a.label).join(', ');
  return [
    contains && t('tracker.packaged.allergensContains', { list: contains }),
    traces && t('tracker.packaged.allergensMayContain', { list: traces }),
  ]
    .filter(Boolean)
    .join(' ');
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
  const colors = useThemeColors();
  const { t } = useT();
  const { noNumbers } = useNumbersMode();
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
          <Text
            testID="product-name"
            numberOfLines={2}
            className="text-sm font-semibold text-label"
          >
            {name}
          </Text>
          <Text className="text-xs text-label-secondary">
            {product.isOwn
              ? product.source === 'LABEL'
                ? t('tracker.productCard.yourProductFromLabel')
                : t('tracker.productCard.yourProduct')
              : complete
                ? noNumbers
                  ? HIDE_NUMBERS_COPY.recipeNutritionHidden
                  : t('tracker.productCard.kcalPer100g', {
                      value: formatNumber(product.per100g.kcal ?? 0),
                    })
                : t('tracker.productCard.noKcal')}
          </Text>
        </View>
      </View>

      {warnings.length > 0 && (
        <View
          testID="product-allergen-warnings"
          accessibilityRole="alert"
          className="gap-1 rounded-lg bg-attention/10 p-3"
        >
          {warnings.map((w) => (
            <View key={`${w.kind}:${w.allergenId}`} className="flex-row items-start gap-2">
              <Ionicons name="warning-outline" size={16} color={colors.attention} />
              <Text className="min-w-0 flex-1 text-sm font-medium text-attention">
                {allergenWarningText(t, w)}
              </Text>
            </View>
          ))}
        </View>
      )}
      <Text testID="product-allergen-line" className="text-xs text-label-secondary">
        {allergenLine(t, product.allergens)}
      </Text>
      {stale && <Text className="text-xs text-attention">{t('tracker.packaged.stale')}</Text>}

      {complete ? (
        <>
          {hasServing && (
            <SegmentedControl
              size="sm"
              options={[
                {
                  value: 'serving',
                  label: t('tracker.productCard.servingsUnit', {
                    grams: formatNumber(product.servingSizeG ?? 0, { maximumFractionDigits: 1 }),
                  }),
                  testID: 'product-unit-serving',
                },
                { value: 'g', label: t('tracker.productCard.gramsUnit'), testID: 'product-unit-g' },
              ]}
              value={unit}
              onChange={switchUnit}
              accessibilityLabel={t('tracker.productCard.unitLabel')}
            />
          )}
          <View className="flex-row flex-wrap gap-1.5">
            {(unit === 'g' ? GRAM_CHIPS : SERVING_CHIPS).map((value) => (
              <Chip
                key={value}
                testID={`product-amount-${value}`}
                label={
                  unit === 'g'
                    ? t('tracker.productCard.gramsChip', { value: formatNumber(value) })
                    : formatNumber(value, { maximumFractionDigits: 1 })
                }
                selected={amountValue === value}
                onPress={() => setAmountText(String(value))}
              />
            ))}
          </View>
          <View className="flex-row items-center gap-2">
            <Input
              testID="product-amount-input"
              accessibilityLabel={
                unit === 'g'
                  ? t('tracker.productCard.gramsEaten')
                  : t('tracker.productCard.servingsEaten')
              }
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              className="min-w-0 flex-1"
              {...DONE_FIELD_PROPS}
            />
            <Text className="text-sm text-muted-foreground">
              {unit === 'g'
                ? t('tracker.productCard.unitG')
                : t('tracker.productCard.unitServings')}
            </Text>
          </View>
          {noNumbers && !tooMuch ? null : (
            <Text
              testID="product-live-nutrition"
              accessibilityLiveRegion="polite"
              className="text-xs text-label-secondary"
            >
              {tooMuch
                ? t('tracker.productCard.maxGrams', { max: formatNumber(maxGrams) })
                : scaled
                  ? proteinOnly
                    ? t('tracker.productCard.liveProtein', { protein: scaled.protein })
                    : t('tracker.productCard.liveKcalMacros', {
                        kcal: scaled.kcal,
                        protein: scaled.protein,
                        carbs: scaled.carbs,
                        fat: scaled.fat,
                      })
                  : '—'}
            </Text>
          )}
          <Button
            testID="product-log"
            loading={logging}
            disabled={!scaled}
            onPress={() => onLog(amount)}
          >
            {scaled && !proteinOnly && !noNumbers
              ? t('tracker.productCard.logKcal', { kcal: scaled.kcal })
              : t('tracker.productCard.logIt')}
          </Button>
        </>
      ) : (
        <View className="gap-2">
          <Text className="text-sm text-label-secondary">{t('tracker.packaged.incomplete')}</Text>
          <Button testID="product-complete-numbers" variant="outline" onPress={onCompleteNumbers}>
            {t('tracker.productCard.addNumbers')}
          </Button>
        </View>
      )}
      {error && (
        <Text
          testID="product-log-error"
          accessibilityLiveRegion="polite"
          className="text-sm text-danger"
        >
          {error}
        </Text>
      )}

      {product.source === 'OFF' && (
        <Pressable
          testID="product-off-attribution"
          accessibilityRole="link"
          accessibilityLabel={t('tracker.packaged.attributionLabel')}
          onPress={() =>
            void Linking.openURL(
              product.barcode
                ? `${PACKAGED_PRODUCT_COPY.attributionUrl}/product/${product.barcode}`
                : PACKAGED_PRODUCT_COPY.attributionUrl,
            )
          }
          className="min-h-11 justify-center"
        >
          <Text className="text-xs text-label-secondary">
            {rich(t, 'tracker.packaged.attributionLink', {
              licence: (
                <Text className="text-xs text-label-secondary underline">
                  {t('tracker.packaged.licenceShort')}
                </Text>
              ),
            })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
