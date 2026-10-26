import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, View } from 'react-native';
import type { TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Button,
  Card,
  PasswordInput,
  Text,
  useScrollFieldIntoView,
  useThemeColors,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { AuthField, AuthScreen, backToLogin } from '../../src/features/auth/auth-screen';
import { isResetLinkInvalidError } from '../../src/features/auth/errors';
import { NEW_PASSWORD_FIELD_PROPS } from '../../src/features/auth/password-fields';
import { resetPasswordSchema, type ResetPasswordFormValues } from '../../src/features/auth/schemas';
import { useConfirmPasswordError } from '../../src/features/auth/use-confirm-password';
import { authValidationMessage } from '../../src/features/auth/validation-copy';
import { useT } from '../../src/lib/i18n';
import { trpc } from '../../src/lib/trpc';

// F-M-AUTH-3-1 — port of web /reset-password. Reached by deep link
// (`chefer://reset-password?token=…`, `chefer-dev://` in dev builds); the
// reset email itself links to the web page, which works in any phone browser.
// Like the web form there is no manual token entry: without a token the
// screen points back to requesting a new link.

type ResetStage = 'form' | 'done' | 'invalid-link';

export default function ResetPasswordScreen() {
  const { t } = useT();
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  // A repeated query param arrives as an array — take the first.
  const resetToken = (Array.isArray(token) ? token[0] : token)?.trim() ?? '';
  // UX-ACC-09: the heading follows the stage — the success card used to sit
  // under "Choose a new password", and a dead link under the same title.
  const [stage, setStage] = useState<ResetStage>('form');
  const linkProblem = !resetToken || stage === 'invalid-link';

  return (
    <AuthScreen testID="reset-password-scroll">
      <Text variant="title" testID="reset-password-title">
        {stage === 'done'
          ? t('auth.reset.titleDone')
          : linkProblem
            ? t('auth.reset.titleLinkProblem')
            : t('auth.reset.titleForm')}
      </Text>
      {stage === 'form' && !linkProblem && <Text variant="muted">{t('auth.reset.hint')}</Text>}
      {linkProblem ? (
        <Card className="gap-3" testID="reset-password-missing-token">
          <Text className="text-center">
            {resetToken ? t('auth.reset.invalidLink') : t('auth.reset.missingTokenApp')}
          </Text>
          <Button
            variant="outline"
            testID="reset-password-request-new"
            onPress={() => router.replace('/forgot-password')}
          >
            {t('auth.reset.requestNew')}
          </Button>
        </Card>
      ) : (
        <ResetPasswordForm token={resetToken} onStage={setStage} />
      )}
    </AuthScreen>
  );
}

function ResetPasswordForm({
  token,
  onStage,
}: {
  token: string;
  onStage: (stage: ResetStage) => void;
}) {
  const colors = useThemeColors();
  const { t } = useT();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    trigger,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  // Success also deletes every session for the account (all devices signed out).
  const reset = trpc.auth.resetPassword.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setDone(true);
      onStage('done');
    },
    // UX-ACC-09: an expired / used token is a dead end for this form — swap it
    // for the "request a new link" card instead of a line of plain text.
    onError: (error) => {
      if (isResetLinkInvalidError(error)) onStage('invalid-link');
    },
  });

  // UX-ACC-16: never show a stale "Passwords do not match".
  const confirmError = useConfirmPasswordError(watch, trigger, errors);

  const onSubmit = handleSubmit((values) => {
    // UX-ACC-18: no second submit from the keyboard while one is in flight.
    if (reset.isPending) return;
    Keyboard.dismiss();
    reset.mutate({ token, password: values.password });
  });

  if (done) {
    return (
      <Card className="gap-3" testID="reset-password-done">
        <View className="items-center" accessibilityElementsHidden>
          <Ionicons name="checkmark-circle-outline" size={32} color={colors.brand} />
        </View>
        <Text className="text-center">{t('auth.reset.done')}</Text>
        <Button testID="reset-password-to-login" onPress={backToLogin}>
          {t('auth.reset.goToSignIn')}
        </Button>
      </Card>
    );
  }

  return (
    <>
      <AuthField
        label={t('auth.fields.newPassword')}
        error={authValidationMessage(t, errors.password?.message)}
      >
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              ref={passwordRef}
              testID="reset-password-password"
              revealed={revealed}
              onRevealedChange={setRevealed}
              {...NEW_PASSWORD_FIELD_PROPS}
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
        label={t('auth.fields.confirmNewPassword')}
        error={authValidationMessage(t, confirmError)}
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
              {...NEW_PASSWORD_FIELD_PROPS}
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
          {userFacingErrorMessage(reset.error)}
        </Text>
      )}

      <Button
        testID="reset-password-submit"
        loading={reset.isPending}
        onPress={() => void onSubmit()}
      >
        {reset.isPending ? t('auth.reset.resetting') : t('auth.reset.submit')}
      </Button>
    </>
  );
}
