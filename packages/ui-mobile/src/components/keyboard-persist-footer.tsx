import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

export interface KeyboardPersistFooterProps {
  children: ReactNode;
  testID?: string | undefined;
  /** Style of the (non-scrolling) content container, e.g. padding/border. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** NativeWind classes for the content container. */
  contentContainerClassName?: string;
}

/**
 * Pinned footer (primary actions) that survives an open keyboard.
 *
 * On iOS the first tap on a button OUTSIDE a `keyboardShouldPersistTaps`
 * ScrollView, while the keyboard is up, only dismisses the keyboard: the
 * layout then moves under the finger and the press is lost (App Review R-03:
 * "Delete my account" ignored its first tap). Wrapping the footer in a
 * non-scrolling ScrollView with `keyboardShouldPersistTaps="handled"` is the
 * standard RN pattern — a child that handles the tap gets it immediately and
 * the keyboard stays until the action has run. JS-only, so it ships OTA.
 *
 * `flexGrow/flexShrink: 0` keep it content-sized (a bare ScrollView would
 * otherwise grow to fill, or collapse in, its parent).
 */
export function KeyboardPersistFooter({
  children,
  testID,
  contentContainerStyle,
  contentContainerClassName,
}: KeyboardPersistFooterProps) {
  return (
    <ScrollView
      {...(testID ? { testID } : {})}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={false}
      bounces={false}
      showsVerticalScrollIndicator={false}
      style={styles.footer}
      {...(contentContainerStyle ? { contentContainerStyle } : {})}
      {...(contentContainerClassName ? { contentContainerClassName } : {})}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  footer: { flexGrow: 0, flexShrink: 0 },
});
