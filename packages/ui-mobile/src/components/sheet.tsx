import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { elevation } from '@chefer/tokens';
import { cn } from '@chefer/utils';
import { duration, springs, timing } from '../motion/motion';
import { useReducedMotion } from '../motion/use-reduced-motion';
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

const SCRIM_COLOR = 'rgba(0,0,0,0.4)';
/** A parent that keeps `visible` after onClose gets the sheet back after this. */
const REOPEN_CHECK_MS = 120;

/**
 * Modal bottom sheet with the house header (grabber, title, 44pt close) —
 * the RN counterpart of @chefer/ui's Sheet. Android back, the backdrop and ✕
 * all close it; the body scrolls and the keyboard never covers inputs.
 *
 * Motion (MO-02): the Modal itself does not animate. The scrim fades in over
 * `base` and the panel slides up on spring `gentle`; closing slides the panel
 * down over `base` with the `exit` curve while the scrim fades over `fast`,
 * and only THEN calls `onClose` — so the scrim no longer slides up and down
 * with the panel. A parent that sets `visible` false itself gets the same
 * exit before the Modal unmounts. Reduced motion: a 150 ms crossfade, no
 * movement. Drag-to-dismiss waits for react-native-gesture-handler (native
 * dependency, next store build).
 *
 * `behavior="padding"` on both platforms (gym dogfood #2): Expo SDK 57 makes
 * edge-to-edge mandatory on Android, and under edge-to-edge the
 * `windowSoftInputMode="adjustResize"` this app otherwise relies on (Expo's
 * `android.softwareKeyboardLayoutMode` default) no longer resizes the window
 * for the keyboard — `undefined` here would leave Android with nothing
 * pushing the sheet's fields above it. See `KeyboardAwareScrollView` for the
 * full explanation; it applies here too since a `Modal`'s content sits
 * outside the normal Android resize path either way.
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
  const { height: windowHeight } = useWindowDimensions();
  const reduced = useReducedMotion();

  // `mounted` keeps the Modal up while the exit animation runs.
  const [mounted, setMounted] = useState(visible);
  const scrim = useSharedValue(0);
  const panel = useSharedValue(0);
  // Off-screen by default so nothing flashes before the first layout.
  const panelHeight = useSharedValue(windowHeight);

  const closing = useRef(false);
  const exitDone = useRef(false);
  const mountedRef = useRef(mounted);
  const visibleRef = useRef(visible);
  const onCloseRef = useRef(onClose);
  const reopenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mountedRef.current = mounted;
    visibleRef.current = visible;
    onCloseRef.current = onClose;
  });

  const animateIn = useCallback(() => {
    closing.current = false;
    exitDone.current = false;
    if (reduced) {
      scrim.set(withTiming(1, timing(duration.fast)));
      panel.set(withTiming(1, timing(duration.fast)));
      return;
    }
    scrim.set(withTiming(1, timing(duration.base)));
    panel.set(withSpring(1, springs.gentle));
  }, [reduced, scrim, panel]);

  /** Run the exit, then `then` on the JS thread (skipped if re-opened mid-exit). */
  const animateOut = useCallback(
    (then: () => void) => {
      closing.current = true;
      const finish = () => {
        if (!closing.current) return;
        exitDone.current = true;
        then();
      };
      scrim.set(withTiming(0, timing(duration.fast)));
      panel.set(
        withTiming(
          0,
          reduced ? timing(duration.fast) : timing(duration.base, 'exit'),
          (finished) => {
            'worklet';
            if (finished) scheduleOnRN(finish);
          },
        ),
      );
    },
    [reduced, scrim, panel],
  );

  useEffect(() => {
    if (visible) {
      setMounted(true);
      animateIn();
    } else if (mountedRef.current) {
      if (closing.current && exitDone.current) {
        // Our own close already played the exit — just unmount.
        setMounted(false);
      } else {
        animateOut(() => setMounted(false));
      }
    }
    // animateIn/animateOut change only with `reduced`; re-running on that is harmless.
  }, [visible, animateIn, animateOut]);

  useEffect(
    () => () => {
      if (reopenTimer.current) clearTimeout(reopenTimer.current);
    },
    [],
  );

  /** Backdrop, ✕ and Android back: exit first, then tell the parent. */
  const requestClose = useCallback(() => {
    if (closing.current) return;
    animateOut(() => {
      onCloseRef.current();
      // Every caller hides the sheet in onClose; if one ever doesn't (e.g. a
      // busy guard), bring the sheet back instead of leaving an invisible Modal.
      if (reopenTimer.current) clearTimeout(reopenTimer.current);
      reopenTimer.current = setTimeout(() => {
        if (visibleRef.current && closing.current) animateIn();
      }, REOPEN_CHECK_MS);
    });
  }, [animateIn, animateOut]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }));
  const panelStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: panel.get(), transform: [{ translateY: 0 }] }
      : {
          opacity: 1,
          // Clamp the spring's ~1% overshoot so no gap opens under the panel.
          transform: [{ translateY: Math.max(0, (1 - panel.get()) * panelHeight.get()) }],
        },
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
      testID={testID}
    >
      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-end">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
            onPress={requestClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          style={[{ maxHeight }, panelStyle]}
          onLayout={(e) => panelHeight.set(e.nativeEvent.layout.height)}
        >
          <View
            className={cn('rounded-t-3xl bg-card', className)}
            style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <View className="items-center pt-2">
              <View className="h-1 w-10 rounded-full bg-gray-300" />
            </View>
            <View className="flex-row items-center justify-between gap-3 px-4 pb-2 pt-3">
              <View className="min-w-0 flex-1">
                {eyebrow ? (
                  <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                onPress={requestClose}
                className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
              >
                <Text className="text-lg font-semibold text-gray-700">✕</Text>
              </Pressable>
            </View>
            {scrollable ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
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
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: SCRIM_COLOR },
  // flexShrink lets the panel fit the wrapper's maxHeight so the body scrolls.
  panel: { flexShrink: 1, boxShadow: elevation.e4Up },
});
