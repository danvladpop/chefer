import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type HostInstance,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
  type TextInput,
} from 'react-native';
import { cn } from '@chefer/utils';

// Gym dogfood #2 ("the number keyboard covers the bottom of the screen while
// you type — you can't see the field you're typing in or what comes next").
// Core-RN only, on purpose: `react-native-keyboard-controller` needs a native
// rebuild, which would break OTA delivery to phones already in the field
// (CLAUDE.md Platform Parity: "never break shipped mobile clients").
//
// `behavior="padding"` on BOTH iOS and Android — most RN examples split this
// (`padding` on iOS, `undefined` on Android) and lean on the OS resizing the
// window instead (Expo's `android.softwareKeyboardLayoutMode` default,
// "resize", maps to `windowSoftInputMode="adjustResize"`). This app's
// `app.config.js` doesn't override that default, but Expo SDK 57 makes
// edge-to-edge mandatory on Android and there is no config flag left to turn
// it off — and under edge-to-edge the window no longer resizes for the
// keyboard, so `adjustResize` silently stops doing anything and nothing else
// would push the focused field into view. `padding` on Android too restores
// the same behavior `KeyboardAvoidingView` already gives iOS, without a
// native module.

/** Extra breathing room kept above the keyboard, beyond what it already displaces. */
export const KEYBOARD_AWARE_DEFAULT_MARGIN = 24;

export type MeasurableField = Pick<TextInput, 'measureLayout'>;

/** Scrolls `field` clear of the keyboard, with `extraMargin` of headroom above it. */
export type ScrollFieldIntoView = (field: MeasurableField | null, extraMargin?: number) => void;

const noopScrollFieldIntoView: ScrollFieldIntoView = () => undefined;

const ScrollFieldContext = createContext<ScrollFieldIntoView>(noopScrollFieldIntoView);

/**
 * Call from a field's `onFocus`, passing the field's own ref, to keep it
 * clear of the keyboard once it's focused:
 *
 * ```tsx
 * const ref = useRef<TextInput>(null);
 * const scrollFieldIntoView = useScrollFieldIntoView();
 * <Input ref={ref} onFocus={() => scrollFieldIntoView(ref.current)} />
 * ```
 *
 * (`useFieldChain`'s `bind` takes the same `onFocus` option, for fields
 * already chained together — see its own docs.)
 *
 * iOS gets this for free from `automaticallyAdjustKeyboardInsets` (set
 * automatically below); this is what covers Android, which has no
 * equivalent. Outside a `KeyboardAwareScrollView` it's a harmless no-op, so
 * it's safe to call unconditionally.
 */
export function useScrollFieldIntoView(): ScrollFieldIntoView {
  return useContext(ScrollFieldContext);
}

export interface KeyboardAwareScrollViewProps extends Omit<ScrollViewProps, 'children'> {
  children: ReactNode;
  /**
   * Rendered below the scrolling body, still inside the same
   * `KeyboardAvoidingView` — a sticky footer (a "Save" / "Next" / "Finish"
   * bar) that must rise together with the keyboard rather than staying
   * pinned behind it. Leave unset when the primary action is simply the
   * last item inside the scrollable content — it already scrolls into view.
   */
  footer?: ReactNode;
  /** Extra bottom padding added to the scroll content while the keyboard is open (default 24). */
  extraKeyboardPadding?: number;
  /** `KeyboardAvoidingView`'s offset — set this if the view sits under a translucent/overlaid header. */
  keyboardVerticalOffset?: number;
  behavior?: KeyboardAvoidingViewProps['behavior'];
}

/**
 * A `ScrollView` wrapped for gym's forms: the field being typed into, and
 * the primary button below it, stay clear of the on-screen keyboard instead
 * of hiding behind it. A drop-in replacement for a plain `ScrollView` inside
 * a screen (or `Screen`) body.
 */
export function KeyboardAwareScrollView({
  children,
  footer,
  extraKeyboardPadding = KEYBOARD_AWARE_DEFAULT_MARGIN,
  keyboardVerticalOffset = 0,
  behavior = 'padding',
  contentContainerStyle,
  className,
  ...scrollViewProps
}: KeyboardAwareScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    // `keyboardWillShow`/`keyboardWillHide` don't exist on Android (no native
    // event backs them there) — read `Platform.OS` here, at listen-time,
    // rather than once at module load.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollFieldIntoView = useCallback<ScrollFieldIntoView>((field, extraMargin) => {
    const scrollView = scrollRef.current;
    if (!field || !scrollView || typeof field.measureLayout !== 'function') return;
    // Pass the ScrollView's own ref as the measurement ancestor (the
    // documented `measureLayout` pattern) rather than converting it to a
    // node handle first — `findNodeHandle` on a composite ref like this
    // reliably comes back `null` under the RNTL/Fabric-mock test renderer.
    field.measureLayout(
      scrollView as unknown as HostInstance,
      (_x: number, y: number) => {
        scrollView.scrollTo({
          y: Math.max(0, y - (extraMargin ?? KEYBOARD_AWARE_DEFAULT_MARGIN)),
          animated: true,
        });
      },
      () => undefined,
    );
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={behavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
      className={cn('flex-1', className)}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        {...scrollViewProps}
        contentContainerStyle={[
          contentContainerStyle,
          // Headroom for the LAST field / primary button to scroll clear of
          // the keyboard — KeyboardAvoidingView already shrinks this
          // ScrollView's own box by the keyboard's height, but content
          // sitting right at its new bottom edge would otherwise sit flush
          // against the keyboard with no breathing room.
          keyboardOpen ? { paddingBottom: extraKeyboardPadding } : null,
        ]}
      >
        <ScrollFieldContext.Provider value={scrollFieldIntoView}>
          {children}
        </ScrollFieldContext.Provider>
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}
