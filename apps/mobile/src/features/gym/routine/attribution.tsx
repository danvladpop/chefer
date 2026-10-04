import { View } from 'react-native';
import { COACHING_COPY, trainerNameOrFallback } from '@chefer/types';
import { Button, Text } from '@chefer/ui-mobile';
import type { EditStamp } from './types';

// Trainer coaching, shared display seams (WP-18 lane C, spec §2.6 / §5.3): the "Changed by Ana · 2 Oct"
// line, the trainer's note under an exercise, and the short date they share. The client's screens (Routine
// tab, workout logger, Today) and the trainer's editor render these, so both sides read the same words.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2 Oct" for an ISO date-time (device-local day) or a `YYYY-MM-DD` date. */
export function formatStampDate(iso: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) {
    return `${Number(dateOnly[3])} ${MONTHS[Number(dateOnly[2]) - 1] ?? ''}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

/** "Changed by Ana · 2 Oct" (a deleted trainer account reads "your trainer"). */
export function changedByText(stamp: EditStamp): string {
  return COACHING_COPY.stamps.changedBy(
    trainerNameOrFallback(stamp.name),
    formatStampDate(stamp.at),
  );
}

/** "Ana changed your routine · 2 Oct". */
export function routineChangedText(stamp: EditStamp): string {
  return COACHING_COPY.stamps.routineChanged(
    trainerNameOrFallback(stamp.name),
    formatStampDate(stamp.at),
  );
}

/** A muted one-liner under a row or a routine title. */
export function ChangedByLine({
  stamp,
  testID,
  routine = false,
}: {
  stamp: EditStamp;
  testID: string;
  /** The routine-level sentence ("Ana changed your routine") instead of the per-row one. */
  routine?: boolean;
}) {
  return (
    <Text testID={testID} variant="muted" className="min-w-0 text-xs">
      {routine ? routineChangedText(stamp) : changedByText(stamp)}
    </Text>
  );
}

/** "Ana: knees out, slow eccentric", with an optional "Remove note" (the client can clear a note, not rewrite it). */
export function TrainerNoteLine({
  trainer,
  note,
  testID,
  onRemove,
}: {
  trainer: string;
  note: string;
  testID: string;
  onRemove?: () => void;
}) {
  return (
    <View className="min-w-0 flex-row items-center gap-2">
      <Text testID={testID} className="min-w-0 flex-1 text-sm text-foreground">
        {COACHING_COPY.stamps.trainerNote(trainerNameOrFallback(trainer), note)}
      </Text>
      {onRemove ? (
        <Button
          testID={`${testID}-remove`}
          variant="ghost"
          size="sm"
          accessibilityLabel={`${COACHING_COPY.stamps.removeNote}: ${note}`}
          onPress={onRemove}
        >
          {COACHING_COPY.stamps.removeNote}
        </Button>
      ) : null}
    </View>
  );
}
