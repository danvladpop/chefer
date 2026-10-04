import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  View,
  type TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DisplayCurrency } from '@chefer/types';
import {
  Button,
  Card,
  ErrorState,
  Input,
  Sheet,
  Text,
  useQueryState,
  useScrollFieldIntoView,
  useSnackbar,
} from '@chefer/ui-mobile';
import {
  cn,
  parsePantryQuantity,
  userFacingErrorMessage,
  type PantryQuantityResult,
} from '@chefer/utils';
import { useEntitlement } from '../../hooks/use-entitlement';
import { useUnits } from '../../hooks/use-units';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { openPremium } from '../premium/open-premium';
import { PantryCheckBanner } from './pantry-check-banner';
import { PantryGhostBanner } from './pantry-ghost-banner';

// Shop → "In my kitchen" (M2-6, P2-8) — port of apps/web
// features/pantry/components/PantryPanel.tsx. Rendered by the Shop tab's
// kitchen segment and by the standalone /pantry screen (kept for deep links).
// Deviation, deliberate: the unit picker is a chip row instead of a <select>.
// WP-11 (UX-SHOP-05/07): removing, editing and Undo are open to every tier (the
// free list used to only grow), the amount is validated instead of silently
// becoming "some left", quantities and unit chips follow the user's units, and
// the chips are 44 pt with a check mark (not colour alone).
// Free tier: once check-offs have seeded the kitchen, the upsell becomes the
// ghost banner with the real count and this week's real savings (F3 §6.4).

type PantryRow = RouterOutputs['pantry']['list']['items'][number];

/** One unit chip: 44 pt, selected = filled + check mark + `selected` state (UX-SHOP-07). */
function UnitChip({
  unit,
  selected,
  onPress,
  disabled,
}: {
  unit: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={`pantry-unit-${unit}`}
      accessibilityRole="button"
      accessibilityLabel={`Unit ${unit}`}
      accessibilityState={{ selected, disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-11 min-w-11 flex-row items-center justify-center gap-1 rounded-full border px-3',
        selected ? 'border-primary bg-primary' : 'border-border bg-white',
      )}
    >
      {selected && <Ionicons name="checkmark" size={14} color="white" />}
      <Text
        className={cn(
          'text-xs font-medium',
          selected ? 'text-primary-foreground' : 'text-gray-600',
        )}
      >
        {unit}
      </Text>
    </Pressable>
  );
}

/** Edit an existing row's amount and unit (UX-SHOP-05). Free tier included. */
function EditPantrySheet({
  item,
  unitOptions,
  onClose,
}: {
  item: PantryRow | null;
  unitOptions: readonly string[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [problem, setProblem] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  if (item && item.id !== seen) {
    setSeen(item.id);
    setQuantity(item.quantity != null ? String(item.quantity) : '');
    setUnit(item.unit);
    setProblem(null);
  }

  const updateMutation = trpc.pantry.updateItem.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.pantry.list.invalidate();
      void utils.shoppingList.getForWeek.invalidate();
      onClose();
    },
  });

  const save = () => {
    if (!item || updateMutation.isPending) return;
    const parsed: PantryQuantityResult = parsePantryQuantity(quantity);
    if (parsed.kind === 'invalid') {
      setProblem(parsed.message);
      return;
    }
    setProblem(null);
    Keyboard.dismiss();
    updateMutation.mutate({
      id: item.id,
      quantity: parsed.kind === 'amount' ? parsed.value : null,
      unit,
    });
  };

  // The row's own unit first, so a stored "g" stays pickable for an imperial user.
  const chips = item ? [...new Set([item.unit, ...unitOptions])] : [];
  const error =
    problem ?? (updateMutation.isError ? userFacingErrorMessage(updateMutation.error) : null);

  return (
    <Sheet
      visible={item !== null}
      onClose={onClose}
      title={item ? `Edit ${item.ingredientName}` : 'Edit'}
      eyebrow="In my kitchen"
      testID="pantry-edit"
      footer={
        <Button testID="pantry-edit-save" loading={updateMutation.isPending} onPress={save}>
          Save
        </Button>
      }
    >
      <View className="gap-3">
        <View className="gap-1">
          <Text className="text-xs font-medium text-gray-600">Amount (leave empty for “some”)</Text>
          <Input
            testID="pantry-edit-qty"
            value={quantity}
            onChangeText={(text) => {
              setQuantity(text);
              setProblem(null);
            }}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount in your kitchen"
            aria-invalid={error !== null}
            accessibilityHint={error ?? undefined}
            placeholder="some"
            returnKeyType="done"
            onSubmitEditing={save}
          />
        </View>
        <View className="flex-row flex-wrap gap-1.5">
          {chips.map((u) => (
            <UnitChip key={u} unit={u} selected={unit === u} onPress={() => setUnit(u)} />
          ))}
        </View>
        {error && (
          <Text
            testID="pantry-edit-error"
            accessibilityLiveRegion="polite"
            className="text-xs text-red-600"
          >
            {error}
          </Text>
        )}
      </View>
    </Sheet>
  );
}

function ageLabel(updatedAt: Date | string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000)),
  );
  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 14) {
    return `${days} days ago`;
  }
  return `${Math.floor(days / 7)} weeks ago`;
}

export function PantryPanel({
  savedEur = 0,
  currency = 'EUR',
}: {
  /** This week's list savings the pantry would give (shopping list `pantry.savedEur`). */
  savedEur?: number;
  currency?: DisplayCurrency;
} = {}) {
  const { enabled, isPremium } = useEntitlement('pantryPlanning');
  const locked = isPremium === false;
  const pantryQuery = trpc.pantry.list.useQuery(undefined, { staleTime: 30_000 });
  const { data } = pantryQuery;
  const { state: loadState, retry } = useQueryState(pantryQuery);
  const utils = trpc.useUtils();
  const units = useUnits();
  const snackbar = useSnackbar();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quantityProblem, setQuantityProblem] = useState<string | null>(null);
  const [unit, setUnit] = useState('pcs');
  const [checkOpen, setCheckOpen] = useState(false);
  const [editing, setEditing] = useState<PantryRow | null>(null);
  // T-21.5 (CI-14, PAT-11): a no-op unless an ancestor KeyboardAwareScrollView
  // provides it (the Shop tab does; a bare host doesn't need to).
  const nameInputRef = useRef<TextInput>(null);
  const quantityInputRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();

  const invalidate = () => {
    void utils.pantry.list.invalidate();
    void utils.shoppingList.getForWeek.invalidate();
  };
  const addMutation = trpc.pantry.addItem.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setName('');
      setQuantity('');
      invalidate();
    },
  });
  // UX-SHOP-05: "Removed · Undo". Undo goes through `restoreItem`, which every
  // tier may call (a free user can remove, so a free user can take it back).
  const restoreMutation = trpc.pantry.restoreItem.useMutation({
    meta: { silent: true },
    onSuccess: invalidate,
    onError: (err) =>
      snackbar.show({ message: `Couldn't put it back. ${userFacingErrorMessage(err)}` }),
  });
  const removeMutation = trpc.pantry.removeItem.useMutation({
    onSuccess: (result) => {
      invalidate();
      const removed = result.removed;
      if (!removed) return;
      snackbar.show({
        message: `Removed ${removed.ingredientName}`,
        actionLabel: 'Undo',
        onAction: () =>
          restoreMutation.mutate({
            ingredientName: removed.ingredientName,
            ...(removed.quantity != null ? { quantity: removed.quantity } : {}),
            unit: removed.unit,
            source: removed.source === 'MANUAL' ? 'MANUAL' : 'PURCHASE',
          }),
      });
    },
  });

  const handleAdd = () => {
    if (!name.trim() || addMutation.isPending) {
      return;
    }
    // UX-SHOP-05/07: "abc" and "-5" are refused, not saved as "some left".
    const parsed = parsePantryQuantity(quantity);
    if (parsed.kind === 'invalid') {
      setQuantityProblem(parsed.message);
      return;
    }
    setQuantityProblem(null);
    Keyboard.dismiss();
    addMutation.mutate({
      name: name.trim(),
      ...(parsed.kind === 'amount' ? { quantity: parsed.value } : {}),
      unit,
    });
  };

  const items = data?.items ?? [];

  return (
    <View className="gap-4">
      <Text variant="muted" className="text-sm">
        Checked-off shopping list items land here automatically. The longest-sitting items are used
        first in your plans.
      </Text>

      {enabled && items.length > 0 && !checkOpen && (
        <Pressable
          testID="pantry-check-open"
          accessibilityRole="button"
          onPress={() => setCheckOpen(true)}
          className="min-h-11 flex-row items-center gap-1.5 self-start rounded-xl border border-border px-3"
        >
          <Ionicons name="clipboard-outline" size={16} color="#4b5563" />
          <Text className="text-xs font-medium text-gray-600">Still have these?</Text>
        </Pressable>
      )}
      <PantryCheckBanner manualOpen={checkOpen} onManualClose={() => setCheckOpen(false)} />

      {/* Free-tier upsell — page stays visible read-only (§6.4). With items,
          the ghost shows the real count + savings instead. */}
      {locked && items.length > 0 && <PantryGhostBanner savedEur={savedEur} currency={currency} />}
      {locked && items.length === 0 && (
        <Card testID="pantry-upsell" className="border-amber-200 bg-amber-50">
          <Text className="text-sm font-semibold text-gray-900">
            Chefer sees your kitchen — premium cooks from it.
          </Text>
          <Text className="mt-1 text-sm text-gray-700">
            Premium plans use these items up before they go to waste, subtract them from your
            shopping list, and show what you saved each week.
          </Text>
          <Button
            testID="pantry-upsell-upgrade"
            variant="outline"
            size="sm"
            className="mt-3 self-start"
            onPress={() => openPremium('pantry')}
          >
            Plan my week around these
          </Button>
        </Card>
      )}

      {/* Manual add (premium) */}
      {enabled && (
        <View className="gap-2">
          <View className="flex-row gap-2">
            <Input
              ref={nameInputRef}
              testID="pantry-add-name"
              value={name}
              onChangeText={setName}
              onFocus={() => scrollFieldIntoView(nameInputRef.current)}
              onSubmitEditing={handleAdd}
              accessibilityLabel="Ingredient you have"
              placeholder="Add something you have… e.g. rice"
              editable={!addMutation.isPending}
              className="flex-1"
              returnKeyType="done"
            />
            <Input
              ref={quantityInputRef}
              testID="pantry-add-qty"
              value={quantity}
              onChangeText={(text) => {
                setQuantity(text);
                setQuantityProblem(null);
              }}
              onFocus={() => scrollFieldIntoView(quantityInputRef.current)}
              keyboardType="decimal-pad"
              accessibilityLabel="Amount"
              aria-invalid={quantityProblem !== null}
              placeholder="Qty"
              editable={!addMutation.isPending}
              className="w-16 px-2 text-center"
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
          </View>
          <View className="flex-row items-center gap-1.5">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-1.5"
            >
              {units.unitOptions.map((u) => (
                <UnitChip key={u} unit={u} selected={unit === u} onPress={() => setUnit(u)} />
              ))}
            </ScrollView>
            <Pressable
              testID="pantry-add-submit"
              accessibilityRole="button"
              accessibilityLabel="Add to pantry"
              disabled={!name.trim() || addMutation.isPending}
              onPress={handleAdd}
              className={cn(
                'h-11 w-11 items-center justify-center rounded-md bg-primary',
                (!name.trim() || addMutation.isPending) && 'opacity-40',
              )}
            >
              <Ionicons name="add" size={22} color="white" />
            </Pressable>
          </View>
          {(quantityProblem ??
            (addMutation.isError ? userFacingErrorMessage(addMutation.error) : null)) && (
            <Text
              testID="pantry-add-error"
              accessibilityLiveRegion="polite"
              className="text-xs text-red-600"
            >
              {quantityProblem ?? userFacingErrorMessage(addMutation.error)}
            </Text>
          )}
        </View>
      )}

      {/* Item list */}
      {loadState === 'loading' ? (
        <ActivityIndicator color="#944a00" />
      ) : loadState === 'error' ? (
        // UX-X-12: a failed load is not an empty kitchen.
        <ErrorState
          testID="pantry-load-error"
          title="Couldn't load your kitchen"
          onRetry={retry}
          className="py-6"
        />
      ) : items.length === 0 ? (
        <Card testID="pantry-empty" className="items-center border-dashed py-10">
          <Ionicons name="file-tray-stacked-outline" size={36} color="#d1d5db" />
          <Text variant="muted" className="mt-3 px-6 text-center text-sm">
            Check items off your shopping list while you shop — everything you buy lands here.
          </Text>
        </Card>
      ) : (
        <View className="gap-2">
          {items.map((item) => (
            <View
              key={item.id}
              className="flex-row items-center gap-1 rounded-xl border border-border bg-card"
            >
              <Pressable
                testID={`pantry-row-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.ingredientName}`}
                onPress={() => setEditing(item)}
                className="min-h-11 min-w-0 flex-1 p-3"
              >
                <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                  {item.ingredientName}
                </Text>
                <Text className="text-xs text-gray-500">
                  {item.quantity != null ? units.qty(item.quantity, item.unit) : 'some left'} ·{' '}
                  {item.source === 'PURCHASE' ? 'bought' : 'added'} {ageLabel(item.updatedAt)}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.ingredientName} from your kitchen`}
                disabled={removeMutation.isPending}
                onPress={() => removeMutation.mutate({ id: item.id })}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name="trash-outline" size={18} color="#9ca3af" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <EditPantrySheet
        item={editing}
        unitOptions={units.unitOptions}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}
