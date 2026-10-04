import { useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmSheet, NumericReturnBar, Text } from '@chefer/ui-mobile';
import {
  bodyWeightInUnit,
  formatBodyWeight,
  formatDate,
  parseBodyWeight,
  userFacingErrorMessage,
  type UnitSystem,
} from '@chefer/utils';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { trpc } from '../../lib/trpc';
import { useHealthConsent, type RequestHealthConsent } from '../privacy/use-health-consent';

// Correct or remove weigh-ins (audit F-DASH-3-1) — mobile counterpart of web
// features/coach/WeightEntriesList. Hosted on /progress (as on web) and, for
// quick fixes, expandable inside the dashboard weight card.

type Entry = { id: string; weightKg: number; recordedAt: Date };

function EntryRow({
  entry,
  system,
  requestHealthConsent,
}: {
  entry: Entry;
  system: UnitSystem;
  requestHealthConsent: RequestHealthConsent;
}) {
  const [editing, setEditing] = useState(false);
  // R-21: iOS's decimal-pad has no Done key — the shared accessory bar gives it
  // one (unique per row so the native ids never collide).
  const barId = `weight-entry-numeric-bar-${entry.id}`;
  // Edited in the user's unit (lb for IMPERIAL, backlog P2-6); saved as kg.
  const shown = String(bodyWeightInUnit(entry.weightKg, system));
  const weightLabel = formatBodyWeight(entry.weightKg, system);
  const [value, setValue] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  // UX-X-13: confirm-to-delete is a ConfirmSheet (busy + the failure inside it).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const utils = trpc.useUtils();

  const invalidate = () => {
    void utils.tracker.weightHistory.invalidate();
    void utils.gym.stats.bodyweight.invalidate();
    void utils.gym.bootstrap.invalidate();
  };
  const update = trpc.tracker.updateWeight.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const remove = trpc.tracker.deleteWeight.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setConfirmingDelete(false);
      invalidate();
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });

  const dateLabel = formatDate(new Date(entry.recordedAt), 'weekday-short');

  const save = () => {
    const parsed = parseBodyWeight(value, system);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    requestHealthConsent(() => update.mutate({ id: entry.id, weightKg: parsed.kg }), {
      onDeclined: () => setEditing(false),
    });
  };

  const confirmDelete = () => {
    setError(null);
    setConfirmingDelete(true);
  };

  return (
    <View testID={`weight-entry-${entry.id}`} className="py-1">
      <View className="flex-row items-center gap-2">
        {/* Locale dates vary in length ("Tue, 22 Sep"): size to the label, never wrap (UX-X-15). */}
        <Text
          testID={`weight-entry-${entry.id}-date`}
          numberOfLines={1}
          className="min-w-24 shrink-0 text-sm text-gray-500"
        >
          {dateLabel}
        </Text>
        {editing ? (
          <TextInput
            testID={`weight-entry-${entry.id}-input`}
            autoFocus
            value={value}
            onChangeText={setValue}
            returnKeyType="done"
            onSubmitEditing={save}
            inputAccessoryViewID={barId}
            keyboardType="decimal-pad"
            accessibilityLabel={`Weight on ${dateLabel} in ${system === 'IMPERIAL' ? 'pounds' : 'kilograms'}`}
            className="min-h-11 py-2 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
          />
        ) : (
          <Text className="min-w-0 flex-1 text-sm font-semibold text-gray-900">{weightLabel}</Text>
        )}
        <Pressable
          testID={`weight-entry-${entry.id}-${editing ? 'save' : 'edit'}`}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Save weight' : `Edit ${weightLabel} on ${dateLabel}`}
          disabled={update.isPending}
          onPress={editing ? save : () => setEditing(true)}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name={editing ? 'checkmark' : 'pencil-outline'} size={18} color="#4b5563" />
        </Pressable>
        <Pressable
          testID={`weight-entry-${entry.id}-${editing ? 'cancel' : 'delete'}`}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Cancel editing' : `Delete ${weightLabel} on ${dateLabel}`}
          disabled={remove.isPending}
          onPress={
            editing
              ? () => {
                  setEditing(false);
                  setValue(shown);
                  setError(null);
                }
              : confirmDelete
          }
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name={editing ? 'close' : 'trash-outline'} size={18} color="#4b5563" />
        </Pressable>
      </View>
      {editing && (
        <NumericReturnBar
          nativeID={barId}
          testID={`weight-entry-${entry.id}-numeric-bar`}
          label="Done"
          onPress={() => Keyboard.dismiss()}
        />
      )}
      {error && <Text className="text-xs text-red-600">{error}</Text>}
      <ConfirmSheet
        testID={`weight-entry-${entry.id}-delete-confirm`}
        visible={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete weigh-in?"
        body={`${weightLabel} on ${dateLabel}`}
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        busy={remove.isPending}
        error={confirmingDelete ? error : null}
        onConfirm={() => remove.mutate({ id: entry.id })}
      />
    </View>
  );
}

/** Newest-first list of weigh-ins with inline edit and confirm-to-delete. */
export function WeightEntriesList({ entries }: { entries: Entry[] }) {
  const system = useUnitSystem();
  const newestFirst = [...entries].reverse();
  // T-26.2: correcting a weigh-in stores health information too. UX-FOOD-28:
  // ONE consent sheet for the whole list — a Modal per row meant dozens of
  // mounted Modals (and two could open at once).
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  return (
    <View testID="weight-entries" className="mt-2 border-t border-border pt-2">
      {newestFirst.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          system={system}
          requestHealthConsent={requestHealthConsent}
        />
      ))}
      {healthConsentSheet}
    </View>
  );
}
