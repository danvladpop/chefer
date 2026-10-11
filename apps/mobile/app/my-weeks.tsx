import { useState } from 'react';
import { ActivityIndicator, Keyboard, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  ConfirmSheet,
  ErrorState,
  IconButton,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../src/components/icon';
import { PastWeeksSection } from '../src/features/history/past-weeks-section';
import { BoardCard } from '../src/features/shell/today/parts';
import { TrainButton } from '../src/features/shell/train/train-button';
import { trpc } from '../src/lib/trpc';

// My Weeks — up to 4 saved weeks plus past weeks (P2-8: History folded in).
// Save refined weeks as named templates, follow one (it applies now and
// future weeks carry it forward), rename, delete; below, past weeks to look
// back at or restore. Every tier: templates never touch AI. Web parity: the
// /my-weeks page. Reached from More and from the Plan tab.

const MAX_TEMPLATES = 4;
const NAME_MAX = 40;

export default function MyWeeksScreen() {
  const colors = useThemeColors();
  const [saveName, setSaveName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // UX-X-13: delete/follow confirm in a ConfirmSheet (busy + inline error),
  // not a native Alert that dismisses before the server answers.
  const [confirming, setConfirming] = useState<{
    kind: 'delete' | 'follow';
    templateId: string;
    name: string;
  } | null>(null);

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
    meta: { silent: true },
    onSuccess: () => {
      setSaveName('');
      invalidate();
    },
  });
  const followMutation = trpc.mealPlan.followTemplate.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setConfirming(null);
      invalidate();
    },
  });
  const unfollowMutation = trpc.mealPlan.unfollowTemplate.useMutation({ onSuccess: invalidate });
  const renameMutation = trpc.mealPlan.renameTemplate.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setRenamingId(null);
      invalidate();
    },
  });
  const deleteMutation = trpc.mealPlan.deleteTemplate.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setConfirming(null);
      invalidate();
    },
  });

  const atCap = (templates?.length ?? 0) >= MAX_TEMPLATES;
  const busy =
    saveMutation.isPending ||
    followMutation.isPending ||
    unfollowMutation.isPending ||
    renameMutation.isPending ||
    deleteMutation.isPending;
  const error =
    (saveMutation.error ? userFacingErrorMessage(saveMutation.error) : undefined) ??
    (followMutation.error ? userFacingErrorMessage(followMutation.error) : undefined) ??
    (renameMutation.error ? userFacingErrorMessage(renameMutation.error) : undefined) ??
    (deleteMutation.error ? userFacingErrorMessage(deleteMutation.error) : undefined) ??
    null;

  const saveCurrentWeek = () => {
    if (!currentPlan || !saveName.trim() || busy) return;
    Keyboard.dismiss();
    saveMutation.mutate({ planId: currentPlan.planId, name: saveName.trim() });
  };

  const submitRename = (templateId: string) => {
    if (!renameValue.trim() || busy) return;
    Keyboard.dismiss();
    renameMutation.mutate({ templateId, name: renameValue.trim() });
  };

  // UX-PLAN-10: rename can be abandoned — drop the draft and any error it left.
  const cancelRename = () => {
    renameMutation.reset();
    setRenamingId(null);
  };

  const confirmDelete = (templateId: string, name: string) => {
    deleteMutation.reset();
    setConfirming({ kind: 'delete', templateId, name });
  };

  const confirmFollow = (templateId: string, name: string) => {
    followMutation.reset();
    setConfirming({ kind: 'follow', templateId, name });
  };

  const confirmMutation = confirming?.kind === 'delete' ? deleteMutation : followMutation;

  return (
    <Screen className="bg-canvas px-0">
      {/* Header — the shell's pushed-page top bar (chevron Back + title1),
          drawn here to keep the my-weeks-back / my-weeks-title ids. */}
      <View className="min-h-11 flex-row items-center gap-1 px-4 pb-2 pt-3">
        <IconButton
          testID="my-weeks-back"
          accessibilityLabel="Back"
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
          className="-ml-2"
        />
        <View className="min-w-0 flex-1">
          <Text className="text-subhead font-semibold text-label-secondary" numberOfLines={1}>
            Saved & past weeks
          </Text>
          <Text
            testID="my-weeks-title"
            accessibilityRole="header"
            className="text-title1 font-bold text-label"
            numberOfLines={1}
          >
            My Weeks
          </Text>
        </View>
      </View>

      {/* UX-PLAN-10: keyboard-aware, taps on Save / OK land on the first press. */}
      <KeyboardAwareScrollView
        testID="my-weeks-scroll"
        contentContainerClassName="gap-4 px-4 py-2 pb-8"
      >
        <Text className="text-subhead text-label-secondary">
          Save a week you like and reuse it. The week you follow repeats each week until you switch.
        </Text>

        {/* Save the current week */}
        <BoardCard>
          <Text accessibilityRole="header" className="text-headline font-semibold text-label">
            Save this week
          </Text>
          {!currentPlan ? (
            <Text className="text-subhead text-label-secondary">
              No plan this week yet — generate or follow one first.
            </Text>
          ) : atCap ? (
            <Text className="text-subhead text-label-secondary">
              You already keep {MAX_TEMPLATES} weeks — delete one to save this week.
            </Text>
          ) : (
            <View className="flex-row items-center gap-2">
              <Input
                testID="my-weeks-save-name"
                accessibilityLabel="Name for this week"
                value={saveName}
                onChangeText={setSaveName}
                returnKeyType="done"
                onSubmitEditing={saveCurrentWeek}
                placeholder="Name it, e.g. Mediterranean week"
                placeholderTextColor={colors.labelTertiary}
                maxLength={NAME_MAX}
                className="min-w-0 flex-1 rounded-control"
              />
              <TrainButton
                testID="my-weeks-save"
                label="Save"
                disabled={!saveName.trim() || busy}
                loading={saveMutation.isPending}
                onPress={saveCurrentWeek}
              />
            </View>
          )}
        </BoardCard>

        {error && (
          <BoardCard className="bg-surface-sunken">
            <Text accessibilityRole="alert" className="text-subhead text-danger">
              {error}
            </Text>
          </BoardCard>
        )}

        {/* Saved weeks */}
        {isLoading ? (
          <View className="items-center py-8">
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : isError && !templates ? (
          <ErrorState
            title="Couldn't load your saved weeks"
            icon={<Ionicons name="cloud-offline-outline" size={40} color={colors.labelTertiary} />}
            onRetry={() => void refetch()}
          />
        ) : !templates || templates.length === 0 ? (
          <BoardCard testID="my-weeks-empty" className="items-center border-dashed py-8">
            <Ionicons name="albums-outline" size={32} color={colors.labelTertiary} />
            <Text className="text-center text-subhead text-label-secondary">
              No saved weeks yet. Tailor this week until it&apos;s right, then save it above.
            </Text>
          </BoardCard>
        ) : (
          templates.map((t) => (
            <BoardCard key={t.id} testID={`my-weeks-card-${t.id}`}>
              <View className="flex-row items-center justify-between gap-2">
                {renamingId === t.id ? (
                  <View className="min-w-0 flex-1 gap-2">
                    <Input
                      testID="my-weeks-rename-input"
                      accessibilityLabel="Week name"
                      value={renameValue}
                      onChangeText={setRenameValue}
                      onSubmitEditing={() => submitRename(t.id)}
                      returnKeyType="done"
                      autoFocus
                      maxLength={NAME_MAX}
                      className="min-w-0 flex-1 rounded-control"
                    />
                    <View className="flex-row items-center justify-between gap-2">
                      {/* UX-PLAN-10: the 40-character cap is visible, not a silent truncation. */}
                      <Text
                        testID="my-weeks-rename-count"
                        className="text-caption text-label-tertiary"
                        accessibilityLabel={`${renameValue.length} of ${NAME_MAX} characters`}
                      >
                        {renameValue.length}/{NAME_MAX}
                      </Text>
                      <View className="flex-row items-center gap-2">
                        <TrainButton
                          testID="my-weeks-rename-cancel"
                          label="Cancel"
                          variant="outline"
                          onPress={cancelRename}
                        />
                        <TrainButton
                          testID="my-weeks-rename-save"
                          label="OK"
                          disabled={!renameValue.trim() || busy}
                          onPress={() => submitRename(t.id)}
                        />
                      </View>
                    </View>
                  </View>
                ) : (
                  <>
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-headline font-semibold text-label">
                        {t.name}
                      </Text>
                      <Text className="text-subhead text-label-secondary" numberOfLines={2}>
                        {t.mealsCount} meals · {t.previewNames.join(' · ')}
                      </Text>
                    </View>
                    <IconButton
                      accessibilityLabel={`Rename ${t.name}`}
                      icon={<Icon name="edit" size={20} color={colors.labelSecondary} />}
                      onPress={() => {
                        setRenamingId(t.id);
                        setRenameValue(t.name);
                      }}
                    />
                    <IconButton
                      accessibilityLabel={`Delete ${t.name}`}
                      icon={<Icon name="trash" size={20} color={colors.danger} />}
                      onPress={() => confirmDelete(t.id, t.name)}
                    />
                  </>
                )}
              </View>

              {t.isFollowed ? (
                <TrainButton
                  testID={`my-weeks-unfollow-${t.id}`}
                  label="Following ✓ — tap to stop"
                  variant="tinted"
                  disabled={busy}
                  onPress={() => unfollowMutation.mutate()}
                />
              ) : (
                <TrainButton
                  testID={`my-weeks-follow-${t.id}`}
                  label="Follow this week"
                  disabled={busy}
                  loading={followMutation.isPending}
                  onPress={() => confirmFollow(t.id, t.name)}
                />
              )}
            </BoardCard>
          ))
        )}

        <PastWeeksSection />
      </KeyboardAwareScrollView>
      <ConfirmSheet
        testID="my-weeks-confirm"
        visible={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming?.kind === 'delete' ? 'Delete this week?' : 'Follow this week?'}
        body={
          confirming?.kind === 'delete'
            ? `"${confirming.name}" will be removed from your saved weeks.`
            : `"${confirming?.name ?? ''}" replaces this week's plan and continues weekly.`
        }
        confirmLabel={confirming?.kind === 'delete' ? 'Delete' : 'Follow'}
        cancelLabel="Cancel"
        destructive={confirming?.kind === 'delete'}
        busy={confirmMutation.isPending}
        error={confirmMutation.isError ? userFacingErrorMessage(confirmMutation.error) : null}
        onConfirm={() => {
          if (!confirming) return;
          if (confirming.kind === 'delete') {
            deleteMutation.mutate({ templateId: confirming.templateId });
          } else {
            followMutation.mutate({ templateId: confirming.templateId, weekOffset: 0 });
          }
        }}
      />
    </Screen>
  );
}
