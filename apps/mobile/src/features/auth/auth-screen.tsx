import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { KeyboardAwareScrollView, Screen, Text } from '@chefer/ui-mobile';

// F-M-AUTH-2-1: on Android the keyboard covered "Sign in" / "Create account".
// Every auth screen scrolls inside a KeyboardAwareScrollView; the form itself
// must be a CHILD component of this one so its `useScrollFieldIntoView()`
// call sees the scroll view's context (outside it the hook is a no-op).

/** Full-bleed, keyboard-safe chrome shared by the signed-out screens. */
export function AuthScreen({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAwareScrollView
        testID={testID}
        contentContainerClassName="flex-grow justify-center gap-4 py-6"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

/** Label + field + inline validation error, the auth forms' one row shape. */
export function AuthField({
  label,
  error,
  errorTestID,
  children,
}: {
  label: string;
  error?: string;
  errorTestID?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      {children}
      {error ? (
        <Text variant="muted" className="text-destructive" testID={errorTestID}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Back to sign in from the reset screens: pops to the login screen already in
 * the stack, or replaces with it when the screen was opened by deep link.
 */
export function backToLogin() {
  router.dismissTo('/login');
}
