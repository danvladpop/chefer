import { Fragment, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { HOUSEHOLD_PORTION_OPTIONS } from '@chefer/types';
import { Button, Card, Input, PressableScale, Text } from '@chefer/ui-mobile';
import { cn, householdPortionSum, type HouseholdGhostKind } from '@chefer/utils';
import { useEntitlement } from '../../hooks/use-entitlement';
import { trpc } from '../../lib/trpc';
import { HouseholdGhost } from './household-ghost';

// Household editor (F2, backlog P2-3) — port of web's household-section.
// Every tier adds AND edits members (name, portion, kid, allergies,
// restrictions): they filter every plan and allergen warning (safety is
// never premium). Premium adds SCALING: servings, the shopping list and the
// week cost follow the whole table. Free + empty: the preset chips reveal
// the ghost sample for the chip tapped (F-PM-12). Used by the Household
// screen and the onboarding "Who's at your table?" step.

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

type Member = {
  id: string;
  name: string;
  portionFactor: number;
  isKid: boolean;
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
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
  /** The member being edited in the form; null = the form adds someone. */
  const [editing, setEditing] = useState<Member | null>(null);
  /** The chip the free ghost is showing (F-PM-12). */
  const [ghostKind, setGhostKind] = useState<HouseholdGhostKind | null>(null);

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
    setEditing(null);
  };
  const addMutation = trpc.household.add.useMutation({
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });
  const updateMutation = trpc.household.update.useMutation({
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

  // Editing an existing member never counts against the cap.
  const atCap = editing === null && limit !== null && members.length >= limit;
  const tablePortions = members.length > 0 ? householdPortionSum(members) : null;
  const showGhost = variant === 'screen' && isPremium === false && members.length === 0;
  const isSaving = addMutation.isPending || updateMutation.isPending;
  const saveError = editing ? updateMutation.error : addMutation.error;

  const applyPreset = (kind: HouseholdGhostKind) => {
    setPortionFactor(PRESETS[kind].portionFactor);
    setIsKid(PRESETS[kind].isKid);
    if (showGhost) {
      setGhostKind(kind);
    }
  };

  const startEdit = (m: Member) => {
    setConfirmingId(null);
    setEditing(m);
    setName(m.name);
    setPortionFactor(m.portionFactor);
    setIsKid(m.isKid);
    setAllergyText(m.allergies.join(', '));
    setRestrictionText(m.dietaryRestrictions.join(', '));
    setDislikeText(m.dislikedIngredients.join(', '));
  };

  const handleSave = () => {
    if (!name.trim() || isSaving || atCap) {
      return;
    }
    const payload = {
      name: name.trim(),
      portionFactor,
      isKid,
      allergies: splitList(allergyText),
      dietaryRestrictions: splitList(restrictionText),
      dislikedIngredients: splitList(dislikeText),
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      addMutation.mutate(payload);
    }
  };

  // Add or edit someone — every tier. While editing, the form opens right
  // under that member's row so the pencil visibly does something.
  const formCard = (
    <Card testID="household-form" className="gap-3">
      <Text testID="household-form-title" variant="heading">
        {editing ? `Edit ${editing.name}` : 'Add someone'}
      </Text>
      {atCap ? (
        <Text variant="muted" className="text-xs">
          You&apos;ve reached the limit of {limit} household members.
        </Text>
      ) : (
        <>
          {/* Quick presets (the kid starts at ½ portion) */}
          {!editing && (
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
          )}
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
            loading={isSaving}
            disabled={!name.trim()}
            onPress={handleSave}
          >
            {editing ? 'Save changes' : 'Add to my table'}
          </Button>
          {editing && (
            <Button testID="household-edit-cancel" variant="ghost" onPress={resetForm}>
              Cancel
            </Button>
          )}
        </>
      )}
      {saveError && <Text className="text-xs text-red-600">{saveError.message}</Text>}
    </Card>
  );

  return (
    <View className="gap-4">
      {/* Members */}
      {isLoading ? (
        <ActivityIndicator color="#944a00" />
      ) : members.length === 0 ? (
        variant === 'screen' &&
        (showGhost && ghostKind ? (
          <HouseholdGhost kind={ghostKind} />
        ) : (
          <Card testID="household-empty" className="items-center border-dashed py-8">
            <Ionicons name="people-outline" size={36} color="#d1d5db" />
            <Text variant="muted" className="mt-2 text-sm">
              Just you at the table for now.
            </Text>
            {showGhost && (
              <Text variant="muted" className="mt-1 px-6 text-center text-xs">
                Tap “+ A kid” or “+ My partner” below to see your week with them.
              </Text>
            )}
          </Card>
        ))
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
              <Fragment key={m.id}>
                <View
                  className={cn(
                    'flex-row items-center gap-3 rounded-xl border bg-card p-3',
                    editing?.id === m.id ? 'border-primary' : 'border-border',
                  )}
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
                    testID={`household-edit-${m.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${m.name}`}
                    onPress={() => startEdit(m)}
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Ionicons name="pencil-outline" size={18} color="#6b7280" />
                  </Pressable>
                  <Pressable
                    testID={`household-remove-${m.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${m.name}`}
                    onPress={() => {
                      // Removing the member in the form drops the edit too.
                      if (editing?.id === m.id) {
                        resetForm();
                      }
                      setConfirmingId(m.id);
                    }}
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Ionicons name="trash-outline" size={18} color="#6b7280" />
                  </Pressable>
                </View>
                {editing?.id === m.id && formCard}
              </Fragment>
            ),
          )}
        </View>
      )}

      {/* Free tables: safety applies, scaling is the premium part (P2-3).
          An empty free table sees the ghost instead (F-PM-12). */}
      {variant === 'screen' && isPremium === false && members.length > 0 && (
        <Card testID="household-upsell" className="border-amber-200 bg-amber-50">
          <Text className="text-sm font-semibold text-gray-900">
            Everyone&apos;s allergies apply to every plan — free.
          </Text>
          <Text className="mt-1 text-sm text-gray-700">
            Your shopping list and servings are still sized for one portion. Premium scales them for
            your table ({tablePortions} portions), kids at half portions included.
          </Text>
          <Button
            testID="household-upsell-upgrade"
            variant="outline"
            size="sm"
            className="mt-3"
            onPress={() => router.push({ pathname: '/profile', params: { source: 'household' } })}
          >
            See Premium
          </Button>
        </Card>
      )}

      {/* Add someone — every tier (editing happens under the member) */}
      {!editing && formCard}
    </View>
  );
}
