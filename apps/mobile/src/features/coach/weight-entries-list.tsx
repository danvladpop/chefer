import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { parseBodyWeightKg } from '@chefer/utils';
import { trpc } from '../../lib/trpc';

// Correct or remove weigh-ins (audit F-DASH-3-1) — mobile counterpart of web
// features/coach/WeightEntriesList. Web hosts it on /progress; mobile has no
// progress screen yet, so it expands inside the dashboard weight card.

type Entry = { id: string; weightKg: number; recordedAt: Date };

function EntryRow({ entry }: { entry: Entry }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(entry.weightKg));
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
    const parsed = parseBodyWeightKg(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    update.mutate({ id: entry.id, weightKg: parsed.kg });
  };

  const confirmDelete = () =>
    Alert.alert('Delete weigh-in?', `${entry.weightKg} kg on ${dateLabel}`, [
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
            accessibilityLabel={`Weight on ${dateLabel} in kilograms`}
            className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
          />
        ) : (
          <Text className="flex-1 text-sm font-semibold text-gray-900">{entry.weightKg} kg</Text>
        )}
        <Pressable
          testID={`weight-entry-${entry.id}-${editing ? 'save' : 'edit'}`}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Save weight' : `Edit ${entry.weightKg} kg on ${dateLabel}`}
          disabled={update.isPending}
          onPress={editing ? save : () => setEditing(true)}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name={editing ? 'checkmark' : 'pencil-outline'} size={18} color="#4b5563" />
        </Pressable>
        <Pressable
          testID={`weight-entry-${entry.id}-${editing ? 'cancel' : 'delete'}`}
          accessibilityRole="button"
          accessibilityLabel={
            editing ? 'Cancel editing' : `Delete ${entry.weightKg} kg on ${dateLabel}`
          }
          disabled={remove.isPending}
          onPress={
            editing
              ? () => {
                  setEditing(false);
                  setValue(String(entry.weightKg));
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
  const newestFirst = [...entries].reverse();
  return (
    <View testID="weight-entries" className="mt-2 border-t border-border pt-2">
      {newestFirst.map((entry) => (
        <EntryRow key={entry.id} entry={entry} />
      ))}
    </View>
  );
}
