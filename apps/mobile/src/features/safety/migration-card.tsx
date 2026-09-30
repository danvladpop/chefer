import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Sheet, Text } from '@chefer/ui-mobile';
import {
  migrationMappingText,
  migrationMappingUncheckedText,
  recogniseSafetyTerm,
  SAFETY_COPY,
  type SafetyPickerValue,
} from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { useHealthConsent } from '../privacy/use-health-consent';
import { SafetyPicker } from './safety-picker';

// T-01.3 — the one-time free-text migration card (UX-01 (b)). Exported for
// wave 2 (L-HOME) to place on Food Today; this wave places it in Settings ›
// Allergies & diets (app/preferences.tsx). `Looks right` confirms the
// mapping as-is; `Change` opens the SafetyPicker pre-applied (it already
// reads the same stored values) then saves + confirms together. Until
// confirmed, `safety.getTable().needsReview` stays true and the filter
// over-blocks (old literal match + new mapping, never under-blocks).

function mappingLine(term: string): string {
  const recognised = recogniseSafetyTerm(term);
  if (recognised.kind === 'unrecognised') {
    return `“${term}” ${migrationMappingUncheckedText}`;
  }
  return migrationMappingText(term, recognised.label);
}

export function MigrationCard({ testID = 'safety-migration-card' }: { testID?: string }) {
  const { data: table } = trpc.safety.getTable.useQuery();
  const { data: prefsData } = trpc.preferences.get.useQuery();
  const utils = trpc.useUtils();
  const [changeOpen, setChangeOpen] = useState(false);
  // T-26.2: re-saving the allergy lists stores health information.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();

  const ownSafety: SafetyPickerValue = {
    allergies: prefsData?.dietaryPreferences?.allergies ?? [],
    dietaryRestrictions: prefsData?.dietaryPreferences?.dietaryRestrictions ?? [],
    dislikedIngredients: prefsData?.dietaryPreferences?.dislikedIngredients ?? [],
  };
  const [draft, setDraft] = useState<SafetyPickerValue>(ownSafety);

  const confirmMutation = trpc.safety.confirmReview.useMutation({
    onSuccess: () => void utils.safety.getTable.invalidate(),
  });
  const updateSafetyMutation = trpc.preferences.updateSafety.useMutation({
    onSuccess: () => {
      confirmMutation.mutate();
      setChangeOpen(false);
      void utils.preferences.get.invalidate();
      void utils.mealPlan.invalidate();
    },
  });

  if (!table?.needsReview) return null;

  const terms = [
    ...ownSafety.allergies,
    ...ownSafety.dietaryRestrictions,
    ...ownSafety.dislikedIngredients,
  ];

  return (
    <>
      <Card testID={testID} className="gap-3 border-amber-200 bg-amber-50">
        <View className="flex-row items-center gap-2">
          <Ionicons name="shield-outline" size={18} color="#92400e" />
          <Text className="text-sm font-semibold text-amber-900">{SAFETY_COPY.migrationTitle}</Text>
        </View>
        <Text className="text-sm text-amber-800">{SAFETY_COPY.migrationBody}</Text>
        <View className="gap-1">
          {terms.map((term) => (
            <Text key={term} className="text-xs text-amber-900">
              {mappingLine(term)}
            </Text>
          ))}
        </View>
        <View className="flex-row gap-2">
          <Button
            testID={`${testID}-looks-right`}
            variant="outline"
            className="flex-1"
            loading={confirmMutation.isPending}
            onPress={() => confirmMutation.mutate()}
          >
            {SAFETY_COPY.migrationLooksRight}
          </Button>
          <Button
            testID={`${testID}-change`}
            variant="ghost"
            className="flex-1"
            onPress={() => {
              setDraft(ownSafety);
              setChangeOpen(true);
            }}
          >
            {SAFETY_COPY.migrationChange}
          </Button>
        </View>
      </Card>
      <Sheet
        visible={changeOpen}
        onClose={() => setChangeOpen(false)}
        title={SAFETY_COPY.migrationChange}
        testID={`${testID}-change-sheet`}
        footer={
          <Button
            testID={`${testID}-change-save`}
            loading={updateSafetyMutation.isPending}
            onPress={() =>
              requestHealthConsent(() => updateSafetyMutation.mutate(draft), {
                hasHealthData:
                  draft.allergies.length +
                    draft.dietaryRestrictions.length +
                    draft.dislikedIngredients.length >
                  0,
                onDeclined: () => setChangeOpen(false),
              })
            }
          >
            Save changes
          </Button>
        }
      >
        <SafetyPicker value={draft} onChange={setDraft} testIDPrefix={`${testID}-picker`} />
        {/* Nested in the open Sheet: iOS can't present a Modal over a presenting one. */}
        {healthConsentSheet}
      </Sheet>
    </>
  );
}
