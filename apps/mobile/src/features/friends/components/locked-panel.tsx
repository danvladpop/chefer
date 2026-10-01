import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';

// ─── LockedPanel (UX §3.2, §8.2) ──────────────────────────────────────────────
// Icon, title, body — what a non-follower sees under a profile header
// (`lock-closed-outline` for private, `people-outline` for public), and what
// a tab shows for a section that isn't shared. Copy comes from
// FRIENDS_COPY.locked / .notShared at the call site.

export type LockedPanelProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  body: string;
  testID?: string;
};

export function LockedPanel({
  icon = 'lock-closed-outline',
  title,
  body,
  testID = 'friends-locked-panel',
}: LockedPanelProps) {
  return (
    <View testID={testID} accessible className="items-center gap-2 px-6 py-10">
      <Ionicons name={icon} size={36} color="#8a7560" />
      {title ? (
        <Text variant="heading" className="text-center">
          {title}
        </Text>
      ) : null}
      <Text variant="muted" className="text-center">
        {body}
      </Text>
    </View>
  );
}
