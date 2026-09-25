import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Button, Input, Screen, Text } from '@chefer/ui-mobile';
import { loginSchema, type LoginFormValues } from '../../src/features/auth/schemas';
import { setToken } from '../../src/lib/auth-store';
import { trpc } from '../../src/lib/trpc';

export default function LoginScreen() {
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
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-center gap-4"
      >
        <Text variant="title" testID="login-title">
          Welcome back
        </Text>
        <Text variant="muted">Sign in to your Chefer account</Text>

        <View className="gap-1">
          <Text variant="label">Email</Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                testID="login-email"
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
                testID="login-password"
                secureTextEntry
                autoComplete="current-password"
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
      </KeyboardAvoidingView>
    </Screen>
  );
}
