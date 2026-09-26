import { useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HOUSEHOLD_PORTION_OPTIONS } from '@chefer/types';
import { Button, Card, Input, PressableScale, Text } from '@chefer/ui-mobile';
import { cn, householdPortionSum, type HouseholdGhostKind } from '@chefer/utils';
import { useEntitlement } from '../../hooks/use-entitlement';
import { trpc } from '../../lib/trpc';

// Household editor (F2, backlog P2-3) — port of web's household-section.
// Every tier adds members: their allergies and restrictions filter every
// plan and allergen warning (safety is never premium). Premium adds SCALING:
// servings, the shopping list and the week cost follow the whole table.
// Used by the Household screen and the onboarding "Who's at your table?"
// step.

const PORTION_LABELS: Record<number, string> = {
  0.5: '½',
  0.75: '¾',
  1: '1',
  1.25: '1¼',
  1.5: '1½',
};

const PRESETS: Record<HouseholdGhostKind, { portionFactor: number; isKid: boolean }> = {
  partner: { portionFactor: 1, isKid: false },
  kid: { portionFactor: 0.5, isKid: true },
};

const splitList = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function HouseholdEditor({ variant = 'screen' }: { variant?: 'screen' | 'onboarding' }) {
  const { limit, isPremium } = useEntitlement('householdMembers');
  const { data: members = [], isLoading } = trpc.household.list.useQuery();
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [portionFactor, setPortionFactor] = useState<number>(1);
  const [isKid, setIsKid] = useState(false);
  const [allergyText, setAllergyText] = useState('');
  const [restrictionText, setRestrictionText] = useState('');
  const [dislikeText, setDislikeText] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Member changes move plan warnings, list sizes and costs.
  const invalidate = () => {
    void utils.household.list.invalidate();
    void utils.preferences.get.invalidate();
    void utils.mealPlan.invalidate();
    void utils.shoppingList.getForWeek.invalidate();
  };
  const resetForm = () => {
    setName('');
    setAllergyText('');
    setRestrictionText('');
    setDislikeText('');
    setIsKid(false);
    setPortionFactor(1);
  };
  const addMutation = trpc.household.add.useMutation({
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });
  const removeMutation = trpc.household.remove.useMutation({
    onSuccess: () => {
      setConfirmingId(null);
      invalidate();
    },
  });

  const atCap = limit !== null && members.length >= limit;
  const tablePortions = members.length > 0 ? householdPortionSum(members) : null;

  const applyPreset = (kind: HouseholdGhostKind) => {
    setPortionFactor(PRESETS[kind].portionFactor);
    setIsKid(PRESETS[kind].isKid);
  };

  const handleAdd = () => {
    if (!name.trim() || addMutation.isPending || atCap) {
      return;
    }
    addMutation.mutate({
      name: name.trim(),
      portionFactor,
      isKid,
      allergies: splitList(allergyText),
      dietaryRestrictions: splitList(restrictionText),
      dislikedIngredients: splitList(dislikeText),
    });
  };

  return (
    <View className="gap-4">
      {/* Members */}
      {isLoading ? (
        <ActivityIndicator color="#944a00" />
      ) : members.length === 0 ? (
        variant === 'screen' && (
          <Card testID="household-empty" className="items-center border-dashed py-8">
            <Ionicons name="people-outline" size={36} color="#d1d5db" />
            <Text variant="muted" className="mt-2 text-sm">
              Just you at the table for now.
            </Text>
          </Card>
        )
      ) : (
        <View className="gap-2">
          {members.map((m) =>
            confirmingId === m.id ? (
              // Removing someone drops their allergies from every plan —
              // confirm first (audit F-ONB-3-2).
              <View
                key={m.id}
                testID={`household-confirm-${m.id}`}
                className="gap-2 rounded-xl border border-red-200 bg-red-50 p-3"
              >
                <Text className="text-sm text-red-800">
                  Remove {m.name}? Their allergies stop applying to your plans.
                </Text>
                <View className="flex-row gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onPress={() => setConfirmingId(null)}
                  >
                    Keep
                  </Button>
                  <Button
                    testID={`household-confirm-remove-${m.id}`}
                    variant="destructive"
                    className="flex-1"
                    loading={removeMutation.isPending}
                    onPress={() => removeMutation.mutate({ id: m.id })}
                  >
                    Remove
                  </Button>
                </View>
              </View>
            ) : (
              <View
                key={m.id}
                className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-medium text-gray-800">{m.name}</Text>
                    {m.isKid && (
                      <View className="rounded-full bg-accent px-2 py-0.5">
                        <Text className="text-xs font-semibold text-primary">Kid</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs text-gray-500">
                    {PORTION_LABELS[m.portionFactor] ?? m.portionFactor} portion
                    {m.allergies.length > 0 && ` · allergic: ${m.allergies.join(', ')}`}
                    {m.dietaryRestrictions.length > 0 && ` · ${m.dietaryRestrictions.join(', ')}`}
                  </Text>
                </View>
                <Pressable
                  testID={`household-remove-${m.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.name}`}
                  onPress={() => setConfirmingId(m.id)}
                  className="h-11 w-11 items-center justify-center"
                >
                  <Ionicons name="trash-outline" size={18} color="#6b7280" />
                </Pressable>
              </View>
            ),
          )}
        </View>
      )}

      {/* Free tables: safety applies, scaling is the premium part (P2-3) */}
      {variant === 'screen' && isPremium === false && (
        <Card testID="household-upsell" className="border-amber-200 bg-amber-50">
          <Text className="text-sm font-semibold text-gray-900">
            Everyone&apos;s allergies apply to every plan — free.
          </Text>
          <Text className="mt-1 text-sm text-gray-700">
            {tablePortions !== null
              ? `Your shopping list and servings are still sized for one portion. Premium scales them for your table (${tablePortions} portions), kids at half portions included.`
              : 'Premium also scales servings, the shopping list and the week cost for your whole table, kids at half portions included.'}
          </Text>
        </Card>
      )}

      {/* Add someone — every tier */}
      <Card className="gap-3">
        <Text variant="heading">Add someone</Text>
        {atCap ? (
          <Text variant="muted" className="text-xs">
            You&apos;ve reached the limit of {limit} household members.
          </Text>
        ) : (
          <>
            {/* Quick presets (the kid starts at ½ portion) */}
            <View className="flex-row gap-2">
              {(['partner', 'kid'] as const).map((kind) => {
                const selected =
                  isKid === PRESETS[kind].isKid && portionFactor === PRESETS[kind].portionFactor;
                return (
                  <PressableScale
                    key={kind}
                    testID={`household-preset-${kind}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => applyPreset(kind)}
                    className={cn(
                      'h-11 flex-1 items-center justify-center rounded-full border-2 border-dashed',
                      selected ? 'border-amber-400 bg-amber-50' : 'border-amber-300',
                    )}
                  >
                    <Text className="text-sm font-medium text-amber-800">
                      {kind === 'kid' ? '+ A kid' : '+ My partner'}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            <Input
              testID="household-name"
              value={name}
              onChangeText={setName}
              placeholder={isKid ? 'Name — e.g. Sam' : 'Name — e.g. Maria'}
              accessibilityLabel="Name"
            />
            <View className="gap-1">
              <Text variant="label">Portion size</Text>
              <View className="flex-row gap-2">
                {HOUSEHOLD_PORTION_OPTIONS.map((p) => (
                  <PressableScale
                    key={p}
                    testID={`household-portion-${p}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${PORTION_LABELS[p] ?? p} portion`}
                    accessibilityState={{ selected: portionFactor === p }}
                    onPress={() => setPortionFactor(p)}
                    className={cn(
                      'h-11 flex-1 items-center justify-center rounded-md border',
                      portionFactor === p ? 'border-primary bg-primary' : 'border-border bg-white',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-semibold',
                        portionFactor === p ? 'text-primary-foreground' : 'text-gray-600',
                      )}
                    >
                      {PORTION_LABELS[p] ?? p}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>
            <View className="min-h-11 flex-row items-center justify-between">
              <Text variant="label">Child (smaller portions)</Text>
              <Switch
                testID="household-kid"
                accessibilityLabel="Child"
                value={isKid}
                onValueChange={(v) => {
                  setIsKid(v);
                  if (v && portionFactor === 1) {
                    setPortionFactor(0.5);
                  }
                }}
              />
            </View>
            <Input
              testID="household-allergies"
              value={allergyText}
              onChangeText={setAllergyText}
              placeholder="Allergies, comma-separated (optional)"
              accessibilityLabel="Allergies"
            />
            <Input
              testID="household-restrictions"
              value={restrictionText}
              onChangeText={setRestrictionText}
              placeholder="Diet, e.g. Vegetarian (optional)"
              accessibilityLabel="Dietary restrictions"
            />
            <Input
              testID="household-dislikes"
              value={dislikeText}
              onChangeText={setDislikeText}
              placeholder="Dislikes, comma-separated (optional)"
              accessibilityLabel="Dislikes"
            />
            <Button
              testID="household-add"
              loading={addMutation.isPending}
              disabled={!name.trim()}
              onPress={handleAdd}
            >
              Add to my table
            </Button>
          </>
        )}
        {addMutation.isError && (
          <Text className="text-xs text-red-600">{addMutation.error.message}</Text>
        )}
      </Card>
    </View>
  );
}
