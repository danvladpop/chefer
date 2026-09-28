import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// UX-05 amendment A3 (T-05.A3.1, AC19-22): the swap sheet and Exercises tab
// collapse their filter chips into one strip while the keyboard covers the
// screen, so >= 5 results stay visible. `Will` events on iOS track the
// keyboard's animation instead of lagging a frame behind it; Android has no
// `Will` variant.
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return visible;
}
