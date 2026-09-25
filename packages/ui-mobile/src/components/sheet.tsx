import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '@chefer/utils';
import { Text } from './text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Small uppercase line above the title. */
  eyebrow?: string;
  children: React.ReactNode;
  /** Pinned under the scrolling body (primary actions). */
  footer?: React.ReactNode;
  /** Wrap the body in a ScrollView (default). Pass false for a FlatList body. */
  scrollable?: boolean;
  /** Max height as a fraction of the screen (default 0.85). */
  maxHeight?: `${number}%`;
  className?: string;
  /** The title gets `${testID}-title`, the close button `${testID}-close`. */
  testID?: string;
}

/**
 * Modal bottom sheet with the house header (grabber, title, 44pt close) —
 * the RN counterpart of @chefer/ui's Sheet. Android back and the backdrop
 * both close it; the body scrolls and the keyboard never covers inputs.
 */
export function Sheet({
  visible,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  scrollable = true,
  maxHeight = '85%',
  className,
  testID,
}: SheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      testID={testID}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <View
          className={cn('rounded-t-3xl bg-card', className)}
          style={{ maxHeight, paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="items-center pt-2">
            <View className="h-1 w-10 rounded-full bg-gray-300" />
          </View>
          <View className="flex-row items-center justify-between gap-3 px-4 pb-2 pt-3">
            <View className="min-w-0 flex-1">
              {eyebrow ? (
                <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {eyebrow}
                </Text>
              ) : null}
              <Text
                testID={testID ? `${testID}-title` : undefined}
                variant="heading"
                numberOfLines={2}
              >
                {title}
              </Text>
            </View>
            <Pressable
              testID={testID ? `${testID}-close` : undefined}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
            >
              <Text className="text-lg font-semibold text-gray-700">✕</Text>
            </Pressable>
          </View>
          {scrollable ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="gap-3 px-4 pb-4"
              className="shrink"
            >
              {children}
            </ScrollView>
          ) : (
            <View className="shrink px-4 pb-4">{children}</View>
          )}
          {footer ? <View className="border-t border-border px-4 pt-3">{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
