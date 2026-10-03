import { Fragment, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { findSafetyTaxonomyEntry, HOUSEHOLD_PORTION_OPTIONS } from '@chefer/types';
import { Button, Card, ErrorState, Input, PressableScale, Sheet, Text } from '@chefer/ui-mobile';
import {
  allergiesAndDietForText,
  classifySafetyValue,
  cn,
  householdPortionSum,
  memberSummaryLine,
  tableSummaryLine,
  userFacingErrorMessage,
  type HouseholdGhostKind,
  type SafetyPickerValue,
} from '@chefer/utils';
import { useEntitlement } from '../../hooks/use-entitlement';
import { trpc } from '../../lib/trpc';
import { openPremium } from '../premium/open-premium';
import { HealthDeclinedNotice } from '../privacy/health-notices';
import { useHealthConsent } from '../privacy/use-health-consent';
import { SafetyPicker, type SafetyPickerHandle } from '../safety/safety-picker';
import { HouseholdGhost } from './household-ghost';

// Household editor (F2, backlog P2-3) — port of web's household-section.
// Every tier adds AND edits members (name, portion, kid, allergies,
// restrictions): they filter every plan and allergen warning (safety is
// never premium). Premium adds SCALING: servings, the shopping list and the
// week cost follow the whole table. Free + empty: the preset chips reveal
// the ghost sample for the chip tapped (F-PM-12). Used by the Household
// screen and the onboarding "Who's at your table?" step.
//
// T-01.7: the old comma-separated Allergies/Dietary restrictions/Dislikes
// text inputs are replaced by one "Allergies & diet for {name}" button that
// opens the shared SafetyPicker in a Sheet — the same structured entry
// onboarding and Settings use. A "You" card is always first (UX-01).

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

const EMPTY_SAFETY: SafetyPickerValue = {
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
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

function labelFor(id: string): string {
  return findSafetyTaxonomyEntry(id)?.label ?? id;
}

/** `{portion} portion · allergic: … · {diet} · won't eat: …` (UX-02, CI-41). */
function memberCardSummary(m: {
  portionFactor: number;
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
}): string {
  const classified = classifySafetyValue(m);
  const dietParts = [
    ...(classified.dietBaseId ? [classified.dietBaseId] : []),
    ...classified.dietModifierIds,
  ].map(labelFor);
  return memberSummaryLine({
    portionLabel: PORTION_LABELS[m.portionFactor] ?? String(m.portionFactor),
    allergies: classified.allergyIds.map(labelFor),
    diet: dietParts.length > 0 ? dietParts.join(', ') : undefined,
    dislikes: classified.dislikeIds.map(labelFor),
  });
}

/** "You" card — always first (UX-01). Own safety, saved through preferences.updateSafety. */
function YouCard() {
  const { data, isError, refetch } = trpc.preferences.get.useQuery();
  const utils = trpc.useUtils();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<SafetyPickerValue>(EMPTY_SAFETY);
  // UX-ACC-01: flushes a typed-but-unadded "Something else?" term before Save.
  const pickerRef = useRef<SafetyPickerHandle>(null);
  // T-26.2: your own allergies/diets are health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [declined, setDeclined] = useState(false);

  // UX-ACC-03: "You" is only editable once the saved preferences have loaded —
  // an editor seeded from a failed load would save empty lists over the real
  // allergies (updateSafety replaces them).
  const loaded = data !== undefined;
  const ownSafety: SafetyPickerValue = {
    dietaryRestrictions: data?.dietaryPreferences?.dietaryRestrictions ?? [],
    allergies: data?.dietaryPreferences?.allergies ?? [],
    dislikedIngredients: data?.dietaryPreferences?.dislikedIngredients ?? [],
  };

  const saveMutation = trpc.preferences.updateSafety.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setSheetOpen(false);
      void utils.preferences.get.invalidate();
      void utils.mealPlan.invalidate();
    },
  });

  if (!loaded) {
    return (
      <View
        testID="household-you-unavailable"
        className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-gray-800">You</Text>
          <Text className="text-xs text-gray-500">
            {isError
              ? 'Couldn’t load your allergies and diet. Nothing has been changed.'
              : 'Loading your allergies and diet…'}
          </Text>
        </View>
        {isError && (
          <Button
            testID="household-you-retry"
            variant="outline"
            size="sm"
            onPress={() => void refetch()}
          >
            Retry
          </Button>
        )}
      </View>
    );
  }

  return (
    <>
      <Pressable
        testID="household-you-card"
        accessibilityRole="button"
        accessibilityLabel={allergiesAndDietForText('you')}
        onPress={() => {
          setDraft(ownSafety);
          setSheetOpen(true);
        }}
        className="flex-row items-center gap-3 rounded-xl border border-primary/30 bg-accent/40 p-3"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-gray-800">You</Text>
          <Text className="text-xs text-gray-500">
            {memberCardSummary({ portionFactor: 1, ...ownSafety })}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#6b7280" />
      </Pressable>
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={allergiesAndDietForText('you')}
        testID="household-you-sheet"
        footer={
          <Button
            testID="household-you-save"
            loading={saveMutation.isPending}
            onPress={() => {
              // null = a typed term still needs a Keep/Remove choice: don't save yet.
              const toSave = pickerRef.current ? pickerRef.current.flush() : draft;
              if (toSave === null) return;
              setDeclined(false);
              requestHealthConsent(() => saveMutation.mutate(toSave), {
                hasHealthData:
                  toSave.allergies.length +
                    toSave.dietaryRestrictions.length +
                    toSave.dislikedIngredients.length >
                  0,
                // "Don't save it": nothing is stored; the sheet stays open with the notice.
                onDeclined: () => setDeclined(true),
              });
            }}
          >
            Save changes
          </Button>
        }
      >
        <SafetyPicker
          ref={pickerRef}
          value={draft}
          onChange={setDraft}
          testIDPrefix="household-you"
        />
        {saveMutation.isError && (
          <Text testID="household-you-error" className="text-xs text-red-600">
            {userFacingErrorMessage(saveMutation.error)}
          </Text>
        )}
        {declined && <HealthDeclinedNotice testID="household-you-declined" />}
        {/* Nested in the open Sheet: iOS can't present a Modal over a presenting one. */}
        {healthConsentSheet}
      </Sheet>
    </>
  );
}

export function HouseholdEditor({ variant = 'screen' }: { variant?: 'screen' | 'onboarding' }) {
  const { limit, isPremium } = useEntitlement('householdMembers');
  const list = trpc.household.list.useQuery();
  const members = list.data ?? [];
  const isLoading = list.isLoading;
  // UX-ACC-03: a failed load must not look like "Just you at the table" — the
  // editor shows an error with Retry instead and never builds on missing data.
  const listFailed = list.isError && list.data === undefined;
  const { data: table } = trpc.safety.getTable.useQuery();
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [portionFactor, setPortionFactor] = useState<number>(1);
  const [isKid, setIsKid] = useState(false);
  const [memberSafety, setMemberSafety] = useState<SafetyPickerValue>(EMPTY_SAFETY);
  const [memberSafetySheetOpen, setMemberSafetySheetOpen] = useState(false);
  // UX-ACC-01: flushes a typed-but-unadded "Something else?" term on Done/close.
  const memberPickerRef = useRef<SafetyPickerHandle>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /** The member being edited in the form; null = the form adds someone. */
  const [editing, setEditing] = useState<Member | null>(null);
  /** The chip the free ghost is showing (F-PM-12). */
  const [ghostKind, setGhostKind] = useState<HouseholdGhostKind | null>(null);
  // T-26.2: a member's allergies/diets are health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [safetyDeclined, setSafetyDeclined] = useState(false);

  // Member changes move plan warnings, list sizes and costs.
  const invalidate = () => {
    void utils.household.list.invalidate();
    void utils.preferences.get.invalidate();
    void utils.mealPlan.invalidate();
    void utils.shoppingList.getForWeek.invalidate();
    void utils.safety.getTable.invalidate();
  };
  const resetForm = () => {
    setName('');
    setMemberSafety(EMPTY_SAFETY);
    setIsKid(false);
    setPortionFactor(1);
    setEditing(null);
  };
  const addMutation = trpc.household.add.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });
  const updateMutation = trpc.household.update.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });
  const removeMutation = trpc.household.remove.useMutation({
    meta: { silent: true },
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

  /** Done / dismiss on the member sheet: commit the typed term first, stay open if it needs a choice. */
  const closeMemberSafetySheet = () => {
    const flushed = memberPickerRef.current ? memberPickerRef.current.flush() : memberSafety;
    if (flushed === null) return;
    setMemberSafetySheetOpen(false);
  };

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
    setMemberSafety({
      allergies: m.allergies,
      dietaryRestrictions: m.dietaryRestrictions,
      dislikedIngredients: m.dislikedIngredients,
    });
  };

  const handleSave = () => {
    if (!name.trim() || isSaving || atCap) {
      return;
    }
    const base = { name: name.trim(), portionFactor, isKid };
    const save = (payload: typeof base & Partial<SafetyPickerValue>) => {
      if (editing) {
        updateMutation.mutate({ id: editing.id, ...payload });
      } else {
        addMutation.mutate(payload);
      }
    };
    setSafetyDeclined(false);
    requestHealthConsent(() => save({ ...base, ...memberSafety }), {
      // A member with only a name and a portion stores nothing health-related.
      hasHealthData:
        memberSafety.allergies.length +
          memberSafety.dietaryRestrictions.length +
          memberSafety.dislikedIngredients.length >
        0,
      // "Don't save it": keep the name/portion/kid answers, leave the allergy
      // lists out (an edit keeps what is stored; an add stores none).
      onDeclined: () => {
        setSafetyDeclined(true);
        save(base);
      },
    });
  };

  // Table summary (UX-02, CI-41): "{n} at the table · we'll check for …".
  const peopleCount = members.length + 1; // + you
  const tableSummary = table?.hasRules
    ? tableSummaryLine(
        peopleCount,
        table.people.flatMap((p) => p.items.map((item) => ({ label: item.label, who: p.who }))),
      )
    : null;

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
          <Pressable
            testID="household-safety-open"
            accessibilityRole="button"
            accessibilityLabel={allergiesAndDietForText(name.trim() || 'this person')}
            onPress={() => setMemberSafetySheetOpen(true)}
            className="min-h-11 flex-row items-center justify-between rounded-md border border-border px-3"
          >
            <Text className="text-sm text-gray-700">
              {allergiesAndDietForText(name.trim() || 'this person')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#6b7280" />
          </Pressable>
          <Text testID="household-safety-summary" variant="muted" className="text-xs">
            {memberCardSummary({ portionFactor, ...memberSafety })}
          </Text>
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
      {saveError && (
        <Text testID="household-save-error" className="text-xs text-red-600">
          {userFacingErrorMessage(saveError)}
        </Text>
      )}
      {safetyDeclined && <HealthDeclinedNotice testID="household-member-declined" />}
    </Card>
  );

  return (
    <View className="gap-4">
      {healthConsentSheet}
      {/* "You" card — always first (UX-01) */}
      {variant === 'screen' && <YouCard />}

      {/* Members */}
      {isLoading ? (
        <ActivityIndicator color="#944a00" />
      ) : listFailed ? (
        <ErrorState
          testID="household-load-error"
          title="Couldn’t load your household"
          description="Nothing has been changed. Check your connection and try again."
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void list.refetch()}
        />
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
                    <Text testID={`household-summary-${m.id}`} className="text-xs text-gray-500">
                      {memberCardSummary(m)}
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

      {/* UX-02/CI-41: table read-back summary */}
      {tableSummary && (
        <Text testID="household-table-summary" variant="muted" className="text-xs">
          {tableSummary}
        </Text>
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
            onPress={() => openPremium('household')}
          >
            See what Premium adds
          </Button>
        </Card>
      )}

      {removeMutation.isError && (
        <Text testID="household-remove-error" className="text-xs text-red-600">
          {userFacingErrorMessage(removeMutation.error)}
        </Text>
      )}

      {/* Add someone — every tier (editing happens under the member). Hidden while the
          list failed to load: the table size (and the member cap) is unknown. */}
      {!editing && !listFailed && formCard}

      <Sheet
        visible={memberSafetySheetOpen}
        onClose={closeMemberSafetySheet}
        title={allergiesAndDietForText(name.trim() || 'this person')}
        testID="household-member-safety-sheet"
        footer={
          <Button testID="household-member-safety-done" onPress={closeMemberSafetySheet}>
            Done
          </Button>
        }
      >
        <SafetyPicker
          ref={memberPickerRef}
          value={memberSafety}
          onChange={setMemberSafety}
          testIDPrefix="household-member"
        />
      </Sheet>
    </View>
  );
}
