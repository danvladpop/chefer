import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, colors, Screen, Text } from '@chefer/ui-mobile';
import { getWebUrl } from '../../src/lib/api-url';
import { shouldLoadLegalUrl } from '../../src/lib/webview-guard';

// T-39.1: the in-app legal screen — `react-native-webview` is already linked
// in both release binaries (03 §UX-39), so Terms/Privacy open without leaving
// the app (and without losing the register form, whose in-progress values
// are cached by `register-draft.ts` across this navigation). Reached from
// Register's consent line and from More/Settings; `router.back()` returns to
// wherever it was opened from.
//
// App Review R-01: the view is pinned to the requested page (and its own
// anchors). Every other link on it — "Back to Chefer", /login, /support,
// outside sites, mailto: — opens in the system browser and is cancelled here,
// so this can never be used to browse the website inside the app.

const TITLES: Record<string, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const path = doc === 'privacy' ? '/privacy' : '/terms';
  const title = TITLES[doc] ?? 'Legal';
  const pageUrl = getWebUrl(path);
  const [loading, setLoading] = useState(true);
  // Bumping the key remounts the WebView, which is how "Try again" reloads it.
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

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
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </Pressable>
        <Text testID="legal-title" variant="title">
          {title}
        </Text>
      </View>
      {failed ? (
        <View testID="legal-error" className="flex-1 items-center justify-center gap-3 px-6">
          <Text variant="muted" className="text-center">
            Couldn’t load this page. Check your connection and try again.
          </Text>
          <Button
            testID="legal-retry"
            variant="outline"
            onPress={() => {
              setFailed(false);
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </View>
      ) : (
        <View className="flex-1">
          <WebView
            key={attempt}
            testID="legal-webview"
            source={{ uri: pageUrl }}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(req) => {
              const allowed = shouldLoadLegalUrl(req.url, pageUrl);
              if (!allowed) void Linking.openURL(req.url).catch(() => undefined);
              return allowed;
            }}
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            className="flex-1"
          />
          {loading ? (
            <View
              testID="legal-loading"
              pointerEvents="none"
              className="absolute inset-0 items-center justify-center bg-background"
            >
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
