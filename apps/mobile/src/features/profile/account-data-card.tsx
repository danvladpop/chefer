import { useState } from 'react';
import { Share, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Sheet, Text } from '@chefer/ui-mobile';
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
          onPress={() => setDeleteOpen(true)}
        >
          Delete account
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
  const deleteMutation = trpc.user.deleteSelf.useMutation({
    onSuccess: async () => {
      await clearToken();
      router.replace('/(auth)');
    },
  });
  const ready = password.length > 0 && confirmText === 'DELETE';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Delete your account?"
      footer={
        <View className="gap-2">
          <Button
            testID="delete-account-confirm"
            disabled={!ready}
            loading={deleteMutation.isPending}
            onPress={() => deleteMutation.mutate({ password, confirm: 'DELETE' })}
          >
            Delete my account
          </Button>
          <Button variant="ghost" onPress={onClose}>
            Cancel
          </Button>
        </View>
      }
    >
      <View className="gap-3">
        <Text variant="muted" className="text-sm">
          This permanently deletes your plans, logs, recipes, workouts and preferences. It
          can&apos;t be undone.
        </Text>
        <Text className="text-sm font-medium text-gray-800">Your password</Text>
        <TextInput
          accessibilityLabel="Your password"
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          className="min-h-11 rounded-lg border border-gray-300 px-3 text-base"
        />
        <Text className="text-sm font-medium text-gray-800">Type DELETE to confirm</Text>
        <TextInput
          accessibilityLabel="Type DELETE to confirm"
          autoCapitalize="characters"
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
