import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// T-05.5: an exercise name is a real link everywhere it appears in running
// copy — setup preview, Gym Today's "Next up", the post-workout summary —
// so a user who doesn't recognise a name can open its cues/photo/video
// without leaving the flow. Owns its own tap target, so it's safe next to
// (but never nested inside) another Pressable on the same row.

export interface ExerciseNameLinkProps {
  exerciseId: string;
  name: string;
  /** Layout classes (flex/width/etc) — goes on the tap target, a View. */
  className?: string;
  /** Typography classes (size/weight/etc) — goes on the Text itself. */
  textClassName?: string;
  numberOfLines?: number;
  testID?: string;
  /**
   * The dotted underline marks a name inside running copy. Off where the
   * name is a row title (Edit Routine, owner dogfood 2026-09-30) — it still
   * opens the exercise.
   */
  underline?: boolean;
}

export function ExerciseNameLink({
  exerciseId,
  name,
  className,
  textClassName,
  numberOfLines,
  testID,
  underline = true,
}: ExerciseNameLinkProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={`${name}, view exercise`}
      hitSlop={4}
      onPress={() => router.push(`/gym/exercise/${exerciseId}`)}
      className={cn('min-w-0', className)}
    >
      <Text
        numberOfLines={numberOfLines}
        className={cn(underline && 'underline decoration-dotted', textClassName)}
      >
        {name}
      </Text>
    </Pressable>
  );
}
