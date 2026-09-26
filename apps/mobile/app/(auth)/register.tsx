import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Linking, View, type TextInput } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Button, Input, PasswordInput, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { detectRegion } from '@chefer/utils';
import { AuthField, AuthScreen } from '../../src/features/auth/auth-screen';
import { registerSchema, type RegisterFormValues } from '../../src/features/auth/schemas';
import { getWebUrl } from '../../src/lib/api-url';
import { setToken } from '../../src/lib/auth-store';
import { trpc } from '../../src/lib/trpc';

// NOT "new-password" on the password fields: iOS's Automatic Strong Password
// overlay covers the field and swallows programmatic input (breaks E2E, and
// made real typing flaky in the simulator too). autoComplete "off" alone
// doesn't stop the heuristic on secure fields — textContentType "oneTimeCode"
// is the established opt-out.
const NO_STRONG_PASSWORD_OVERLAY = {
  autoComplete: 'off',
  textContentType: 'oneTimeCode',
} as const;

function withRegion(region: string | null): { region?: string } {
  return region ? { region } : {};
}

export default function RegisterScreen() {
  return (
    <AuthScreen testID="register-scroll">
      <RegisterForm />
    </AuthScreen>
  );
}

function RegisterForm() {
  const firstNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  // One toggle (on the password field) reveals both fields, as on web.
  const [revealed, setRevealed] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirmPassword: '', firstName: '' },
  });

  const register = trpc.auth.register.useMutation({
    onSuccess: async (data) => {
      if (data.session) {
        await setToken(data.session.token);
        // Dogfood feedback #9: guide new accounts through onboarding instead
        // of landing straight on the dashboard. Sign-in (login.tsx) does NOT
        // do this — only a fresh registration goes through the wizard.
        router.replace('/onboarding');
      }
    },
  });

  const onSubmit = handleSubmit((values) =>
    register.mutate({
      email: values.email,
      password: values.password,
      ...(values.firstName ? { firstName: values.firstName } : {}),
      // Location defaults (P2-6): the device region seeds units + currency.
      // Intl only — Hermes ships it, no native dependency.
      ...withRegion(detectRegion()),
    }),
  );

  return (
    <>
      <Text variant="title" testID="register-title">
        Create your account
      </Text>
      <Text variant="muted">Meal planning that fits your goals</Text>

      <AuthField label="First name (optional)">
        <Controller
          control={control}
          name="firstName"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={firstNameRef}
              testID="register-first-name"
              autoComplete="given-name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()}
              onFocus={() => scrollFieldIntoView(firstNameRef.current)}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value ?? ''}
            />
          )}
        />
      </AuthField>

      <AuthField label="Email" error={errors.email?.message}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={emailRef}
              testID="register-email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              onFocus={() => scrollFieldIntoView(emailRef.current)}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
      </AuthField>

      <AuthField label="Password" error={errors.password?.message}>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              ref={passwordRef}
              testID="register-password"
              revealed={revealed}
              onRevealedChange={setRevealed}
              {...NO_STRONG_PASSWORD_OVERLAY}
              returnKeyType="next"
              submitBehavior="submit"
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
        label="Confirm password"
        error={errors.confirmPassword?.message}
        errorTestID="register-confirm-password-error"
      >
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              ref={confirmRef}
              testID="register-confirm-password"
              revealed={revealed}
              hideToggle
              {...NO_STRONG_PASSWORD_OVERLAY}
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
              onFocus={() => scrollFieldIntoView(confirmRef.current)}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
      </AuthField>

      {register.error && (
        <Text variant="muted" className="text-destructive" testID="register-error">
          {register.error.message}
        </Text>
      )}

      <Button testID="register-submit" loading={register.isPending} onPress={() => void onSubmit()}>
        Create account
      </Button>

      {/* Consent + legal links, required by both app stores (F-M-PROF-1-1). */}
      <Text variant="muted" className="text-center text-xs">
        By creating an account you confirm you are 16 or older and agree to the{' '}
        <Text
          accessibilityRole="link"
          className="text-xs text-primary underline"
          onPress={() => void Linking.openURL(getWebUrl('/terms'))}
        >
          Terms
        </Text>
        . The{' '}
        <Text
          accessibilityRole="link"
          className="text-xs text-primary underline"
          onPress={() => void Linking.openURL(getWebUrl('/privacy'))}
        >
          Privacy Policy
        </Text>{' '}
        explains how we use your data.
      </Text>

      <View className="flex-row justify-center gap-1">
        <Text variant="muted">Already have an account?</Text>
        <Link href="/login" testID="register-to-login">
          <Text variant="muted" className="font-semibold text-primary">
            Sign in
          </Text>
        </Link>
      </View>
    </>
  );
}
