import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View, type TextInput } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Button, Input, PasswordInput, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { AuthField, AuthScreen } from '../../src/features/auth/auth-screen';
import { AUTH_COPY } from '../../src/features/auth/copy';
import { loginSchema, type LoginFormValues } from '../../src/features/auth/schemas';
import { useSession } from '../../src/features/auth/use-session';
import { setToken } from '../../src/lib/auth-store';
import { trpc } from '../../src/lib/trpc';

export default function LoginScreen() {
  return (
    <AuthScreen testID="login-scroll">
      <LoginForm />
    </AuthScreen>
  );
}

function LoginForm() {
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  // UX-25 (T-25.1, AC2): "Welcome back" only once this device has actually
  // signed in before — reached here by deep link, back navigation from
  // Welcome, or any other path that skips the (auth)/index.tsx gate.
  const { hasSignedInBefore } = useSession();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (data.session) {
        // Flips the root layout's auth gate straight into (food) (or Gym Today).
        await setToken(data.session.token);
      }
    },
  });

  const onSubmit = handleSubmit((values) => login.mutate(values));

  return (
    <>
      <Text variant="title" testID="login-title">
        {hasSignedInBefore ? AUTH_COPY.loginTitleReturning : AUTH_COPY.loginTitleFirstTime}
      </Text>
      <Text variant="muted">
        {hasSignedInBefore ? AUTH_COPY.loginSubtitleReturning : AUTH_COPY.loginSubtitleFirstTime}
      </Text>

      <AuthField label="Email" error={errors.email?.message}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={emailRef}
              testID="login-email"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
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
              testID="login-password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
              onFocus={() => scrollFieldIntoView(passwordRef.current)}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
      </AuthField>

      {/* F-M-AUTH-3-1: the reset flow, same entry point as the web form. */}
      <Pressable
        testID="login-forgot-password"
        accessibilityRole="link"
        onPress={() => router.push('/forgot-password')}
        className="min-h-11 justify-center self-end"
      >
        <Text variant="muted" className="font-semibold text-primary">
          Forgot password?
        </Text>
      </Pressable>

      {login.error && (
        <Text variant="muted" className="text-destructive" testID="login-error">
          {login.error.message}
        </Text>
      )}

      <Button testID="login-submit" loading={login.isPending} onPress={() => void onSubmit()}>
        Sign in
      </Button>

      {hasSignedInBefore ? (
        <View className="flex-row justify-center gap-1">
          <Text variant="muted">No account yet?</Text>
          <Link href="/register" testID="login-to-register">
            <Text variant="muted" className="font-semibold text-primary">
              Create one
            </Text>
          </Link>
        </View>
      ) : (
        // UX-25 (T-25.1): a first-timer who reached Sign in without going
        // through Welcome gets the same full-width CTA Welcome would have
        // shown, not a small link easy to miss.
        <Button
          testID="login-to-register"
          variant="outline"
          onPress={() => router.push('/register')}
        >
          {AUTH_COPY.loginCreateAccountCta}
        </Button>
      )}
    </>
  );
}
