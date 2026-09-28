import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { findSafetyTaxonomyEntry, safetyTaxonomyEntriesByGroup } from '@chefer/types';
import { ChipGroup, Text } from '@chefer/ui-mobile';
import {
  BASE_DIET_IDS,
  classifySafetyValue,
  DIET_MODIFIER_IDS,
  recognisedAddedText,
  recognisedDietSetText,
  recognisedModifierAddedText,
  recogniseSafetyTerm,
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

export interface SafetyPickerProps {
  value: SafetyPickerValue;
  onChange: (value: SafetyPickerValue) => void;
  testIDPrefix?: string;
}

export function SafetyPicker({ value, onChange, testIDPrefix = 'safety' }: SafetyPickerProps) {
  const classified = classifySafetyValue(value);
  const [somethingElse, setSomethingElse] = useState('');
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    variant: 'unrecognised' | 'condition';
    term: string;
  } | null>(null);

  const commit = (patch: Partial<ReturnType<typeof classifySafetyValue>>) => {
    onChange(serialiseSafetyPickerValue({ ...classified, ...patch }));
  };

  // ── Allergies ────────────────────────────────────────────────────────────
  const allergyOptions = safetyTaxonomyEntriesByGroup('allergy').map((e) => ({
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
  function handleAdd() {
    const term = somethingElse.trim();
    if (!term) return;
    setSomethingElse('');
    setAddedMessage(null);
    const recognised = recogniseSafetyTerm(term);

    if (recognised.kind === 'unrecognised') {
      setPending({ variant: 'unrecognised', term });
      return;
    }
    if (recognised.kind === 'condition') {
      if (recognised.impliesDietId) {
        commit({
          dietModifierIds: [...new Set([...classified.dietModifierIds, recognised.impliesDietId])],
        });
        setAddedMessage(recognisedDietSetText(labelFor(recognised.impliesDietId)));
      } else {
        setPending({ variant: 'condition', term });
      }
      return;
    }
    if (recognised.kind === 'allergy') {
      commit({ allergyIds: [...new Set([...classified.allergyIds, recognised.id])] });
      setAddedMessage(recognisedAddedText('Allergies', recognised.label));
      return;
    }
    if (recognised.kind === 'dislike') {
      commit({ dislikeIds: [...new Set([...classified.dislikeIds, recognised.id])] });
      setAddedMessage(recognisedAddedText('Won’t eat', recognised.label));
      return;
    }
    // kind === 'diet': AC2 — a bare "no eggs"-family term never silently
    // makes a meat-eater vegetarian. With a Vegetarian base already chosen it
    // sets "Vegetarian, no eggs"; otherwise it only adds the Egg-free
    // modifier.
    if (
      recognised.id === 'vegetarian-no-eggs' &&
      classified.dietBaseId !== 'vegetarian' &&
      classified.dietBaseId !== 'vegetarian-no-eggs'
    ) {
      commit({ dietModifierIds: [...new Set([...classified.dietModifierIds, 'egg-free'])] });
      setAddedMessage(recognisedModifierAddedText('Egg-free'));
      return;
    }
    if ((BASE_DIET_IDS as readonly string[]).includes(recognised.id)) {
      commit({ dietBaseId: recognised.id as BaseDietId });
      setAddedMessage(recognisedDietSetText(recognised.label));
      return;
    }
    commit({ dietModifierIds: [...new Set([...classified.dietModifierIds, recognised.id])] });
    setAddedMessage(recognisedModifierAddedText(recognised.label));
  }

  function keepPendingAsNote() {
    if (!pending) return;
    commit({ notes: [...classified.notes, pending.term] });
    setPending(null);
  }

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
          <TextInput
            testID={`${testIDPrefix}-something-else-input`}
            value={somethingElse}
            onChangeText={setSomethingElse}
            onSubmitEditing={handleAdd}
            placeholder="e.g. aubergine"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
            accessibilityLabel="Something else"
            className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
          />
          <Pressable
            testID={`${testIDPrefix}-something-else-add`}
            accessibilityRole="button"
            accessibilityLabel="Add"
            onPress={handleAdd}
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
            onRemove={() => setPending(null)}
            onChooseGoal={() => setPending(null)}
            onDismiss={() => setPending(null)}
          />
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
