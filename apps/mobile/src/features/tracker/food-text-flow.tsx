import { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  FOOD_TEXT_COPY,
  FOOD_TEXT_LIMITS,
  foodTextSchema,
  type ParsedFoodItem,
} from '@chefer/types';
import { Button, DONE_FIELD_PROPS, Input, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  foodTextTotal,
  parsedItemAmount,
  parsedItemToLogItem,
  userFacingErrorMessage,
} from '@chefer/utils';
import { track } from '../../lib/analytics';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { useAiConsent } from '../ai-consent/ai-consent-provider';

// Lane A4: "Type what you ate" in the Log sheet. The sentence goes to
// tracker.parseFoodText (AI consent first; free 10 a day, premium unlimited),
// the items come back matched to the user's recents, packaged products, the
// catalogue or — last — an estimate. Nothing is logged until the user has
// checked the amounts and taps Log; then tracker.logItems writes them all.
// Voice is the keyboard's own dictation button (no native module).

export interface FoodTextFlowProps {
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  proteinOnly: boolean;
  onLogged: (data: RouterOutputs['tracker']['logItems'], count: number) => void;
}

export function FoodTextFlow({ date, mealType, proteinOnly, onLogged }: FoodTextFlowProps) {
  const colors = useThemeColors();
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
    Keyboard.dismiss();
    setError(null);
    // The sentence goes to the AI provider: consent first (R-10).
    requestAiConsent('food-text', () => {
      parseMutation.mutate(
        { text: parsed.data },
        {
          onSuccess: (result) => {
            track('food_text_parsed', {
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
          track('food_text_logged', { itemCount: ready.length, edited });
          onLogged(data, ready.length);
        },
        onError: (err) => setError(userFacingErrorMessage(err)),
      },
    );
  };

  if (items && items.length > 0) {
    return (
      <View testID="food-text-review" className="gap-3">
        <Text className="text-xs text-label-secondary">{FOOD_TEXT_COPY.reviewHint}</Text>
        {items.map((item) => {
          const logged = parsedItemToLogItem(item, amountOf(item));
          return (
            <View
              key={item.key}
              testID={`food-text-item-${item.key}`}
              className="gap-2 rounded-xl border border-separator bg-surface p-3"
            >
              <View className="flex-row items-start gap-2">
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={2} className="text-sm font-semibold text-label">
                    {item.name}
                  </Text>
                  <Text className="text-xs text-label-secondary">
                    {`“${item.text}” · ${FOOD_TEXT_COPY.sourceLabel[item.source]}`}
                  </Text>
                </View>
                <Pressable
                  testID={`food-text-remove-${item.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                  onPress={() => {
                    setItems((prev) => (prev ?? []).filter((i) => i.key !== item.key));
                    setEdited(true);
                  }}
                  className="h-11 w-11 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color={colors.labelTertiary} />
                </Pressable>
              </View>
              <View className="flex-row items-center gap-2">
                <Input
                  testID={`food-text-amount-${item.key}`}
                  accessibilityLabel={`Amount of ${item.name}, in ${item.unit === 'g' ? 'grams' : 'servings'}`}
                  value={amounts[item.key] ?? ''}
                  keyboardType="decimal-pad"
                  onChangeText={(value) => {
                    setAmounts((prev) => ({ ...prev, [item.key]: value }));
                    setEdited(true);
                  }}
                  className="min-w-0 flex-1"
                  {...DONE_FIELD_PROPS}
                />
                <Text className="text-sm text-label-secondary">
                  {item.unit === 'g' ? 'g' : 'servings'}
                </Text>
              </View>
              <Text className="text-xs text-label-secondary">
                {logged
                  ? proteinOnly
                    ? `${logged.protein} g protein`
                    : `${logged.kcal} kcal · ${logged.protein} g P`
                  : '—'}
              </Text>
            </View>
          );
        })}
        {error && (
          <Text testID="food-text-error" className="text-sm text-danger">
            {error}
          </Text>
        )}
        <Button
          testID="food-text-log"
          loading={logMutation.isPending}
          disabled={ready.length === 0}
          onPress={log}
        >
          {proteinOnly
            ? `Log ${ready.length} ${ready.length === 1 ? 'item' : 'items'}`
            : `Log ${ready.length} ${ready.length === 1 ? 'item' : 'items'} · ${total} kcal`}
        </Button>
        <Pressable
          testID="food-text-again"
          accessibilityRole="button"
          onPress={() => setItems(null)}
          className="min-h-11 justify-center self-start"
        >
          <Text className="text-sm font-medium text-brand">Change what I typed</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View testID="food-text-start" className="gap-2">
      <Input
        testID="food-text-input"
        accessibilityLabel={FOOD_TEXT_COPY.entry}
        value={text}
        maxLength={FOOD_TEXT_LIMITS.maxChars}
        placeholder={FOOD_TEXT_COPY.placeholder}
        onChangeText={(value) => {
          setText(value);
          setError(null);
        }}
        returnKeyType="go"
        onSubmitEditing={read}
      />
      <Text className="text-xs text-label-secondary">{FOOD_TEXT_COPY.hint}</Text>
      {error && (
        <Text
          testID="food-text-error"
          accessibilityLiveRegion="polite"
          className="text-sm text-danger"
        >
          {error}
        </Text>
      )}
      <Button
        testID="food-text-read"
        loading={parseMutation.isPending}
        disabled={text.trim().length < 2}
        onPress={read}
      >
        {FOOD_TEXT_COPY.read}
      </Button>
    </View>
  );
}
