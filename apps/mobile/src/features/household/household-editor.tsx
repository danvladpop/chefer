import { Fragment, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  findSafetyTaxonomyEntry,
  HOUSEHOLD_AGE_BANDS,
  HOUSEHOLD_PORTION_OPTIONS,
  type HouseholdAgeBand,
} from '@chefer/types';
import {
  DONE_FIELD_PROPS,
  ErrorState,
  IconButton,
  Input,
  PressableScale,
  Sheet,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  AGE_BAND_LABELS,
  ageBandLabel,
  ageBandPortionFactor,
  allergiesAndDietForText,
  classifySafetyValue,
  cn,
  householdPortionSum,
  memberSummaryLine,
  parseAgeBand,
  tableSummaryLine,
  userFacingErrorMessage,
  type HouseholdGhostKind,
  type SafetyPickerValue,
} from '@chefer/utils';
import { Icon } from '../../components/icon';
import { useEntitlement } from '../../hooks/use-entitlement';
import { trpc } from '../../lib/trpc';
import { openPremium } from '../premium/open-premium';
import { HealthDeclinedNotice } from '../privacy/health-notices';
import { useHealthConsent } from '../privacy/use-health-consent';
import { SafetyPicker, type SafetyPickerHandle } from '../safety/safety-picker';
import { BoardCard } from '../shell/today/parts';
import { TrainButton } from '../shell/train/train-button';
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
  /** Optional kid age band (UX-PLAN-12) — a plain string column, narrowed with parseAgeBand. */
  ageBand: string | null;
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
  const colors = useThemeColors();
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
        className="flex-row items-center gap-3 rounded-card border border-separator bg-surface p-4"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-headline font-semibold text-label">You</Text>
          <Text className="text-subhead text-label-secondary">
            {isError
              ? 'Couldn’t load your allergies and diet. Nothing has been changed.'
              : 'Loading your allergies and diet…'}
          </Text>
        </View>
        {isError && (
          <TrainButton
            testID="household-you-retry"
            label="Retry"
            variant="tinted"
            onPress={() => void refetch()}
          />
        )}
      </View>
    );
  }

  return (
    <>
      <PressableScale
        testID="household-you-card"
        accessibilityRole="button"
        accessibilityLabel={allergiesAndDietForText('you')}
        onPress={() => {
          setDraft(ownSafety);
          setSheetOpen(true);
        }}
        className="min-h-11 flex-row items-center gap-3 rounded-card border border-separator bg-brand-tint p-4"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-headline font-semibold text-label">You</Text>
          <Text className="text-subhead text-label-secondary">
            {memberCardSummary({ portionFactor: 1, ...ownSafety })}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={colors.brand} />
      </PressableScale>
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={allergiesAndDietForText('you')}
        testID="household-you-sheet"
        footer={
          <TrainButton
            testID="household-you-save"
            label="Save changes"
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
          />
        }
      >
        <SafetyPicker
          ref={pickerRef}
          value={draft}
          onChange={setDraft}
          testIDPrefix="household-you"
        />
        {saveMutation.isError && (
          <Text testID="household-you-error" className="text-caption text-danger">
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

/**
 * What the onboarding wizard needs from the editor before it moves on
 * (UX-ONB-07): a name typed into "Add someone" but never added with the
 * button must not be dropped by Continue.
 */
export type HouseholdEditorHandle = {
  /** True while the form holds a typed, un-added name (and is not editing someone). */
  hasPending: () => boolean;
  /**
   * Adds the typed name through the normal save path (health consent included)
   * and calls `onAdded` once it is saved. If the save fails, is cancelled or is
   * blocked, `onAdded` never runs — the form stays and shows why.
   */
  addPending: (onAdded: () => void) => void;
};

export function HouseholdEditor({
  variant = 'screen',
  handleRef,
}: {
  variant?: 'screen' | 'onboarding';
  handleRef?: Ref<HouseholdEditorHandle>;
}) {
  const colors = useThemeColors();
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
  /** UX-PLAN-12: only meaningful while `isKid`; picking one pre-fills the portion. */
  const [ageBand, setAgeBand] = useState<HouseholdAgeBand | null>(null);
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
    setAgeBand(null);
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
    setAgeBand(null);
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
    setAgeBand(m.isKid ? parseAgeBand(m.ageBand) : null);
    setMemberSafety({
      allergies: m.allergies,
      dietaryRestrictions: m.dietaryRestrictions,
      dislikedIngredients: m.dislikedIngredients,
    });
  };

  const handleSave = (onSaved?: () => void) => {
    if (!name.trim() || isSaving || atCap) {
      return;
    }
    // Sent only when it differs from what is stored (null clears it; a non-kid never keeps one).
    const nextBand = isKid ? ageBand : null;
    const base = {
      name: name.trim(),
      portionFactor,
      isKid,
      ...(nextBand !== (editing ? parseAgeBand(editing.ageBand) : null)
        ? { ageBand: nextBand }
        : {}),
    };
    const save = (payload: typeof base & Partial<SafetyPickerValue>) => {
      if (editing) {
        const update = { id: editing.id, ...payload };
        if (onSaved) updateMutation.mutate(update, { onSuccess: onSaved });
        else updateMutation.mutate(update);
      } else if (onSaved) {
        addMutation.mutate(payload, { onSuccess: onSaved });
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

  // UX-ONB-07: the wizard's Continue asks before it leaves the table step.
  useImperativeHandle(handleRef, () => ({
    hasPending: () => editing === null && name.trim().length > 0 && !atCap,
    addPending: (onAdded) => handleSave(onAdded),
  }));

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
    <BoardCard testID="household-form">
      <Text
        testID="household-form-title"
        accessibilityRole="header"
        className="text-headline font-semibold text-label"
      >
        {editing ? `Edit ${editing.name}` : 'Add someone'}
      </Text>
      {atCap ? (
        <Text className="text-subhead text-label-secondary">
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
                      'h-11 flex-1 items-center justify-center rounded-full border border-dashed',
                      selected ? 'border-brand bg-brand-tint' : 'border-separator bg-surface',
                    )}
                  >
                    <Text className="text-callout font-semibold text-brand">
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
            {...DONE_FIELD_PROPS}
          />
          <View className="gap-1">
            <Text className="text-subhead font-semibold text-label-secondary">Portion size</Text>
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
                    'h-11 flex-1 items-center justify-center rounded-control border',
                    portionFactor === p ? 'border-brand bg-brand' : 'border-separator bg-surface',
                  )}
                >
                  <Text
                    className={cn(
                      'text-callout font-semibold',
                      portionFactor === p ? 'text-brand-on' : 'text-label-secondary',
                    )}
                  >
                    {PORTION_LABELS[p] ?? p}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </View>
          <View className="min-h-11 flex-row items-center justify-between">
            <Text className="min-w-0 flex-1 text-body text-label">Child (smaller portions)</Text>
            <Switch
              testID="household-kid"
              accessibilityLabel="Child"
              trackColor={{ true: colors.brand, false: colors.separator }}
              value={isKid}
              onValueChange={(v) => {
                setIsKid(v);
                if (v && portionFactor === 1) {
                  setPortionFactor(0.5);
                }
                if (!v) setAgeBand(null);
              }}
            />
          </View>
          {/* UX-PLAN-12: optional age — picking one pre-fills the portion, which stays adjustable. */}
          {isKid && (
            <View testID="household-age-group" className="gap-1">
              <Text className="text-subhead font-semibold text-label-secondary">
                Age (optional)
              </Text>
              <View className="flex-row gap-2">
                {HOUSEHOLD_AGE_BANDS.map((band) => (
                  <PressableScale
                    key={band}
                    testID={`household-age-${band}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Age ${AGE_BAND_LABELS[band]}`}
                    accessibilityState={{ selected: ageBand === band }}
                    onPress={() => {
                      if (ageBand === band) {
                        setAgeBand(null);
                        return;
                      }
                      setAgeBand(band);
                      setPortionFactor(ageBandPortionFactor(band));
                    }}
                    className={cn(
                      'h-11 flex-1 items-center justify-center rounded-control border',
                      ageBand === band ? 'border-brand bg-brand' : 'border-separator bg-surface',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-callout font-semibold',
                        ageBand === band ? 'text-brand-on' : 'text-label-secondary',
                      )}
                    >
                      {AGE_BAND_LABELS[band]}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>
          )}
          <PressableScale
            testID="household-safety-open"
            accessibilityRole="button"
            accessibilityLabel={allergiesAndDietForText(name.trim() || 'this person')}
            onPress={() => setMemberSafetySheetOpen(true)}
            className="min-h-11 flex-row items-center justify-between gap-2 rounded-control border border-separator bg-surface px-3"
          >
            <Text className="min-w-0 flex-1 text-callout text-label">
              {allergiesAndDietForText(name.trim() || 'this person')}
            </Text>
            <Icon name="chevronRight" size={18} color={colors.labelTertiary} />
          </PressableScale>
          <Text testID="household-safety-summary" className="text-subhead text-label-secondary">
            {memberCardSummary({ portionFactor, ...memberSafety })}
          </Text>
          <TrainButton
            testID="household-add"
            label={editing ? 'Save changes' : 'Add to my table'}
            loading={isSaving}
            disabled={!name.trim()}
            onPress={() => handleSave()}
          />
          {editing && (
            <TrainButton
              testID="household-edit-cancel"
              label="Cancel"
              variant="ghost"
              onPress={resetForm}
            />
          )}
        </>
      )}
      {saveError && (
        <Text testID="household-save-error" className="text-caption text-danger">
          {userFacingErrorMessage(saveError)}
        </Text>
      )}
      {safetyDeclined && <HealthDeclinedNotice testID="household-member-declined" />}
    </BoardCard>
  );

  return (
    <View className="gap-4">
      {healthConsentSheet}
      {/* "You" card — always first (UX-01) */}
      {variant === 'screen' && <YouCard />}

      {/* Members */}
      {isLoading ? (
        <ActivityIndicator color={colors.brand} />
      ) : listFailed ? (
        <ErrorState
          testID="household-load-error"
          title="Couldn’t load your household"
          description="Nothing has been changed. Check your connection and try again."
          icon={<Ionicons name="cloud-offline-outline" size={40} color={colors.labelTertiary} />}
          onRetry={() => void list.refetch()}
        />
      ) : members.length === 0 ? (
        variant === 'screen' &&
        (showGhost && ghostKind ? (
          <HouseholdGhost kind={ghostKind} />
        ) : (
          <BoardCard testID="household-empty" className="items-center border-dashed py-8">
            <Ionicons name="people-outline" size={36} color={colors.labelTertiary} />
            <Text className="text-body text-label-secondary">Just you at the table for now.</Text>
            {showGhost && (
              <Text className="px-6 text-center text-subhead text-label-tertiary">
                Tap “+ A kid” or “+ My partner” below to see your week with them.
              </Text>
            )}
          </BoardCard>
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
                className="gap-3 rounded-card border border-separator bg-surface p-4"
              >
                <Text className="text-body text-label">
                  Remove {m.name}? Their allergies stop applying to your plans.
                </Text>
                <View className="flex-row gap-2">
                  <TrainButton
                    label="Keep"
                    variant="outline"
                    className="flex-1"
                    onPress={() => setConfirmingId(null)}
                  />
                  <TrainButton
                    testID={`household-confirm-remove-${m.id}`}
                    label="Remove"
                    variant="danger"
                    className="flex-1 border border-separator bg-surface"
                    loading={removeMutation.isPending}
                    onPress={() => removeMutation.mutate({ id: m.id })}
                  />
                </View>
              </View>
            ) : (
              <Fragment key={m.id}>
                <View
                  className={cn(
                    'flex-row items-center gap-2 rounded-card border bg-surface py-2 pl-4 pr-2',
                    editing?.id === m.id ? 'border-brand' : 'border-separator',
                  )}
                >
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="min-w-0 shrink text-headline font-semibold text-label">
                        {m.name}
                      </Text>
                      {m.isKid && (
                        <Text className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand">
                          {ageBandLabel(m.ageBand) ? `Kid · ${ageBandLabel(m.ageBand)}` : 'Kid'}
                        </Text>
                      )}
                    </View>
                    <Text
                      testID={`household-summary-${m.id}`}
                      className="text-subhead text-label-secondary"
                    >
                      {memberCardSummary(m)}
                    </Text>
                  </View>
                  <IconButton
                    testID={`household-edit-${m.id}`}
                    accessibilityLabel={`Edit ${m.name}`}
                    icon={<Icon name="edit" size={20} color={colors.labelSecondary} />}
                    onPress={() => startEdit(m)}
                  />
                  <IconButton
                    testID={`household-remove-${m.id}`}
                    accessibilityLabel={`Remove ${m.name}`}
                    icon={<Icon name="trash" size={20} color={colors.danger} />}
                    onPress={() => {
                      // Removing the member in the form drops the edit too.
                      if (editing?.id === m.id) {
                        resetForm();
                      }
                      setConfirmingId(m.id);
                    }}
                  />
                </View>
                {editing?.id === m.id && formCard}
              </Fragment>
            ),
          )}
        </View>
      )}

      {/* UX-02/CI-41: table read-back summary */}
      {tableSummary && (
        <Text testID="household-table-summary" className="text-subhead text-label-secondary">
          {tableSummary}
        </Text>
      )}

      {/* Free tables: safety applies, scaling is the premium part (P2-3).
          An empty free table sees the ghost instead (F-PM-12). */}
      {variant === 'screen' && isPremium === false && members.length > 0 && (
        <BoardCard testID="household-upsell" className="bg-brand-tint">
          <Text className="text-headline font-semibold text-label">
            Everyone&apos;s allergies apply to every plan — free.
          </Text>
          <Text className="text-subhead text-label-secondary">
            Your shopping list and servings are still sized for one portion. Premium scales them for
            your table ({tablePortions} portions), kids at half portions included.
          </Text>
          <TrainButton
            testID="household-upsell-upgrade"
            label="See what Premium adds"
            variant="onBrand"
            onPress={() => openPremium('household')}
          />
        </BoardCard>
      )}

      {removeMutation.isError && (
        <Text testID="household-remove-error" className="text-caption text-danger">
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
          <TrainButton
            testID="household-member-safety-done"
            label="Done"
            onPress={closeMemberSafetySheet}
          />
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
