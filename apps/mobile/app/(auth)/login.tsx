import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, Pressable, View, type TextInput } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router, useFocusEffect } from 'expo-router';
import {
  Button,
  EMAIL_FIELD_PROPS,
  Input,
  PasswordInput,
  Text,
  useScrollFieldIntoView,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import {
  ACCOUNT_DELETED_NOTICE,
  clearAccountDeletedNotice,
  isAccountDeletedNoticeVisible,
  subscribeAccountDeletedNotice,
} from '../../src/features/auth/account-deleted-notice';
import { AuthField, AuthScreen } from '../../src/features/auth/auth-screen';
import { AUTH_COPY } from '../../src/features/auth/copy';
import { takeEmailHint } from '../../src/features/auth/email-hint';
import { loginSchema, type LoginFormValues } from '../../src/features/auth/schemas';
import {
  clearSessionExpired,
  isSessionExpired,
  SESSION_EXPIRED_NOTICE,
  subscribeSessionExpired,
} from '../../src/features/auth/session-expired';
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
  // UX-ACC-10: say why the user is here when a 401 ended their session.
  const sessionExpired = useSyncExternalStore(subscribeSessionExpired, isSessionExpired);
  // UX-ACC-11: one-time confirmation after the account was deleted.
  const accountDeleted = useSyncExternalStore(
    subscribeAccountDeletedNotice,
    isAccountDeletedNoticeVisible,
  );

  // UX-ACC-09: coming back to this screen (from "Go to sign in" after a reset,
  // or "Sign in" on an existing-account notice) must not show the previous
  // attempt's password — least of all in clear text.
  const [revealed, setRevealed] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = trpc.auth.login.useMutation({
    meta: { silent: true },
    // UX-ACC-08: a wrong password must not sit in the field for iOS to offer
    // "Save Password" with it.
    onError: () => {
      setValue('password', '');
      passwordRef.current?.focus();
    },
    onSuccess: async (data) => {
      if (data.session) {
        // Flips the root layout's auth gate straight into (food) (or Gym Today).
        await setToken(data.session.token);
        clearSessionExpired();
        clearAccountDeletedNotice();
      }
    },
  });

  // UX-ACC-09: on every focus, drop the old password and server error and
  // prefill the email the user was just typing on another auth screen.
  useFocusEffect(
    useCallback(() => {
      setValue('password', '');
      setRevealed(false);
      const hint = takeEmailHint();
      if (hint && !getValues('email')) setValue('email', hint);
      login.reset();
      // UX-ACC-11: the deletion notice is shown once — gone when this screen is left.
      return () => clearAccountDeletedNotice();
      // `login.reset` is a stable function; only a focus should re-run this.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setValue, getValues]),
  );

  // UX-ACC-18: a second "go" from the keyboard while a request is in flight
  // must not fire it again.
  const onSubmit = handleSubmit((values) => {
    if (login.isPending) return;
    Keyboard.dismiss();
    login.mutate(values);
  });
  // UX-ACC-07: the stale server error ("Invalid email or password") goes as
  // soon as the user edits either field.
  const clearServerError = () => {
    if (login.error) login.reset();
  };

  return (
    <>
      {accountDeleted && (
        <View
          testID="login-account-deleted"
          accessibilityRole="alert"
          className="rounded-md bg-green-50 px-3 py-2"
        >
          <Text className="text-sm text-green-800">{ACCOUNT_DELETED_NOTICE}</Text>
        </View>
      )}
      {sessionExpired && (
        <View
          testID="login-session-expired"
          accessibilityRole="alert"
          className="rounded-md bg-amber-50 px-3 py-2"
        >
          <Text className="text-sm text-amber-800">{SESSION_EXPIRED_NOTICE}</Text>
        </View>
      )}
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
              {...EMAIL_FIELD_PROPS}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              onFocus={() => scrollFieldIntoView(emailRef.current)}
              onBlur={onBlur}
              editable={!login.isPending}
              onChangeText={(text) => {
                clearServerError();
                onChange(text);
              }}
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
              revealed={revealed}
              onRevealedChange={setRevealed}
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
              onFocus={() => scrollFieldIntoView(passwordRef.current)}
              onBlur={onBlur}
              editable={!login.isPending}
              onChangeText={(text) => {
                clearServerError();
                onChange(text);
              }}
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
          {userFacingErrorMessage(login.error)}
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
