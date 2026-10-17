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
   * Opt-in dotted underline. FB7-05 (tester feedback 2026-10-07): names
   * render plain by default, like web; the link role + hint and the 44 pt
   * hit area are the affordance. Glossary terms keep their own dotted style.
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
  underline = false,
}: ExerciseNameLinkProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={`${name}, view exercise`}
      accessibilityHint="Opens the exercise details"
      // FB7-05: the name is one or two text lines tall (20-24 pt); the slop
      // pads the hit area to >= 44 pt without moving the layout.
      hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
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
