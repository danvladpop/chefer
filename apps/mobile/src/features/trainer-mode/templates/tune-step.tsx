import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { TEMPLATE_COPY, type TrainerRoutineExerciseDto, type WeightUnit } from '@chefer/types';
import { Button, DONE_FIELD_PROPS, ErrorState, FormField, Input, Text } from '@chefer/ui-mobile';
import { formatLoad, formatLoadNumber, unitLabel, userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useViewerUnits } from '../../friends/profile/use-viewer-units';
import { parseStartingWeight } from '../../gym/routine/default-load-field';

// ─── Set weights for one client (trainer-mode.md §6.6 "Tune per client") ─────
// After assigning: for each strength exercise of the day the client just got, what the app suggests
// from their history ("Last time 60 kg" / "No history yet") next to the template's starting weight,
// and a field for the weight the trainer wants. Saving writes the changed rows as next-session
// targets (the existing override, `trainer.client.setNextTarget`); Skip moves on without saving.

type StrengthRow = TrainerRoutineExerciseDto & {
  next: NonNullable<TrainerRoutineExerciseDto['next']>;
};

function isStrengthRow(row: TrainerRoutineExerciseDto): row is StrengthRow {
  return row.next !== null;
}

/** The reps the target keeps: the pending target's, else the app's, one value for every set. */
export function targetReps(row: StrengthRow): number[] {
  const rep = row.next.override?.reps[0] ?? row.next.suggestion.reps[0] ?? row.repMin;
  const sets = Math.max(1, Math.min(10, row.next.suggestion.sets || row.sets));
  return Array.from({ length: sets }, () => rep);
}

/** The kg in the field when it opens: the weight the app will prescribe next (a pending target included). */
function initialText(row: StrengthRow, unit: WeightUnit): string {
  return formatLoadNumber(row.next.suggestion.weightKg, unit);
}

export function TuneStep({
  testID,
  clientId,
  clientName,
  routineDayId,
  templateId,
  today,
  last,
  onDone,
}: {
  testID: string;
  clientId: string;
  clientName: string;
  routineDayId: string;
  templateId: string;
  today: string;
  last: boolean;
  onDone: () => void;
}) {
  const unit = useViewerUnits().weight;
  const utils = trpc.useUtils();
  // Fresh: the day was added a moment ago.
  const routine = trpc.trainer.client.routine.useQuery({ clientId, today }, { staleTime: 0 });
  const template = trpc.trainer.templates.get.useQuery({ templateId });
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (routine.isError) {
    return <ErrorState testID={`${testID}-error`} onRetry={() => void routine.refetch()} />;
  }
  if (!routine.isFetchedAfterMount || routine.data === undefined) {
    return <ActivityIndicator testID={`${testID}-loading`} />;
  }

  const day = routine.data?.days.find((d) => d.id === routineDayId);
  const rows = (day?.exercises ?? []).filter(isStrengthRow);
  const metaOf = (exerciseId: string) => routine.data?.exercises.find((e) => e.id === exerciseId);
  const defaultOf = (exerciseId: string) =>
    template.data?.exercises.find((e) => e.exerciseId === exerciseId)?.defaultLoadKg ?? null;
  const textOf = (row: StrengthRow) => texts[row.id] ?? initialText(row, unit);

  const changes = rows.flatMap((row) => {
    const parsed = parseStartingWeight(textOf(row), unit);
    if (typeof parsed !== 'number') return [];
    return Math.abs(parsed - row.next.suggestion.weightKg) > 0.01
      ? [{ row, weightKg: parsed }]
      : [];
  });
  const invalid = rows.some((row) => parseStartingWeight(textOf(row), unit) === 'invalid');

  const save = async () => {
    setSaving(true);
    try {
      for (const { row, weightKg } of changes) {
        await utils.client.trainer.client.setNextTarget.mutate({
          clientId,
          exerciseId: row.exerciseId,
          repBucket: row.next.repBucket,
          weightKg,
          reps: targetReps(row),
        });
      }
      if (changes.length > 0) void utils.trainer.client.routine.invalidate({ clientId });
      onDone();
    } catch (error) {
      Alert.alert('Could not save', userFacingErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View testID={testID} className="gap-4">
      <Text
        testID={`${testID}-client`}
        accessibilityRole="header"
        className="text-title3 font-bold text-label"
      >
        {clientName}
      </Text>
      {rows.length === 0 ? (
        <Text testID={`${testID}-nothing`} className="text-subhead text-label-secondary">
          {TEMPLATE_COPY.tune.noWeightedExercises}
        </Text>
      ) : (
        rows.map((row) => {
          const meta = metaOf(row.exerciseId);
          const name = meta?.name ?? row.exerciseId;
          const fmt = (kg: number) =>
            formatLoad(kg, unit, meta?.loadType ?? 'WEIGHTED', { each: meta?.perHand ?? false });
          const history = row.next.lastDoneDate
            ? TEMPLATE_COPY.tune.last(fmt(row.next.suggestion.weightKg))
            : TEMPLATE_COPY.tune.noHistory;
          const fallback = defaultOf(row.exerciseId);
          const label = `${name} (${unitLabel(unit)})`;
          const bad = parseStartingWeight(textOf(row), unit) === 'invalid';
          return (
            <FormField
              key={row.id}
              testID={`${testID}-row-${row.exerciseId}`}
              label={name}
              hint={[
                history,
                fallback !== null ? TEMPLATE_COPY.tune.templateDefault(fmt(fallback)) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              {...(bad && { error: 'Enter a weight.' })}
            >
              <Input
                testID={`${testID}-row-${row.exerciseId}-input`}
                label={label}
                value={textOf(row)}
                keyboardType="decimal-pad"
                {...DONE_FIELD_PROPS}
                placeholder={unitLabel(unit)}
                onChangeText={(text) => setTexts((prev) => ({ ...prev, [row.id]: text }))}
              />
            </FormField>
          );
        })
      )}
      <View className="flex-row gap-2">
        <Button
          testID={`${testID}-skip`}
          variant="outline"
          className="flex-1"
          disabled={saving}
          onPress={onDone}
        >
          {TEMPLATE_COPY.tune.skip}
        </Button>
        <Button
          testID={`${testID}-save`}
          className="flex-1"
          loading={saving}
          disabled={invalid}
          onPress={() => void save()}
        >
          {last ? TEMPLATE_COPY.tune.done : TEMPLATE_COPY.tune.next}
        </Button>
      </View>
    </View>
  );
}
