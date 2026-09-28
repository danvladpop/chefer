import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet, Text } from '@chefer/ui-mobile';

export interface RowMenuAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}

export interface RowMenuProps {
  /** Read by the "⋯" button, e.g. "Options for ingredient 2". */
  accessibilityLabel: string;
  actions: RowMenuAction[];
  testID: string;
}

/**
 * PAT-16 row menu path: a `⋯` (44×44pt hit area) opening a small `Sheet`
 * whose rows are the row's actions (`Remove {thing}`, and for steps `Move
 * up` / `Move down`). Swipe-to-remove joins in slice 2 once L-GYM's
 * `swipe-to-remove.tsx` is available; the menu alone satisfies every AC.
 */
export function RowMenu({ accessibilityLabel, actions, testID }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => setOpen(true)}
        className="h-11 w-11 items-center justify-center"
      >
        <Ionicons name="ellipsis-horizontal" size={20} color="#6b7280" />
      </Pressable>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={accessibilityLabel}
        testID={`${testID}-sheet`}
      >
        <View className="gap-1">
          {actions.map((action) => (
            <Pressable
              key={action.label}
              testID={action.testID}
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                action.onPress();
              }}
              className="min-h-11 justify-center rounded-md px-2 py-2"
            >
              <Text className={action.destructive ? 'text-base text-destructive' : 'text-base'}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}
