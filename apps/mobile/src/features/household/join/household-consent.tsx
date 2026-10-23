import { useState } from 'react';
import { View } from 'react-native';
import { findSafetyTaxonomyEntry, HOUSEHOLD_SHARING_COPY } from '@chefer/types';
import {
  Button,
  IconButton,
  Input,
  KeyboardAwareScrollView,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { HOUSEHOLD_MOBILE_COPY, joinPortionPhrase } from '../sharing/copy';

// ─── Join a household: the consent screen (ADR 0003, business_flow §17.1) ─────
// What is shared, what stays private, and the claimed profile's allergies / diet / dislikes to confirm
// or fix before joining. Every sentence is the shared HOUSEHOLD_SHARING_COPY (the web join page renders
// the same strings). The confirmed lists are what `household.join` writes.

export type SafetyLists = {
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
};
type ListName = keyof SafetyLists;

const LIST_NAMES: readonly ListName[] = ['allergies', 'dietaryRestrictions', 'dislikedIngredients'];
/** The join input's caps (joinHouseholdInputSchema). */
const LIST_MAX: Record<ListName, number> = {
  allergies: 20,
  dietaryRestrictions: 20,
  dislikedIngredients: 30,
};

function termLabel(term: string): string {
  return findSafetyTaxonomyEntry(term)?.label ?? term;
}

/** Whether the partner changed any list (case-insensitive, order ignored) — `household_joined.editedSafety`. */
export function safetyEdited(before: SafetyLists, after: SafetyLists): boolean {
  const norm = (list: string[]) => [...new Set(list.map((t) => t.trim().toLowerCase()))].sort();
  return LIST_NAMES.some((name) => norm(before[name]).join('|') !== norm(after[name]).join('|'));
}

function Bullets({ lines }: { lines: readonly string[] }) {
  return (
    <View className="gap-1.5">
      {lines.map((line, i) => (
        <View key={line} testID={`household-join-shares-${i}`} className="min-w-0 flex-row gap-2">
          <Text className="text-subhead text-label-secondary">•</Text>
          <Text className="min-w-0 flex-1 text-subhead text-label-secondary">{line}</Text>
        </View>
      ))}
    </View>
  );
}

function SafetyListEditor({
  name,
  terms,
  onChange,
}: {
  name: ListName;
  terms: string[];
  onChange: (terms: string[]) => void;
}) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState('');
  const title = HOUSEHOLD_SHARING_COPY.joinSafetyLists[name];
  const add = () => {
    const term = draft.trim().slice(0, 60);
    if (!term) return;
    if (
      !terms.some((t) => t.toLowerCase() === term.toLowerCase()) &&
      terms.length < LIST_MAX[name]
    ) {
      onChange([...terms, term]);
    }
    setDraft('');
  };
  return (
    <View testID={`household-join-list-${name}`} className="gap-2">
      <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
        {title}
      </Text>
      {terms.length === 0 ? (
        <Text className="text-subhead text-label-secondary">
          {HOUSEHOLD_SHARING_COPY.joinSafetyNone}
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {terms.map((term) => (
            <View
              key={term}
              testID={`household-join-term-${name}-${term}`}
              className="min-h-11 flex-row items-center rounded-full border border-separator bg-surface pl-3"
            >
              <Text className="text-subhead text-label">{termLabel(term)}</Text>
              <IconButton
                testID={`household-join-remove-${name}-${term}`}
                accessibilityLabel={HOUSEHOLD_SHARING_COPY.joinSafetyRemove(termLabel(term))}
                icon={<Icon name="close" size={16} color={colors.labelSecondary} />}
                onPress={() => onChange(terms.filter((t) => t !== term))}
              />
            </View>
          ))}
        </View>
      )}
      <View className="flex-row items-center gap-2">
        <Input
          testID={`household-join-input-${name}`}
          value={draft}
          onChangeText={setDraft}
          accessibilityLabel={HOUSEHOLD_SHARING_COPY.joinSafetyAddLabel(title)}
          placeholder={HOUSEHOLD_SHARING_COPY.joinSafetyAddLabel(title)}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={add}
          maxLength={60}
          className="min-w-0 flex-1"
        />
        <Button
          testID={`household-join-add-${name}`}
          variant="outline"
          disabled={!draft.trim()}
          onPress={add}
        >
          {HOUSEHOLD_SHARING_COPY.joinSafetyAdd}
        </Button>
      </View>
    </View>
  );
}

export function HouseholdConsent({
  ownerName,
  profileName,
  portionFactor,
  safety,
  onSafetyChange,
  busy,
  offline,
  error,
  onJoin,
  onDecline,
}: {
  ownerName: string;
  profileName: string;
  portionFactor: number;
  safety: SafetyLists;
  onSafetyChange: (next: SafetyLists) => void;
  busy: boolean;
  offline: boolean;
  error: string | null;
  onJoin: () => void;
  onDecline: () => void;
}) {
  const copy = HOUSEHOLD_SHARING_COPY;
  return (
    <KeyboardAwareScrollView
      testID="household-join-consent"
      contentContainerClassName="gap-4 px-4 pb-8 pt-4"
    >
      <Text
        testID="household-join-title"
        accessibilityRole="header"
        className="text-title2 font-bold text-label"
      >
        {copy.joinTitle(ownerName)}
      </Text>
      <Text testID="household-join-lede" className="text-body text-label">
        {copy.joinLede(ownerName, profileName)}
      </Text>
      <View className="gap-3 rounded-card border border-separator bg-surface p-4">
        <Bullets lines={copy.joinShares} />
        <Text testID="household-join-private" className="text-subhead text-label-secondary">
          {copy.joinPrivate}
        </Text>
      </View>
      <View className="gap-3 rounded-card border border-separator bg-surface p-4">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-headline font-semibold text-label">
            {copy.joinSafetyTitle}
          </Text>
          <Text className="text-subhead text-label-secondary">{copy.joinSafetyHint}</Text>
        </View>
        {LIST_NAMES.map((name) => (
          <SafetyListEditor
            key={name}
            name={name}
            terms={safety[name]}
            onChange={(terms) => onSafetyChange({ ...safety, [name]: terms })}
          />
        ))}
      </View>
      <Text testID="household-join-portion" className="text-subhead text-label-secondary">
        {copy.joinPortion(joinPortionPhrase(portionFactor))}
      </Text>
      <Text testID="household-join-own-plans" className="text-subhead text-label-secondary">
        {copy.joinOwnPlansNote}
      </Text>
      {error ? (
        <Text
          testID="household-join-error"
          accessibilityRole="alert"
          className="text-subhead text-danger"
        >
          {error}
        </Text>
      ) : null}
      {offline ? (
        <Text testID="household-join-offline" className="text-subhead text-label-secondary">
          {HOUSEHOLD_MOBILE_COPY.offlineJoin}
        </Text>
      ) : null}
      <Button testID="household-join-allow" loading={busy} disabled={offline} onPress={onJoin}>
        {copy.joinAllow}
      </Button>
      <Button testID="household-join-decline" variant="outline" disabled={busy} onPress={onDecline}>
        {copy.joinDecline}
      </Button>
    </KeyboardAwareScrollView>
  );
}
