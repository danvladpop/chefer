import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  PanResponder,
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
import { ScrollFieldContext, useScrollFieldIntoViewFor } from './keyboard-aware-scroll-view';
import { KeyboardPersistFooter } from './keyboard-persist-footer';
import { sheetDragOffset, sheetReleaseAction, shouldStartSheetDrag } from './sheet-drag';
import { Text } from './text';
import { useKeyboardInset } from './use-keyboard-inset';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Small uppercase line above the title. */
  eyebrow?: string | undefined;
  children: React.ReactNode;
  /** Pinned under the scrolling body (primary actions). */
  footer?: React.ReactNode;
  /** Wrap the body in a ScrollView (default). Pass false for a FlatList body. */
  scrollable?: boolean;
  /** Max height as a fraction of the screen (default 0.85). */
  maxHeight?: `${number}%`;
  className?: string;
  /** The title gets `${testID}-title`, the close button `${testID}-close`. */
  testID?: string | undefined;
  /**
   * Called once the sheet is fully gone (exit played, Modal dismissed). Use
   * it to present something native next (camera, another Modal): iOS refuses
   * to present while a dismissal is still in flight.
   */
  onExited?: () => void;
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
X *
 * Keyboard (UX-X-02, one mechanism on both platforms): the Modal's wrapper
 * takes `useKeyboardInset()` as its bottom padding, which lifts the whole
 * panel (body and pinned footer) clear of the keyboard and shrinks its
 * `maxHeight` so the body scrolls. There is deliberately NO
 * `KeyboardAvoidingView` and NO `automaticallyAdjustKeyboardInsets`: on iOS
 * the two stacked and scrolled fields (and the Meal selector) out of view,
 * and under Android's mandatory edge-to-edge (Expo SDK 57) the window does
 * not resize for the keyboard at all, so the inset hook is the only thing
 * that works there. The hook already subtracts the bottom safe-area, which
 * the panel's own bottom padding gives back, so content ends flush above the
 * keyboard.
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
  onExited,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduced = useReducedMotion();

  // `mounted` keeps the Modal up while the exit animation runs.
  const [mounted, setMounted] = useState(visible);
  const { inset: keyboardInset } = useKeyboardInset({ enabled: mounted });
  const scrim = useSharedValue(0);
  const panel = useSharedValue(0);
  // Off-screen by default so nothing flashes before the first layout.
  const panelHeight = useSharedValue(windowHeight);
  // Finger displacement (pt) while dragging the grabber/header — MO-02.
  const drag = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollFieldIntoView = useScrollFieldIntoViewFor(scrollRef);

  const closing = useRef(false);
  const exitDone = useRef(false);
  const mountedRef = useRef(mounted);
  const visibleRef = useRef(visible);
  const onCloseRef = useRef(onClose);
  const onExitedRef = useRef(onExited);
  const reopenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mountedRef.current = mounted;
    visibleRef.current = visible;
    onCloseRef.current = onClose;
    onExitedRef.current = onExited;
  });

  // onExited: iOS reports the real dismissal through Modal.onDismiss; Android
  // has no such event and its Modal is gone once `mounted` flips false.
  const wasMounted = useRef(mounted);
  useEffect(() => {
    if (wasMounted.current && !mounted && Platform.OS !== 'ios') onExitedRef.current?.();
    wasMounted.current = mounted;
  }, [mounted]);
  const handleDismiss = useCallback(() => onExitedRef.current?.(), []);

  const animateIn = useCallback(() => {
    closing.current = false;
    exitDone.current = false;
    drag.set(0);
    if (reduced) {
      scrim.set(withTiming(1, timing(duration.fast)));
      panel.set(withTiming(1, timing(duration.fast)));
      return;
    }
    scrim.set(withTiming(1, timing(duration.base)));
    panel.set(withSpring(1, springs.gentle));
  }, [reduced, scrim, panel, drag]);

  /** Run the exit, then `then` on the JS thread (skipped if re-opened mid-exit). */
  const animateOut = useCallback(
    (then: () => void) => {
      closing.current = true;
      // UX-FOOD-16: no keyboard left up with nothing focused once the sheet is gone.
      Keyboard.dismiss();
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

  /** Release of the grabber/header drag (MO-02): exit from here, or spring back. */
  const releaseDrag = useCallback(
    (dy: number, vy: number) => {
      if (sheetReleaseAction(dy, vy, panelHeight.get()) === 'dismiss' && !closing.current) {
        const offset = sheetDragOffset(dy);
        if (!reduced) {
          // Fold the finger offset into `panel` so the exit continues from here.
          const height = panelHeight.get();
          panel.set(height > 0 ? Math.max(0, 1 - offset / height) : 0);
          drag.set(0);
        }
        requestClose();
        return;
      }
      drag.set(reduced ? withTiming(0, timing(duration.fast)) : withSpring(0, springs.gentle));
    },
    [reduced, panel, drag, panelHeight, requestClose],
  );

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          !closing.current && shouldStartSheetDrag(g.dx, g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => drag.set(sheetDragOffset(g.dy)),
        onPanResponderRelease: (_e, g) => releaseDrag(g.dy, g.vy),
        onPanResponderTerminate: () => releaseDrag(0, 0),
      }),
    [drag, releaseDrag],
  );

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }));
  const panelStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: panel.get(), transform: [{ translateY: drag.get() }] }
      : {
          opacity: 1,
          // Clamp the spring's ~1% overshoot so no gap opens under the panel.
          transform: [
            { translateY: Math.max(0, (1 - panel.get()) * panelHeight.get()) + drag.get() },
          ],
        },
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      onDismiss={Platform.OS === 'ios' ? handleDismiss : undefined}
      statusBarTranslucent
      testID={testID}
    >
      <View
        testID={testID ? `${testID}-keyboard-inset` : undefined}
        className="flex-1 justify-end"
        style={{ paddingBottom: keyboardInset }}
      >
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
            {/* MO-02: the grabber and header are the drag handle; the body scrolls. */}
            <View
              testID={testID ? `${testID}-drag-handle` : undefined}
              {...dragResponder.panHandlers}
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
            </View>
            {scrollable ? (
              <ScrollView
                ref={scrollRef}
                testID={testID ? `${testID}-scroll` : undefined}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="gap-3 px-4 pb-4"
                className="shrink"
              >
                <ScrollFieldContext.Provider value={scrollFieldIntoView}>
                  {children}
                </ScrollFieldContext.Provider>
              </ScrollView>
            ) : (
              <View className="shrink px-4 pb-4">{children}</View>
            )}
            {footer ? (
              // R-03: a footer outside a keyboardShouldPersistTaps ScrollView
              // loses its first tap while the keyboard is up.
              <KeyboardPersistFooter
                testID={testID ? `${testID}-footer` : undefined}
                contentContainerClassName="border-t border-border px-4 pt-3"
              >
                {footer}
              </KeyboardPersistFooter>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: SCRIM_COLOR },
  // flexShrink lets the panel fit the wrapper's maxHeight so the body scrolls.
  panel: { flexShrink: 1, boxShadow: elevation.e4Up },
});
