import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import { PastWeeksSection } from '../src/features/history/past-weeks-section';
import { trpc } from '../src/lib/trpc';

// My Weeks — the 4-week rotation plus past weeks (P2-8: History folded in).
// Save refined weeks as named templates, follow one (it applies now and
// future weeks carry it forward), rename, delete; below, past weeks to look
// back at or restore. Every tier: templates never touch AI. Web parity: the
// /my-weeks page. Reached from More and from the Plan tab.

const MAX_TEMPLATES = 4;

export default function MyWeeksScreen() {
  const [saveName, setSaveName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const utils = trpc.useUtils();
  const { data: templates, isLoading, isError, refetch } = trpc.mealPlan.listTemplates.useQuery();
  const { data: currentPlan } = trpc.mealPlan.getForWeek.useQuery({ weekOffset: 0 });

  const invalidate = () => {
    void utils.mealPlan.listTemplates.invalidate();
    void utils.mealPlan.getForWeek.invalidate();
    // Following a template replaces the week — derived tabs must not go stale.
    void utils.dashboard.summary.invalidate();
    void utils.tracker.invalidate();
    void utils.shoppingList.invalidate();
  };

  const saveMutation = trpc.mealPlan.saveAsTemplate.useMutation({
    onSuccess: () => {
      setSaveName('');
      invalidate();
    },
  });
  const followMutation = trpc.mealPlan.followTemplate.useMutation({ onSuccess: invalidate });
  const unfollowMutation = trpc.mealPlan.unfollowTemplate.useMutation({ onSuccess: invalidate });
  const renameMutation = trpc.mealPlan.renameTemplate.useMutation({
    onSuccess: () => {
      setRenamingId(null);
      invalidate();
    },
  });
  const deleteMutation = trpc.mealPlan.deleteTemplate.useMutation({ onSuccess: invalidate });

  const atCap = (templates?.length ?? 0) >= MAX_TEMPLATES;
  const busy =
    saveMutation.isPending ||
    followMutation.isPending ||
    unfollowMutation.isPending ||
    renameMutation.isPending ||
    deleteMutation.isPending;
  const error =
    saveMutation.error?.message ??
    followMutation.error?.message ??
    renameMutation.error?.message ??
    deleteMutation.error?.message ??
    null;

  const confirmDelete = (templateId: string, name: string) => {
    Alert.alert('Delete this week?', `"${name}" will be removed from your saved weeks.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMutation.mutate({ templateId }),
      },
    ]);
  };

  const confirmFollow = (templateId: string, name: string) => {
    Alert.alert('Follow this week?', `"${name}" replaces this week's plan and continues weekly.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Follow',
        onPress: () => followMutation.mutate({ templateId, weekOffset: 0 }),
      },
    ]);
  };

  return (
    <Screen className="px-0">
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-4">
        <Pressable
          testID="my-weeks-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <View>
          <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Your Rotation
          </Text>
          <Text testID="my-weeks-title" variant="title">
            My Weeks
          </Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-3 px-4 py-2 pb-8">
        <Text variant="muted" className="text-sm">
          Refine a great week, save it, and rotate through up to {MAX_TEMPLATES}. The week you
          follow repeats automatically until you switch.
        </Text>

        {/* Save the current week */}
        <Card className="gap-2">
          <Text className="text-sm font-semibold text-gray-900">Save this week</Text>
          {!currentPlan ? (
            <Text variant="muted" className="text-xs">
              No plan this week yet — generate or follow one first.
            </Text>
          ) : atCap ? (
            <Text variant="muted" className="text-xs">
              You already keep {MAX_TEMPLATES} weeks — delete one to save this week.
            </Text>
          ) : (
            <View className="flex-row items-center gap-2">
              <TextInput
                testID="my-weeks-save-name"
                value={saveName}
                onChangeText={setSaveName}
                placeholder="Name it, e.g. Mediterranean week"
                placeholderTextColor="#9ca3af"
                maxLength={40}
                className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-base text-foreground"
              />
              <Button
                testID="my-weeks-save"
                size="sm"
                disabled={!saveName.trim() || busy}
                loading={saveMutation.isPending}
                onPress={() =>
                  saveMutation.mutate({ planId: currentPlan.planId, name: saveName.trim() })
                }
              >
                Save
              </Button>
            </View>
          )}
        </Card>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <Text className="text-sm text-red-600">{error}</Text>
          </Card>
        )}

        {/* Saved weeks */}
        {isLoading ? (
          <View className="items-center py-8">
            <ActivityIndicator size="large" color="#944a00" />
          </View>
        ) : isError && !templates ? (
          <ErrorState
            title="Couldn't load your saved weeks"
            icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
            onRetry={() => void refetch()}
          />
        ) : !templates || templates.length === 0 ? (
          <Card testID="my-weeks-empty" className="items-center border-dashed py-8">
            <Ionicons name="albums-outline" size={32} color="#d1d5db" />
            <Text variant="muted" className="mt-2 text-center text-sm">
              No saved weeks yet. Tailor this week until it&apos;s right, then save it above.
            </Text>
          </Card>
        ) : (
          templates.map((t) => (
            <Card key={t.id} testID={`my-weeks-card-${t.id}`} className="gap-2">
              <View className="flex-row items-center justify-between gap-2">
                {renamingId === t.id ? (
                  <View className="min-w-0 flex-1 flex-row items-center gap-2">
                    <TextInput
                      value={renameValue}
                      onChangeText={setRenameValue}
                      autoFocus
                      maxLength={40}
                      className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-base text-foreground"
                    />
                    <Button
                      size="sm"
                      disabled={!renameValue.trim() || busy}
                      onPress={() =>
                        renameMutation.mutate({ templateId: t.id, name: renameValue.trim() })
                      }
                    >
                      OK
                    </Button>
                  </View>
                ) : (
                  <>
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-base font-semibold text-gray-900">
                        {t.name}
                      </Text>
                      <Text variant="muted" className="text-xs" numberOfLines={2}>
                        {t.mealsCount} meals · {t.previewNames.join(' · ')}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Rename ${t.name}`}
                      onPress={() => {
                        setRenamingId(t.id);
                        setRenameValue(t.name);
                      }}
                      className="h-11 w-11 items-center justify-center"
                    >
                      <Ionicons name="pencil-outline" size={16} color="#6b7280" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${t.name}`}
                      onPress={() => confirmDelete(t.id, t.name)}
                      className="h-11 w-11 items-center justify-center"
                    >
                      <Ionicons name="trash-outline" size={16} color="#dc2626" />
                    </Pressable>
                  </>
                )}
              </View>

              {t.isFollowed ? (
                <Button
                  testID={`my-weeks-unfollow-${t.id}`}
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onPress={() => unfollowMutation.mutate()}
                >
                  Following ✓ — tap to stop
                </Button>
              ) : (
                <Button
                  testID={`my-weeks-follow-${t.id}`}
                  size="sm"
                  disabled={busy}
                  loading={followMutation.isPending}
                  onPress={() => confirmFollow(t.id, t.name)}
                >
                  Follow this week
                </Button>
              )}
            </Card>
          ))
        )}

        <PastWeeksSection />
      </ScrollView>
    </Screen>
  );
}
