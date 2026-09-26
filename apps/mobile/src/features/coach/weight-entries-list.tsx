import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import {
  bodyWeightInUnit,
  formatBodyWeight,
  parseBodyWeight,
  type UnitSystem,
} from '@chefer/utils';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { trpc } from '../../lib/trpc';

// Correct or remove weigh-ins (audit F-DASH-3-1) — mobile counterpart of web
// features/coach/WeightEntriesList. Hosted on /progress (as on web) and, for
// quick fixes, expandable inside the dashboard weight card.

type Entry = { id: string; weightKg: number; recordedAt: Date };

function EntryRow({ entry, system }: { entry: Entry; system: UnitSystem }) {
  const [editing, setEditing] = useState(false);
  // Edited in the user's unit (lb for IMPERIAL, backlog P2-6); saved as kg.
  const shown = String(bodyWeightInUnit(entry.weightKg, system));
  const weightLabel = formatBodyWeight(entry.weightKg, system);
  const [value, setValue] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const invalidate = () => {
    void utils.tracker.weightHistory.invalidate();
    void utils.gym.stats.bodyweight.invalidate();
    void utils.gym.bootstrap.invalidate();
  };
  const update = trpc.tracker.updateWeight.useMutation({
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
    onError: (err) => setError(err.message),
  });
  const remove = trpc.tracker.deleteWeight.useMutation({
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });

  const dateLabel = new Date(entry.recordedAt).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const save = () => {
    const parsed = parseBodyWeight(value, system);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    update.mutate({ id: entry.id, weightKg: parsed.kg });
  };

  const confirmDelete = () =>
    Alert.alert('Delete weigh-in?', `${weightLabel} on ${dateLabel}`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate({ id: entry.id }) },
    ]);

  return (
    <View testID={`weight-entry-${entry.id}`} className="py-1">
      <View className="flex-row items-center gap-2">
        <Text className="w-24 text-sm text-gray-500">{dateLabel}</Text>
        {editing ? (
          <TextInput
            testID={`weight-entry-${entry.id}-input`}
            autoFocus
            value={value}
            onChangeText={setValue}
            onSubmitEditing={save}
            keyboardType="decimal-pad"
            accessibilityLabel={`Weight on ${dateLabel} in ${system === 'IMPERIAL' ? 'pounds' : 'kilograms'}`}
            className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
          />
        ) : (
          <Text className="flex-1 text-sm font-semibold text-gray-900">{weightLabel}</Text>
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
      {error && <Text className="text-xs text-red-600">{error}</Text>}
    </View>
  );
}

/** Newest-first list of weigh-ins with inline edit and confirm-to-delete. */
export function WeightEntriesList({ entries }: { entries: Entry[] }) {
  const system = useUnitSystem();
  const newestFirst = [...entries].reverse();
  return (
    <View testID="weight-entries" className="mt-2 border-t border-border pt-2">
      {newestFirst.map((entry) => (
        <EntryRow key={entry.id} entry={entry} system={system} />
      ))}
    </View>
  );
}
