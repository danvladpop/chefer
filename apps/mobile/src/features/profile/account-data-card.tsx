import { useState } from 'react';
import { Share, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ACCOUNT_DELETION_COPY as COPY } from '@chefer/types';
import { Button, Card, PasswordInput, Sheet, Text } from '@chefer/ui-mobile';
import { clearToken } from '../../lib/auth-store';
import { trpc } from '../../lib/trpc';

// Mirrors apps/web/src/features/profile/components/AccountDataCard.tsx.
// In-app export and account deletion (audit P0-6): both app stores require
// deletion inside the app for apps that create accounts (F-M-PROF-1-1).

export function AccountDataCard() {
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportData() {
    setExporting(true);
    setExportError(null);
    try {
      const data = await utils.user.exportData.fetch();
      await Share.share({ title: 'My Chefer data', message: JSON.stringify(data, null, 2) });
    } catch {
      setExportError("Couldn't prepare your data. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card testID="profile-your-data">
      <Text className="font-semibold text-gray-900">Your data</Text>
      <Text variant="muted" className="mt-1 text-sm">
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
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const deleteMutation = trpc.user.deleteSelf.useMutation({
    // The server already revoked every session. Drop the local one and every
    // cached (incl. persisted gym) query, then back to the auth screen.
    onSuccess: async () => {
      await clearToken();
      queryClient.clear();
      router.replace('/(auth)');
    },
  });
  const ready = password.length > 0 && confirmText.trim().toUpperCase() === COPY.confirmWord;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
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
            onPress={() => deleteMutation.mutate({ password, confirm: COPY.confirmWord })}
          >
            {COPY.submit}
          </Button>
          <Button variant="outline" size="lg" onPress={onClose}>
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
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />
        <Text className="text-sm font-medium text-gray-800">{COPY.confirmLabel}</Text>
        <TextInput
          testID="delete-account-confirm-text"
          accessibilityLabel={COPY.confirmLabel}
          autoCapitalize="characters"
          autoCorrect={false}
          value={confirmText}
          onChangeText={setConfirmText}
          className="min-h-11 rounded-lg border border-gray-300 px-3 text-base"
        />
        {deleteMutation.isError && (
          <Text className="text-sm text-red-700">{deleteMutation.error.message}</Text>
        )}
      </View>
    </Sheet>
  );
}
