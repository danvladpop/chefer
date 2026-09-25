import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Button, Input, Screen, Text } from '@chefer/ui-mobile';
import { registerSchema, type RegisterFormValues } from '../../src/features/auth/schemas';
import { setToken } from '../../src/lib/auth-store';
import { trpc } from '../../src/lib/trpc';

export default function RegisterScreen() {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', firstName: '' },
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
    }),
  );

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-center gap-4"
      >
        <Text variant="title" testID="register-title">
          Create your account
        </Text>
        <Text variant="muted">Meal planning that fits your goals</Text>

        <View className="gap-1">
          <Text variant="label">First name (optional)</Text>
          <Controller
            control={control}
            name="firstName"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                testID="register-first-name"
                autoComplete="given-name"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value ?? ''}
              />
            )}
          />
        </View>

        <View className="gap-1">
          <Text variant="label">Email</Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                testID="register-email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.email && (
            <Text variant="muted" className="text-destructive">
              {errors.email.message}
            </Text>
          )}
        </View>

        <View className="gap-1">
          <Text variant="label">Password</Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                testID="register-password"
                secureTextEntry
                // NOT "new-password": iOS's Automatic Strong Password overlay
                // covers the field and swallows programmatic input (breaks E2E,
                // and made real typing flaky in the simulator too). autoComplete
                // "off" alone doesn't stop the heuristic on secure fields —
                // textContentType "oneTimeCode" is the established opt-out.
                autoComplete="off"
                textContentType="oneTimeCode"
                returnKeyType="go"
                onSubmitEditing={() => void onSubmit()}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.password && (
            <Text variant="muted" className="text-destructive">
              {errors.password.message}
            </Text>
          )}
        </View>

        {register.error && (
          <Text variant="muted" className="text-destructive" testID="register-error">
            {register.error.message}
          </Text>
        )}

        <Button
          testID="register-submit"
          loading={register.isPending}
          onPress={() => void onSubmit()}
        >
          Create account
        </Button>

        <View className="flex-row justify-center gap-1">
          <Text variant="muted">Already have an account?</Text>
          <Link href="/login" testID="register-to-login">
            <Text variant="muted" className="font-semibold text-primary">
              Sign in
            </Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
