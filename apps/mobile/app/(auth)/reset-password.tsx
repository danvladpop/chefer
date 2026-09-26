import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import type { TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, PasswordInput, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { AuthField, AuthScreen, backToLogin } from '../../src/features/auth/auth-screen';
import { resetPasswordSchema, type ResetPasswordFormValues } from '../../src/features/auth/schemas';
import { trpc } from '../../src/lib/trpc';

// F-M-AUTH-3-1 — port of web /reset-password. Reached by deep link
// (`chefer://reset-password?token=…`, `chefer-dev://` in dev builds); the
// reset email itself links to the web page, which works in any phone browser.
// Like the web form there is no manual token entry: without a token the
// screen points back to requesting a new link.

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  // A repeated query param arrives as an array — take the first.
  const resetToken = (Array.isArray(token) ? token[0] : token)?.trim() ?? '';

  return (
    <AuthScreen testID="reset-password-scroll">
      <Text variant="title" testID="reset-password-title">
        Choose a new password
      </Text>
      <Text variant="muted">This link works once and expires an hour after it was requested</Text>
      {resetToken ? (
        <ResetPasswordForm token={resetToken} />
      ) : (
        <Card className="gap-3" testID="reset-password-missing-token">
          <Text className="text-center">This screen needs the link from your reset email.</Text>
          <Button
            variant="outline"
            testID="reset-password-request-new"
            onPress={() => router.replace('/forgot-password')}
          >
            Request a new reset link
          </Button>
        </Card>
      )}
    </AuthScreen>
  );
}

function ResetPasswordForm({ token }: { token: string }) {
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  // Success also deletes every session for the account (all devices signed out).
  const reset = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setDone(true),
  });

  const onSubmit = handleSubmit((values) => reset.mutate({ token, password: values.password }));

  if (done) {
    return (
      <Card className="gap-3" testID="reset-password-done">
        <View className="items-center" accessibilityElementsHidden>
          <Ionicons name="checkmark-circle-outline" size={32} color="#944a00" />
        </View>
        <Text className="text-center">
          Your password has been changed and all devices signed out. Sign in with your new password.
        </Text>
        <Button testID="reset-password-to-login" onPress={backToLogin}>
          Go to sign in
        </Button>
      </Card>
    );
  }

  return (
    <>
      <AuthField label="New password" error={errors.password?.message}>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              ref={passwordRef}
              testID="reset-password-password"
              revealed={revealed}
              onRevealedChange={setRevealed}
              // Same Automatic Strong Password opt-out as register.tsx.
              autoComplete="off"
              textContentType="oneTimeCode"
              returnKeyType="next"
              submitBehavior="submit"
              editable={!reset.isPending}
              onSubmitEditing={() => confirmRef.current?.focus()}
              onFocus={() => scrollFieldIntoView(passwordRef.current)}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
      </AuthField>

      <AuthField
        label="Confirm new password"
        error={errors.confirmPassword?.message}
        errorTestID="reset-password-confirm-error"
      >
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              ref={confirmRef}
              testID="reset-password-confirm"
              revealed={revealed}
              hideToggle
              autoComplete="off"
              textContentType="oneTimeCode"
              returnKeyType="go"
              editable={!reset.isPending}
              onSubmitEditing={() => void onSubmit()}
              onFocus={() => scrollFieldIntoView(confirmRef.current)}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
      </AuthField>

      {reset.error && (
        <Text variant="muted" className="text-destructive" testID="reset-password-error">
          {reset.error.message}
        </Text>
      )}

      <Button
        testID="reset-password-submit"
        loading={reset.isPending}
        onPress={() => void onSubmit()}
      >
        {reset.isPending ? 'Resetting…' : 'Reset password'}
      </Button>
    </>
  );
}
