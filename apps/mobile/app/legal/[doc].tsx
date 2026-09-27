import { Pressable, View } from 'react-native';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Text } from '@chefer/ui-mobile';
import { getWebUrl } from '../../src/lib/api-url';

// T-39.1: the in-app legal screen — `react-native-webview` is already linked
// in both release binaries (03 §UX-39), so Terms/Privacy open without leaving
// the app (and without losing the register form, whose in-progress values
// are cached by `register-draft.ts` across this navigation). Reached from
// Register's consent line and from More/Settings; `router.back()` returns to
// wherever it was opened from.

const TITLES: Record<string, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const path = doc === 'privacy' ? '/privacy' : '/terms';
  const title = TITLES[doc] ?? 'Legal';

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable
          testID="legal-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <Text testID="legal-title" variant="title">
          {title}
        </Text>
      </View>
      <WebView testID="legal-webview" source={{ uri: getWebUrl(path) }} className="flex-1" />
    </Screen>
  );
}
