import { useRef, useState } from 'react';
import { Keyboard, Pressable, View, type TextInput } from 'react-native';
import { router } from 'expo-router';
import {
  ACCOUNT_DELETION_COPY as COPY,
  SOCIAL_PROVIDER_LABELS,
  type LinkedIdentity,
  type SocialProvider,
} from '@chefer/types';
import { Button, Input, PasswordInput, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import {
  DATA_EXPORT_COPY as EXPORT_COPY,
  exportErrorMessage,
  exportSizeBucket,
  userFacingErrorMessage,
} from '@chefer/utils';
import { track } from '../../lib/analytics';
import { canShareBinaryFiles, shareExportFile, ZIP_MIME } from '../../lib/share-file';
import { signOut } from '../../lib/sign-out';
import { trpc } from '../../lib/trpc';
import { markAccountDeleted } from '../auth/account-deleted-notice';
import { socialErrorMessage } from '../auth/social/social-errors';
import { useSocialProviders } from '../auth/social/social-providers';
import { requestProviderCredential } from '../auth/social/use-social-sign-in';
import { useSignOut } from '../settings/use-sign-out';
import { TrainButton } from '../shell/train/train-button';

// Mirrors apps/web/src/features/profile/components/AccountDataCard.tsx.
// In-app export and account deletion (audit P0-6): both app stores require
// deletion inside the app for apps that create accounts (F-M-PROF-1-1).
// T-39.5 (bug B-53): a real, named export file instead of an unnamed text
// blob in the share sheet. G1 (market review 2026-10): it is now the ZIP
// (`user.exportArchive`: the full JSON + spreadsheet CSVs + a README), shared
// as `chefer-export-YYYY-MM-DD.zip`. An Android binary without expo-sharing
// can't share a binary file, so it keeps the JSON export (`user.exportData`).
// 11 Oct restyle: the shell's card, named text styles and colour roles (the
// delete sheet keeps the kit's Sheet buttons).

function jsonFilename(): string {
  return `chefer-export-${new Date().toISOString().slice(0, 10)}.json`;
}

export function AccountDataCard() {
  const utils = trpc.useUtils();
  const { show } = useSnackbar();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // FB7-02: same confirm sheet + unsynced-workout guard as More / Settings.
  const signOutAction = useSignOut('profile-sign-out-confirm');
  const exportArchive = trpc.user.exportArchive.useMutation({ meta: { silent: true } });

  async function exportData() {
    setExporting(true);
    setExportError(null);
    try {
      let shared: boolean;
      if (canShareBinaryFiles()) {
        const archive = await exportArchive.mutateAsync();
        shared = await shareExportFile(archive.filename, archive.base64, ZIP_MIME, 'base64');
        if (shared) {
          track('data_export_downloaded', {
            format: 'zip',
            sizeBucket: exportSizeBucket(archive.bytes),
          });
        }
      } else {
        const json = JSON.stringify(await utils.user.exportData.fetch(), null, 2);
        shared = await shareExportFile(jsonFilename(), json);
        if (shared) {
          track('data_export_downloaded', {
            format: 'json',
            sizeBucket: exportSizeBucket(json.length),
          });
        }
      }
      // UX-ACC-22: only when the share sheet was actually used — a cancel is silence.
      if (shared) show({ message: EXPORT_COPY.ready, tone: 'success' });
    } catch (err) {
      setExportError(exportErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <View
      testID="profile-your-data"
      className="min-w-0 gap-3 rounded-card border border-separator bg-surface p-4"
    >
      <View className="gap-0.5">
        <Text
          accessibilityRole="header"
          className="w-full min-w-0 text-headline font-semibold text-label"
        >
          Your data
        </Text>
        {/* UX-ACC-27: full-width + min-w-0 so iOS wraps instead of clipping mid-word. */}
        <Text
          testID="profile-your-data-copy"
          className="w-full min-w-0 text-subhead text-label-secondary"
        >
          {EXPORT_COPY.intro}
        </Text>
      </View>
      <View className="gap-2">
        <TrainButton
          testID="profile-download-data"
          label={EXPORT_COPY.button}
          variant="outline"
          icon="share"
          loading={exporting}
          onPress={() => void exportData()}
        />
        <TrainButton
          testID="profile-sign-out"
          label="Sign out"
          variant="outline"
          icon="signOut"
          loading={signOutAction.isPending}
          onPress={signOutAction.request}
        />
        <TrainButton
          testID="profile-delete-account"
          label={COPY.button}
          variant="danger"
          icon="trash"
          className="border border-separator bg-surface"
          onPress={() => setDeleteOpen(true)}
        />
      </View>
      {exportError && <Text className="text-subhead text-danger">{exportError}</Text>}
      {signOutAction.confirmSheet}
      <DeleteAccountSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </View>
  );
}

function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const confirmRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const deleteMutation = trpc.user.deleteSelf.useMutation({
    meta: { silent: true },
    // UX-ACC-11: the error renders under the password field (below the fold of
    // the sheet it went unseen) and the field takes focus for the retry.
    onError: () => passwordRef.current?.focus(),
    // The server already revoked every session. Drop the local one — and every
    // cached query, the gym data and reminders on this phone (UX-ACC-12) —
    // through the one sign-out, then back to the auth screen.
    onSuccess: async () => {
      // UX-ACC-11: the sign-in screen confirms it once.
      markAccountDeleted();
      await signOut({ reason: 'account-deleted' });
      router.replace('/(auth)');
    },
  });
  // R-24: the reset link lands on the website (no universal links yet), and the
  // in-app forgot-password screen is signed-out only — so a signed-in user who
  // forgot the password asks for the link here, for their own address.
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 5 * 60_000 });
  const email = me.data?.email ?? null;
  const resetMutation = trpc.auth.requestPasswordReset.useMutation({ meta: { silent: true } });
  // WP-22: an account that signs in with Google/Apple only has no password to
  // type — it confirms with a fresh sign-in from the provider instead (`reauth`).
  const identities = trpc.auth.linkedIdentities.useQuery(undefined, {
    staleTime: 30_000,
    enabled: visible,
  });
  const oauthOnly = identities.data?.hasPassword === false;
  const [reauthError, setReauthError] = useState<string | null>(null);
  const confirmed = confirmText.trim().toUpperCase() === COPY.confirmWord;
  const ready = password.length > 0 && confirmed;

  // R-17: iOS offers "Save Password?" when a secure field that still holds
  // text leaves the screen. Empty it before the sheet goes away (close, or the
  // delete request — which uses the captured value).
  const close = () => {
    setPassword('');
    setReauthError(null);
    onClose();
  };
  const submitDelete = () => {
    const typed = password;
    setPassword('');
    deleteMutation.mutate({ password: typed, confirm: COPY.confirmWord });
  };
  const submitReauth = (reauth: {
    provider: SocialProvider;
    idToken: string;
    nonce?: string | undefined;
  }) => {
    setReauthError(null);
    deleteMutation.mutate({
      reauth: {
        provider: reauth.provider,
        idToken: reauth.idToken,
        ...(reauth.nonce ? { nonce: reauth.nonce } : {}),
      },
      confirm: COPY.confirmWord,
    });
  };
  const errorLine =
    reauthError ?? (deleteMutation.isError ? userFacingErrorMessage(deleteMutation.error) : null);
  // R-03: with the keyboard up, the first tap on a footer button only closed
  // the keyboard (the sheet drops as it hides and the press is cancelled). Once
  // DELETE is typed there is nothing left to type, so close the keyboard then —
  // the button settles in place and one tap deletes.
  const onConfirmTextChange = (text: string) => {
    setConfirmText(text);
    if (text.trim().toUpperCase() === COPY.confirmWord) Keyboard.dismiss();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={COPY.title}
      testID="delete-account"
      footer={
        <View className="gap-2">
          {oauthOnly ? (
            <ReauthButtons
              identities={identities.data?.identities ?? []}
              confirmed={confirmed}
              pending={deleteMutation.isPending}
              onCredential={submitReauth}
              onError={setReauthError}
            />
          ) : (
            <Button
              testID="delete-account-confirm"
              variant="destructive"
              size="lg"
              disabled={!ready}
              loading={deleteMutation.isPending}
              onPress={submitDelete}
            >
              {COPY.submit}
            </Button>
          )}
          <Button testID="delete-account-cancel" variant="outline" size="lg" onPress={close}>
            {COPY.cancel}
          </Button>
        </View>
      }
    >
      <View className="gap-3">
        <Text className="text-headline font-semibold text-label">{COPY.permanent}</Text>
        <View testID="delete-account-summary" className="gap-1">
          <Text className="text-subhead text-label">{COPY.listHeading}</Text>
          {COPY.deleted.map((line) => (
            <View key={line} className="flex-row gap-2">
              <Text className="text-subhead text-label-secondary">•</Text>
              <Text className="min-w-0 flex-1 text-subhead text-label-secondary">{line}</Text>
            </View>
          ))}
          <Text className="text-caption text-label-tertiary">{COPY.backups}</Text>
        </View>
        {oauthOnly ? (
          <View testID="delete-account-reauth" className="gap-1">
            <Text className="text-subhead font-semibold text-label">{COPY.reauthTitle}</Text>
            <Text className="text-subhead text-label-secondary">{COPY.reauthHint}</Text>
          </View>
        ) : (
          <>
            <Text className="text-subhead font-semibold text-label">{COPY.passwordLabel}</Text>
            <PasswordInput
              ref={passwordRef}
              testID="delete-account-password"
              accessibilityLabel={COPY.passwordLabel}
              // R-17: this is a confirmation field for an account that is about to
              // disappear — keep iOS from offering to save its password.
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmRef.current?.focus()}
              value={password}
              onChangeText={(text) => {
                if (deleteMutation.isError) deleteMutation.reset();
                setPassword(text);
              }}
            />
          </>
        )}
        {errorLine && (
          <Text
            testID="delete-account-error"
            accessibilityRole="alert"
            className="text-subhead text-danger"
          >
            {errorLine}
          </Text>
        )}
        {email ? (
          resetMutation.isSuccess ? (
            <Text testID="delete-account-reset-sent" className="text-subhead text-label-secondary">
              {COPY.resetSentTo} {email}. {COPY.resetSentHint}
            </Text>
          ) : (
            <Pressable
              testID="delete-account-forgot-password"
              accessibilityRole="link"
              disabled={resetMutation.isPending}
              onPress={() => resetMutation.mutate({ email })}
              className="min-h-11 justify-center self-start"
            >
              <Text className="text-subhead font-semibold text-brand">
                {resetMutation.isPending ? COPY.resetSending : COPY.forgotPassword}
              </Text>
            </Pressable>
          )
        ) : null}
        {resetMutation.isError && (
          <Text testID="delete-account-reset-error" className="text-subhead text-danger">
            {userFacingErrorMessage(resetMutation.error)}
          </Text>
        )}
        <Text className="text-subhead font-semibold text-label">{COPY.confirmLabel}</Text>
        {/* UX-ACC-26: `Input` scrolls itself clear of the keyboard inside the
            Sheet; the footer buttons sit in the sheet's persist-taps footer, so
            the first tap on Cancel / Delete lands even with the keyboard up. */}
        <Input
          ref={confirmRef}
          testID="delete-account-confirm-text"
          accessibilityLabel={COPY.confirmLabel}
          autoCapitalize="characters"
          autoCorrect={false}
          // R-03: "Done" closes the keyboard so the footer button is one tap away.
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => Keyboard.dismiss()}
          value={confirmText}
          onChangeText={onConfirmTextChange}
        />
      </View>
    </Sheet>
  );
}

const REAUTH_LABEL: Record<SocialProvider, string> = {
  APPLE: COPY.reauthApple,
  GOOGLE: COPY.reauthGoogle,
};

const REAUTH_KEY: Record<SocialProvider, 'apple' | 'google'> = {
  APPLE: 'apple',
  GOOGLE: 'google',
};

// Footer for an OAuth-only account: one destructive button per connected
// provider this device can run. Each starts that provider's native sheet again
// (fresh token, fresh nonce); its `sub` must belong to an identity linked to
// this account, which the API checks.
function ReauthButtons({
  identities,
  confirmed,
  pending,
  onCredential,
  onError,
}: {
  identities: LinkedIdentity[];
  confirmed: boolean;
  pending: boolean;
  onCredential: (reauth: { provider: SocialProvider; idToken: string; nonce?: string }) => void;
  onError: (message: string | null) => void;
}) {
  const providers = useSocialProviders();
  const [requesting, setRequesting] = useState<SocialProvider | null>(null);
  const usable = identities.filter((i) => providers[REAUTH_KEY[i.provider]] !== null);

  async function start(provider: SocialProvider) {
    if (requesting || pending) return;
    onError(null);
    setRequesting(provider);
    try {
      const { idToken, nonce } = await requestProviderCredential(providers, REAUTH_KEY[provider]);
      onCredential({ provider, idToken, ...(nonce ? { nonce } : {}) });
    } catch (err) {
      onError(socialErrorMessage(err));
    } finally {
      setRequesting(null);
    }
  }

  if (usable.length === 0) {
    return (
      <Text
        testID="delete-account-reauth-unavailable"
        className="text-subhead text-label-secondary"
      >
        {REAUTH_UNAVAILABLE}
      </Text>
    );
  }
  return (
    <>
      {!confirmed && (
        <Text
          testID="delete-account-reauth-type-first"
          className="text-subhead text-label-secondary"
        >
          {COPY.reauthTypeFirst}
        </Text>
      )}
      {usable.map((identity) => (
        <Button
          key={identity.provider}
          testID={`delete-account-reauth-${identity.provider.toLowerCase()}`}
          variant="destructive"
          size="lg"
          accessibilityLabel={`${REAUTH_LABEL[identity.provider]} (${SOCIAL_PROVIDER_LABELS[identity.provider]})`}
          disabled={!confirmed || pending || requesting !== null}
          loading={requesting === identity.provider || (pending && requesting === null)}
          onPress={() => void start(identity.provider)}
        >
          {REAUTH_LABEL[identity.provider]}
        </Button>
      ))}
    </>
  );
}

const REAUTH_UNAVAILABLE =
  'We can’t open your connected sign-in on this device. Set a password with the reset email above, then come back to delete.';
