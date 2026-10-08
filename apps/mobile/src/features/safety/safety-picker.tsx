import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  findSafetyTaxonomyEntry,
  safetyPickerEntries,
  safetyTaxonomyEntriesByGroup,
} from '@chefer/types';
import { ChipGroup, Input, Text } from '@chefer/ui-mobile';
import {
  applySafetyTerm,
  BASE_DIET_IDS,
  classifySafetyValue,
  DIET_MODIFIER_IDS,
  keepSafetyTermAsNote,
  SAFETY_COPY,
  serialiseSafetyPickerValue,
  type BaseDietId,
  type SafetyPickerValue,
} from '@chefer/utils';
import { ReadBackPanel } from './read-back-panel';
import { UncheckedNotice } from './unchecked-notice';

// SafetyPicker (UX-01 (a), T-01.7) — structured entry with read-back, used in
// three places: onboarding diet step, Settings › Allergies & diets, and per
// household member (all via `SafetyStep`, which wraps this). One scrolling
// component: Allergies, Diet, Won't eat, then "Something else".

const NO_RESTRICTION = 'none';

function labelFor(id: string): string {
  return findSafetyTaxonomyEntry(id)?.label ?? id;
}

/**
 * UX-ACC-01: what a host calls from its Save / Done / Continue. A term typed
 * in "Something else?" but never confirmed with "+" must not be lost, so the
 * host asks the picker to flush it first and saves the RETURNED value (state
 * updates are async — `value` is stale inside the same handler).
 *
 * - nothing pending → the current value;
 * - a recognised term → it is added and the new value is returned;
 * - an unrecognised term (or one still awaiting a Keep/Remove choice) → the
 *   picker shows its notice and returns `null`: the host must NOT save yet.
 */
export interface SafetyPickerHandle {
  flush: () => SafetyPickerValue | null;
}

export interface SafetyPickerProps {
  value: SafetyPickerValue;
  onChange: (value: SafetyPickerValue) => void;
  testIDPrefix?: string;
  ref?: Ref<SafetyPickerHandle>;
  /** True while the field holds un-added text or a Keep/Remove choice is open (a pending edit). */
  onPendingChange?: (pending: boolean) => void;
}

export function SafetyPicker({
  value,
  onChange,
  testIDPrefix = 'safety',
  ref,
  onPendingChange,
}: SafetyPickerProps) {
  const classified = classifySafetyValue(value);
  const [somethingElse, setSomethingElse] = useState('');
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    variant: 'unrecognised' | 'condition';
    term: string;
  } | null>(null);
  // Set when a host's Save was held back because a term still needs a choice.
  const [blockedTerm, setBlockedTerm] = useState<string | null>(null);

  const commit = (patch: Partial<ReturnType<typeof classifySafetyValue>>) => {
    onChange(serialiseSafetyPickerValue({ ...classified, ...patch }));
  };

  // ── Allergies ────────────────────────────────────────────────────────────
  // Legacy "Shellfish" is offered only while already selected (UX-ACC-06 follow-up).
  const allergyOptions = safetyPickerEntries('allergy', classified.allergyIds).map((e) => ({
    value: e.id,
    label: e.label,
  }));
  const allergyReadBackLines = classified.allergyIds
    .map((id) => findSafetyTaxonomyEntry(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) =>
      entry.mayContain
        ? `${entry.label} — and foods that often contain it: ${entry.mayContain}.`
        : `${entry.label}.`,
    );

  // ── Diet ─────────────────────────────────────────────────────────────────
  const dietBaseOptions = [
    { value: NO_RESTRICTION, label: 'No restriction' },
    ...BASE_DIET_IDS.map((id) => ({ value: id, label: labelFor(id) })),
  ];
  const dietBaseReadBack = dietReadBackFor(classified.dietBaseId);
  const veganSelected = classified.dietBaseId === 'vegan';
  const knownModifierIds = classified.dietModifierIds.filter(
    (id): id is (typeof DIET_MODIFIER_IDS)[number] =>
      (DIET_MODIFIER_IDS as readonly string[]).includes(id),
  );
  const unknownModifierIds = classified.dietModifierIds.filter(
    (id) => !(DIET_MODIFIER_IDS as readonly string[]).includes(id),
  );

  // ── Won't eat ────────────────────────────────────────────────────────────
  const dislikeOptions = safetyTaxonomyEntriesByGroup('dislike').map((e) => ({
    value: e.id,
    label: e.label,
  }));
  const dislikeLine =
    classified.dislikeIds.length > 0
      ? `We’ll leave out ${classified.dislikeIds
          .map((id) => findSafetyTaxonomyEntry(id)?.readBack.replace(/^doesn.t eat /, ''))
          .filter(Boolean)
          .join(' and ')}.`
      : '';

  // ── Something else ───────────────────────────────────────────────────────
  function handleAdd(): SafetyPickerValue | null {
    const outcome = applySafetyTerm(value, somethingElse);
    if (outcome.status === 'empty') return value;
    setSomethingElse('');
    setAddedMessage(null);
    setBlockedTerm(null);
    if (outcome.status === 'needs-decision') {
      setPending({ variant: outcome.variant, term: outcome.term });
      return null;
    }
    onChange(outcome.value);
    setAddedMessage(outcome.message);
    return outcome.value;
  }

  function keepPendingAsNote() {
    if (!pending) return;
    onChange(keepSafetyTermAsNote(value, pending.term));
    setPending(null);
    setBlockedTerm(null);
  }

  const hasPendingEdit = somethingElse.trim() !== '' || pending !== null;
  useEffect(() => {
    onPendingChange?.(hasPendingEdit);
  }, [hasPendingEdit, onPendingChange]);

  useImperativeHandle(ref, () => ({
    flush: () => {
      if (pending?.variant === 'unrecognised') {
        setBlockedTerm(pending.term);
        return null;
      }
      if (pending) {
        // A health-condition notice is informational — nothing is ever stored
        // from it, so a second Save simply moves on.
        setPending(null);
        return value;
      }
      const typed = somethingElse.trim();
      const added = handleAdd();
      if (added === null) setBlockedTerm(typed);
      return added;
    },
  }));

  return (
    <View className="gap-6">
      {/* ALLERGIES */}
      <View className="gap-3">
        <Text variant="label" accessibilityRole="header">
          ALLERGIES
        </Text>
        <ChipGroup
          testID={`${testIDPrefix}-allergies`}
          options={allergyOptions}
          value={classified.allergyIds}
          multiple
          onChange={(allergyIds) => commit({ allergyIds })}
        />
        <ReadBackPanel
          testID={`${testIDPrefix}-allergies-readback`}
          lines={
            allergyReadBackLines.length > 0 ? allergyReadBackLines : [SAFETY_COPY.readBackEmpty]
          }
        />
      </View>

      {/* DIET */}
      <View className="gap-3">
        <Text variant="label" accessibilityRole="header">
          DIET
        </Text>
        <ChipGroup
          testID={`${testIDPrefix}-diet-base`}
          options={dietBaseOptions}
          value={[classified.dietBaseId ?? NO_RESTRICTION]}
          onChange={([next]) =>
            commit({ dietBaseId: next === NO_RESTRICTION ? null : (next as BaseDietId) })
          }
        />
        <Text variant="muted" className="text-xs">
          Also:
        </Text>
        <ChipGroup
          testID={`${testIDPrefix}-diet-modifiers`}
          options={DIET_MODIFIER_IDS.map((id) => ({ value: id, label: labelFor(id) }))}
          value={knownModifierIds}
          multiple
          disabledValues={veganSelected ? ['dairy-free'] : []}
          hints={veganSelected ? { 'dairy-free': SAFETY_COPY.veganDairyFreeHint } : {}}
          onChange={(picked) => commit({ dietModifierIds: [...picked, ...unknownModifierIds] })}
        />
        {dietBaseReadBack ? (
          <ReadBackPanel
            testID={`${testIDPrefix}-diet-readback`}
            title=""
            lines={[dietBaseReadBack]}
          />
        ) : null}
      </View>

      {/* WON'T EAT */}
      <View className="gap-3">
        <Text variant="label" accessibilityRole="header">
          WON&apos;T EAT
        </Text>
        <ChipGroup
          testID={`${testIDPrefix}-dislikes`}
          options={dislikeOptions}
          value={classified.dislikeIds}
          multiple
          onChange={(dislikeIds) => commit({ dislikeIds })}
        />
        {dislikeLine ? (
          <Text testID={`${testIDPrefix}-dislikes-readback`} variant="muted" className="text-xs">
            {dislikeLine}
          </Text>
        ) : null}
      </View>

      {/* SOMETHING ELSE */}
      <View className="gap-2">
        <Text variant="label" accessibilityRole="header">
          SOMETHING ELSE?
        </Text>
        <View className="flex-row gap-2">
          {/* `Input` scrolls itself clear of the keyboard inside a keyboard-aware
              scroll view or Sheet (UX-ONB-07: Android hid this field). */}
          <Input
            testID={`${testIDPrefix}-something-else-input`}
            value={somethingElse}
            onChangeText={setSomethingElse}
            onSubmitEditing={() => handleAdd()}
            placeholder={SAFETY_COPY.somethingElsePlaceholder}
            returnKeyType="done"
            accessibilityLabel="Something else"
            className="flex-1"
          />
          <Pressable
            testID={`${testIDPrefix}-something-else-add`}
            accessibilityRole="button"
            accessibilityLabel="Add"
            onPress={() => handleAdd()}
            className="h-11 w-11 items-center justify-center rounded-md border border-border"
          >
            <Ionicons name="add" size={20} color="#944a00" />
          </Pressable>
        </View>
        {addedMessage ? (
          <Text testID={`${testIDPrefix}-added-message`} variant="muted" className="text-xs">
            {addedMessage}
          </Text>
        ) : null}
        {pending ? (
          <UncheckedNotice
            testID={`${testIDPrefix}-unchecked-notice`}
            term={pending.term}
            variant={pending.variant}
            onKeepNote={keepPendingAsNote}
            onRemove={() => {
              setPending(null);
              setBlockedTerm(null);
            }}
            onChooseGoal={() => {
              setPending(null);
              setBlockedTerm(null);
            }}
            onDismiss={() => {
              setPending(null);
              setBlockedTerm(null);
            }}
          />
        ) : null}
        {blockedTerm ? (
          <Text
            testID={`${testIDPrefix}-save-blocked`}
            accessibilityLiveRegion="polite"
            className="text-xs text-red-600"
          >
            Choose what to do with “{blockedTerm}” first — then save again.
          </Text>
        ) : null}
        {classified.notes.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5">
            {classified.notes.map((note) => (
              <Pressable
                key={note}
                testID={`${testIDPrefix}-note-${note}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove note ${note}`}
                onPress={() => commit({ notes: classified.notes.filter((n) => n !== note) })}
                className="min-h-9 flex-row items-center gap-1 rounded-full bg-gray-100 px-3"
              >
                <Ionicons name="help-circle-outline" size={12} color="#6b7280" />
                <Text className="text-xs text-gray-600">{note}</Text>
                <Ionicons name="close" size={12} color="#6b7280" />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function dietReadBackFor(id: BaseDietId | null): string | null {
  if (!id) return null;
  switch (id) {
    case 'vegetarian':
      return SAFETY_COPY.vegetarianReadBack;
    case 'vegetarian-no-eggs':
      return SAFETY_COPY.vegetarianNoEggsReadBack;
    case 'vegan':
      return SAFETY_COPY.veganReadBack;
    case 'pescatarian':
      return SAFETY_COPY.pescatarianReadBack;
    default:
      return null;
  }
}
