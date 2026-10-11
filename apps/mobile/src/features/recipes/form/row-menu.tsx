import { useState } from 'react';
import { View } from 'react-native';
import { IconButton, PressableScale, Sheet, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';

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
  const colors = useThemeColors();
  return (
    <>
      <IconButton
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        icon={<Icon name="more" size={20} color={colors.labelSecondary} />}
        onPress={() => setOpen(true)}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={accessibilityLabel}
        testID={`${testID}-sheet`}
      >
        <View className="gap-1">
          {actions.map((action) => (
            <PressableScale
              key={action.label}
              testID={action.testID}
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                action.onPress();
              }}
              className="min-h-11 justify-center rounded-control px-2 py-2"
            >
              <Text
                className={action.destructive ? 'text-body text-danger' : 'text-body text-label'}
              >
                {action.label}
              </Text>
            </PressableScale>
          ))}
        </View>
      </Sheet>
    </>
  );
}
