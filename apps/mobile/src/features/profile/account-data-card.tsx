import { useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ACCOUNT_DELETION_COPY as COPY } from '@chefer/types';
import { Button, Card, PasswordInput, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { shareExportFile } from '../../lib/share-file';
import { signOut } from '../../lib/sign-out';
import { trpc } from '../../lib/trpc';

// Mirrors apps/web/src/features/profile/components/AccountDataCard.tsx.
// In-app export and account deletion (audit P0-6): both app stores require
// deletion inside the app for apps that create accounts (F-M-PROF-1-1).
// T-39.5 (bug B-53): a real, named export file (`chefer-export-YYYY-MM-DD.json`)
// instead of an unnamed text blob in the share sheet.

function exportFilename(): string {
  return `chefer-export-${new Date().toISOString().slice(0, 10)}.json`;
}

export function AccountDataCard() {
  const utils = trpc.useUtils();
  const { show } = useSnackbar();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportData() {
    setExporting(true);
    setExportError(null);
    try {
      const data = await utils.user.exportData.fetch();
      await shareExportFile(exportFilename(), JSON.stringify(data, null, 2));
      show({ message: 'Your export is ready.', tone: 'success' });
    } catch {
      setExportError("Couldn't prepare your data. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card testID="profile-your-data" className="min-w-0">
      <Text className="w-full min-w-0 font-semibold text-gray-900">Your data</Text>
      {/* UX-ACC-27: full-width + min-w-0 so iOS wraps instead of clipping mid-word. */}
      <Text testID="profile-your-data-copy" variant="muted" className="mt-1 w-full min-w-0 text-sm">
        Export everything Chefer stores about you, or delete your account for good.
      </Text>
      <View className="mt-3 gap-2">
        <Button variant="outline" loading={exporting} onPress={() => void exportData()}>
          Export my data
        </Button>
        <Button
          testID="profile-delete-account"
          variant="outline"
          className="border-red-200"
          onPress={() => setDeleteOpen(true)}
        >
          <Text className="font-semibold text-red-700">{COPY.button}</Text>
        </Button>
      </View>
      {exportError && <Text className="mt-2 text-sm text-red-700">{exportError}</Text>}
      <DeleteAccountSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </Card>
  );
}

function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const confirmRef = useRef<TextInput>(null);
  const deleteMutation = trpc.user.deleteSelf.useMutation({
    // The server already revoked every session. Drop the local one — and every
    // cached query, the gym data and reminders on this phone (UX-ACC-12) —
    // through the one sign-out, then back to the auth screen.
    onSuccess: async () => {
      await signOut({ reason: 'account-deleted' });
      router.replace('/(auth)');
    },
  });
  // R-24: the reset link lands on the website (no universal links yet), and the
  // in-app forgot-password screen is signed-out only — so a signed-in user who
  // forgot the password asks for the link here, for their own address.
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 5 * 60_000 });
  const email = me.data?.email ?? null;
  const resetMutation = trpc.auth.requestPasswordReset.useMutation();
  const ready = password.length > 0 && confirmText.trim().toUpperCase() === COPY.confirmWord;

  // R-17: iOS offers "Save Password?" when a secure field that still holds
  // text leaves the screen. Empty it before the sheet goes away (close, or the
  // delete request — which uses the captured value).
  const close = () => {
    setPassword('');
    onClose();
  };
  const submitDelete = () => {
    const typed = password;
    setPassword('');
    deleteMutation.mutate({ password: typed, confirm: COPY.confirmWord });
  };
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
          <Button variant="outline" size="lg" onPress={close}>
            {COPY.cancel}
          </Button>
        </View>
      }
    >
      <View className="gap-3">
        <Text className="text-sm font-semibold text-gray-900">{COPY.permanent}</Text>
        <View testID="delete-account-summary" className="gap-1">
          <Text className="text-sm text-gray-800">{COPY.listHeading}</Text>
          {COPY.deleted.map((line) => (
            <View key={line} className="flex-row gap-2">
              <Text className="text-sm text-gray-700">•</Text>
              <Text className="min-w-0 flex-1 text-sm text-gray-700">{line}</Text>
            </View>
          ))}
          <Text variant="muted" className="text-xs">
            {COPY.backups}
          </Text>
        </View>
        <Text className="text-sm font-medium text-gray-800">{COPY.passwordLabel}</Text>
        <PasswordInput
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
          onChangeText={setPassword}
        />
        {email ? (
          resetMutation.isSuccess ? (
            <Text testID="delete-account-reset-sent" className="text-sm text-gray-700">
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
              <Text className="text-sm font-semibold text-primary">
                {resetMutation.isPending ? COPY.resetSending : COPY.forgotPassword}
              </Text>
            </Pressable>
          )
        ) : null}
        {resetMutation.isError && (
          <Text testID="delete-account-reset-error" className="text-sm text-red-700">
            {userFacingErrorMessage(resetMutation.error)}
          </Text>
        )}
        <Text className="text-sm font-medium text-gray-800">{COPY.confirmLabel}</Text>
        <TextInput
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
          className="min-h-11 rounded-lg border border-gray-300 px-3 text-base"
        />
        {deleteMutation.isError && (
          <Text className="text-sm text-red-700">
            {userFacingErrorMessage(deleteMutation.error)}
          </Text>
        )}
      </View>
    </Sheet>
  );
}
