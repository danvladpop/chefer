import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View, type TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, Input, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { AuthField, AuthScreen, backToLogin } from '../../src/features/auth/auth-screen';
import { setEmailHint, takeEmailHint } from '../../src/features/auth/email-hint';
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from '../../src/features/auth/schemas';
import { trpc } from '../../src/lib/trpc';

// F-M-AUTH-3-1 — port of web /forgot-password. The emailed link opens the web
// reset page (works in any phone browser); `reset-password.tsx` is the in-app
// counterpart for the `chefer://reset-password?token=…` deep link.

export default function ForgotPasswordScreen() {
  return (
    <AuthScreen testID="forgot-password-scroll">
      <ForgotPasswordForm />
    </AuthScreen>
  );
}

function ForgotPasswordForm() {
  const emailRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  const [sent, setSent] = useState(false);
  // UX-ACC-15: arrive with the address typed on Register / Sign in.
  const [initialEmail] = useState(takeEmailHint);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: initialEmail },
  });

  // Always reports success (no account probing) — only rate limits and
  // network failures surface as errors.
  const request = trpc.auth.requestPasswordReset.useMutation({
    meta: { silent: true },
    onSuccess: () => setSent(true),
  });

  const onSubmit = handleSubmit((values) => {
    // UX-ACC-18: no second submit from the keyboard while one is in flight.
    if (request.isPending) return;
    // UX-ACC-09: "Sign in" below returns with this address prefilled.
    setEmailHint(values.email);
    request.mutate(values);
  });

  return (
    <>
      <Text variant="title" testID="forgot-password-title">
        Forgot your password?
      </Text>
      <Text variant="muted">Enter your email and we&apos;ll send you a reset link</Text>

      {sent ? (
        <Card className="gap-2" testID="forgot-password-sent">
          <View className="items-center" accessibilityElementsHidden>
            <Ionicons name="mail-unread-outline" size={32} color="#944a00" />
          </View>
          <Text className="text-center">
            If an account exists for that address, a reset link is on its way. It expires in one
            hour — check your spam folder too.
          </Text>
        </Card>
      ) : (
        <>
          <AuthField label="Email address" error={errors.email?.message}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  ref={emailRef}
                  testID="forgot-password-email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  returnKeyType="send"
                  editable={!request.isPending}
                  onSubmitEditing={() => void onSubmit()}
                  onFocus={() => scrollFieldIntoView(emailRef.current)}
                  onBlur={onBlur}
                  onChangeText={(text) => {
                    if (request.error) request.reset();
                    onChange(text);
                  }}
                  value={value}
                />
              )}
            />
          </AuthField>

          {request.error && (
            <Text variant="muted" className="text-destructive" testID="forgot-password-error">
              {userFacingErrorMessage(request.error)}
            </Text>
          )}

          <Button
            testID="forgot-password-submit"
            loading={request.isPending}
            onPress={() => void onSubmit()}
          >
            {request.isPending ? 'Sending…' : 'Send reset link'}
          </Button>
        </>
      )}

      <View className="flex-row items-center justify-center gap-1">
        <Text variant="muted">Remembered it?</Text>
        <Button
          variant="ghost"
          size="sm"
          testID="forgot-password-to-login"
          accessibilityRole="link"
          onPress={backToLogin}
        >
          <Text variant="muted" className="font-semibold text-primary">
            Sign in
          </Text>
        </Button>
      </View>
    </>
  );
}
