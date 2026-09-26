import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View, type TextInput } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Button, Input, PasswordInput, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { AuthField, AuthScreen } from '../../src/features/auth/auth-screen';
import { loginSchema, type LoginFormValues } from '../../src/features/auth/schemas';
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
        Welcome back
      </Text>
      <Text variant="muted">Sign in to your Chefer account</Text>

      <AuthField label="Email" error={errors.email?.message}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              ref={emailRef}
              testID="login-email"
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

      <View className="flex-row justify-center gap-1">
        <Text variant="muted">No account yet?</Text>
        <Link href="/register" testID="login-to-register">
          <Text variant="muted" className="font-semibold text-primary">
            Create one
          </Text>
        </Link>
      </View>
    </>
  );
}
