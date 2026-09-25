import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, Screen, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useEntitlement } from '../src/hooks/use-entitlement';
import { trpc } from '../src/lib/trpc';

// Household (F2) — port of web's preferences household-section (wave-2b).
// Adding/editing is premium (capped by PLAN_FEATURES.householdMembers);
// list + remove stay open so a downgraded user can still see and clear.

const PORTION_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;

const splitList = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export default function HouseholdScreen() {
  const { enabled, limit, isPremium } = useEntitlement('householdMembers');
  const { data: members = [], isLoading } = trpc.household.list.useQuery();
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [portionFactor, setPortionFactor] = useState<number>(1);
  const [isKid, setIsKid] = useState(false);
  const [allergyText, setAllergyText] = useState('');
  const [dislikeText, setDislikeText] = useState('');

  const invalidate = () => {
    void utils.household.list.invalidate();
    void utils.mealPlan.invalidate();
    void utils.shoppingList.getForWeek.invalidate();
  };
  const addMutation = trpc.household.add.useMutation({
    onSuccess: () => {
      setName('');
      setAllergyText('');
      setDislikeText('');
      setIsKid(false);
      setPortionFactor(1);
      invalidate();
    },
  });
  const removeMutation = trpc.household.remove.useMutation({ onSuccess: invalidate });

  const atCap = limit !== null && members.length >= limit;

  const handleAdd = () => {
    if (!name.trim() || addMutation.isPending || atCap) {
      return;
    }
    addMutation.mutate({
      name: name.trim(),
      portionFactor,
      isKid,
      allergies: splitList(allergyText),
      dietaryRestrictions: [],
      dislikedIngredients: splitList(dislikeText),
    });
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <Text testID="household-title" variant="title">
          Household
        </Text>
      </View>

      <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
        <Text variant="muted" className="text-sm">
          Who eats with you? Portions, the shopping list and the week cost scale to your whole
          table; everyone&apos;s allergies apply to every plan.
        </Text>

        {isPremium === false && (
          <Card testID="household-upsell" className="border-amber-200 bg-amber-50">
            <Text className="text-sm font-semibold text-gray-900">
              Cooking for more than one is premium.
            </Text>
            <Text className="mt-1 text-sm text-gray-700">
              Premium scales every recipe, list and cost to your household — kids at half portions
              included. Upgrade from your Profile.
            </Text>
          </Card>
        )}

        {/* Members */}
        {isLoading ? (
          <ActivityIndicator color="#944a00" />
        ) : members.length === 0 ? (
          <Card testID="household-empty" className="items-center border-dashed py-8">
            <Ionicons name="people-outline" size={36} color="#d1d5db" />
            <Text variant="muted" className="mt-2 text-sm">
              Just you at the table for now.
            </Text>
          </Card>
        ) : (
          <View className="gap-2">
            {members.map((m) => (
              <View
                key={m.id}
                className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-medium text-gray-800">{m.name}</Text>
                    {m.isKid && (
                      <View className="rounded-full bg-accent px-2 py-0.5">
                        <Text className="text-[12px] font-semibold text-primary">Kid</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs text-gray-500">
                    {m.portionFactor}× portions
                    {m.allergies.length > 0 && ` · allergic: ${m.allergies.join(', ')}`}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.name}`}
                  disabled={removeMutation.isPending}
                  onPress={() => removeMutation.mutate({ id: m.id })}
                  className="h-11 w-11 items-center justify-center"
                >
                  <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Add member (premium) */}
        {enabled && (
          <Card className="gap-3">
            <Text variant="heading">Add someone</Text>
            {atCap ? (
              <Text variant="muted" className="text-xs">
                You&apos;ve reached your plan&apos;s limit of {limit} household members.
              </Text>
            ) : (
              <>
                <TextInput
                  testID="household-name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Name — e.g. Maria"
                  placeholderTextColor="#9ca3af"
                  className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
                />
                <View className="gap-1">
                  <Text variant="label">Portion size</Text>
                  <View className="flex-row gap-2">
                    {PORTION_OPTIONS.map((p) => (
                      <Pressable
                        key={p}
                        accessibilityRole="button"
                        onPress={() => setPortionFactor(p)}
                        className={cn(
                          'h-11 flex-1 items-center justify-center rounded-md border',
                          portionFactor === p
                            ? 'border-primary bg-primary'
                            : 'border-border bg-white',
                        )}
                      >
                        <Text
                          className={cn(
                            'text-xs font-semibold',
                            portionFactor === p ? 'text-primary-foreground' : 'text-gray-600',
                          )}
                        >
                          {p}×
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text variant="label">Child (smaller portions)</Text>
                  <Switch
                    value={isKid}
                    onValueChange={(v) => {
                      setIsKid(v);
                      if (v) {
                        setPortionFactor(0.5);
                      }
                    }}
                  />
                </View>
                <TextInput
                  testID="household-allergies"
                  value={allergyText}
                  onChangeText={setAllergyText}
                  placeholder="Allergies, comma-separated (optional)"
                  placeholderTextColor="#9ca3af"
                  className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
                />
                <TextInput
                  testID="household-dislikes"
                  value={dislikeText}
                  onChangeText={setDislikeText}
                  placeholder="Dislikes, comma-separated (optional)"
                  placeholderTextColor="#9ca3af"
                  className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
                />
                <Button
                  testID="household-add"
                  loading={addMutation.isPending}
                  disabled={!name.trim()}
                  onPress={handleAdd}
                >
                  Add to household
                </Button>
              </>
            )}
            {addMutation.isError && (
              <Text className="text-xs text-red-600">{addMutation.error.message}</Text>
            )}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
