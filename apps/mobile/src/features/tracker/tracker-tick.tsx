import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@chefer/utils';

// The tick at the end of a tracker meal row (WP-04 C, UX-ACC "busy hands").
// Presentational only: the whole row is the Pressable and owns the toggle.
// The 28 pt circle is the visual; the 48 pt wrapper is the hit area (the
// 24 pt bare circle was a thumb-miss on a gym floor or a kitchen counter).

/** Minimum hit area of a tracker tick, in pt (matches `h-12 w-12`). */
export const TRACKER_TICK_HIT_PT = 48;

export function TrackerTick({ checked, testID }: { checked: boolean; testID?: string }) {
  return (
    <View
      {...(testID !== undefined && { testID })}
      className="h-12 w-12 items-center justify-center"
    >
      <View
        className={cn(
          'h-7 w-7 items-center justify-center rounded-full border-2',
          checked ? 'border-primary bg-primary' : 'border-gray-300',
        )}
      >
        {checked && <Ionicons name="checkmark" size={16} color="white" />}
      </View>
    </View>
  );
}
