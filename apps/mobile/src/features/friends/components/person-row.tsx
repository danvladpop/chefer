import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { FRIENDS_COPY, type FriendUserSummary } from '@chefer/types';
import { Avatar, PressableScale, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// ─── PersonRow (UX §3.2, §13) ─────────────────────────────────────────────────
// Avatar + name (wraps to 2 lines) + an optional secondary line + a trailing
// slot (RelationButton, Accept/Decline, Unblock…). The avatar-and-name part
// is ONE accessible element — `{name}, {secondary}` with the hint
// `Opens profile` — pressing through to the profile (MO-01 card press). The
// trailing control is a SIBLING, so it stays its own focus target and its
// taps never open the profile. At ≥ 1.6× text the trailing control stacks
// under the name instead of squeezing it (UX §13).

export type PersonRowPerson = Pick<FriendUserSummary, 'id' | 'displayName' | 'imageUrl'>;

export type PersonRowProps = {
  person: PersonRowPerson;
  /** `Follows you`, `Followed by Maria Pop`, `Popular on Chefer`, a relative time… */
  secondary?: string | null;
  trailing?: ReactNode;
  /** Defaults to opening `/friends/{id}`. `false` renders a plain, non-pressable row (Blocked people). */
  onPress?: (() => void) | false;
  testID?: string;
};

/** Text scale at which the trailing control moves under the name (UX §13). */
export const PERSON_ROW_STACK_FONT_SCALE = 1.6;

/** The row's accessible name: `{name}, {secondary}` (UX §13). */
export function personRowLabel(name: string, secondary?: string | null): string {
  return secondary ? `${name}, ${secondary}` : name;
}

export function PersonRow({
  person,
  secondary,
  trailing,
  onPress,
  testID = `friends-person-${person.id}`,
}: PersonRowProps) {
  const { fontScale } = useWindowDimensions();
  const stacked = trailing != null && fontScale >= PERSON_ROW_STACK_FONT_SCALE;
  const label = personRowLabel(person.displayName, secondary);

  const identity = (
    <>
      <Avatar name={person.displayName} seed={person.id} imageUrl={person.imageUrl} size="md" />
      <View className="min-w-0 flex-1">
        <Text className="font-semibold text-gray-900" numberOfLines={2}>
          {person.displayName}
        </Text>
        {secondary ? (
          <Text variant="muted" numberOfLines={2}>
            {secondary}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      testID={testID}
      className={cn(
        'min-h-16 gap-3 px-4 py-2',
        stacked ? 'flex-col items-stretch' : 'flex-row items-center',
      )}
    >
      {onPress === false ? (
        <View
          testID={`${testID}-identity`}
          accessible
          accessibilityLabel={label}
          className="min-w-0 flex-1 flex-row items-center gap-3"
        >
          {identity}
        </View>
      ) : (
        <PressableScale
          testID={`${testID}-identity`}
          pressScale="card"
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={FRIENDS_COPY.announce.personRowHint}
          onPress={onPress ?? (() => router.push(`/friends/${person.id}`))}
          className="min-h-11 min-w-0 flex-1 flex-row items-center gap-3"
        >
          {identity}
        </PressableScale>
      )}
      {trailing != null ? (
        <View className={cn('shrink-0 flex-row items-center gap-2', stacked && 'pl-[52px]')}>
          {trailing}
        </View>
      ) : null}
    </View>
  );
}
