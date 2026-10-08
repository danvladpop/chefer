import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { TableSafety, TableSafetyPerson } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { SAFETY_COPY, WELLNESS_COPY } from '@chefer/utils';

// WhatWeCheckSheet (UX-02 "What we check" sheet, an ExplainSheet instance —
// T-02.2). Every person's row opens their own SafetyStep (T-01.7); the
// footer action goes to Settings › Allergies & diets. Rows come straight
// from `safety.getTable`'s TableSafety payload, so the sheet always matches
// whatever the filter actually ran.

function personLine(person: TableSafetyPerson): string {
  const items = person.items.map((i) => i.label);
  const notes = person.notes.map((n) => `“${n}” (a note)`);
  const parts = [...items, ...notes];
  return parts.length > 0 ? parts.join(', ') : 'No allergies selected.';
}

export interface WhatWeCheckSheetProps {
  visible: boolean;
  onClose: () => void;
  table: TableSafety;
  /** Opens that person's SafetyStep — 'you' or a household member id. */
  onEditPerson?: (person: TableSafetyPerson) => void;
  testID?: string;
}

export function WhatWeCheckSheet({
  visible,
  onClose,
  table,
  onEditPerson,
  testID = 'what-we-check-sheet',
}: WhatWeCheckSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow={SAFETY_COPY.sheetEyebrow}
      title={SAFETY_COPY.sheetTitle}
      testID={testID}
      footer={
        <Button
          testID={`${testID}-edit`}
          variant="outline"
          onPress={() => {
            onClose();
            router.push('/preferences');
          }}
        >
          {SAFETY_COPY.sheetAction}
        </Button>
      }
    >
      <View className="gap-1">
        {table.people.map((person) => (
          <Pressable
            key={person.who}
            testID={`${testID}-row-${person.who}`}
            accessibilityRole={onEditPerson ? 'button' : undefined}
            onPress={onEditPerson ? () => onEditPerson(person) : undefined}
            className="min-h-11 flex-row items-center justify-between gap-3 border-b border-border py-2.5"
          >
            <Text className="w-20 shrink-0 text-sm font-medium capitalize">{person.who}</Text>
            <Text className="min-w-0 flex-1 text-sm text-gray-600">{personLine(person)}</Text>
            {onEditPerson ? (
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" accessible={false} />
            ) : null}
          </Pressable>
        ))}
      </View>
      <View className="gap-1 pt-2">
        <Text variant="heading" className="text-sm">
          {SAFETY_COPY.sheetHowHeading}
        </Text>
        <Text variant="muted" className="text-xs leading-relaxed">
          {SAFETY_COPY.sheetHowBody}
        </Text>
        <Text testID={`${testID}-advisory`} variant="muted" className="text-xs leading-relaxed">
          {WELLNESS_COPY.mealPlanAdvisoryDisclaimer}
        </Text>
      </View>
    </Sheet>
  );
}
