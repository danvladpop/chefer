import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import type { ColorRole } from '@chefer/tokens';
import {
  Button,
  EmptyState,
  Screen,
  Text,
  useResolvedScheme,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  LEGAL_TITLES,
  legalAnchorFor,
  legalDocFor,
  legalWebPath,
} from '../../src/features/legal/legal-docs';
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

// UX-ACC-19: only `terms` and `privacy` exist; any other `/legal/<x>` is a
// "page not found" (it used to show Terms). `?anchor=analytics` opens a
// `#section` of the page — the guard stays pinned to the page itself.

// The legal pages are the website's own (light-only) Terms/Privacy pages. At
// night the WebView gets a stylesheet in the role colours before the page
// paints, so it is not a white sheet inside a dark app. By day nothing is
// injected and the page is untouched.
function nightStyleScript(colors: Record<ColorRole, string>): string {
  const css = [
    `html,body{background:${colors.canvas} !important;color:${colors.labelSecondary} !important;color-scheme:dark}`,
    `h1,h2,h3,strong,.text-gray-900{color:${colors.label} !important}`, // drift-ok: selector for the website's own light-only class names
    `p,li,div,span,.text-gray-700,.text-gray-600,.text-gray-500{color:${colors.labelSecondary} !important}`, // drift-ok: selector for the website's own light-only class names
    `a{color:${colors.brand} !important}`,
    `table,th,td,hr{border-color:${colors.separator} !important}`,
  ].join('');
  return `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css)};(document.head||document.documentElement).appendChild(s);})();true;`;
}

export default function LegalDocScreen() {
  const colors = useThemeColors();
  const scheme = useResolvedScheme();
  const params = useLocalSearchParams<{ doc: string; anchor?: string }>();
  const doc = legalDocFor(params.doc);
  const anchor = legalAnchorFor(params.anchor);
  const title = doc ? LEGAL_TITLES[doc] : 'Legal';
  // The guard compares against the bare page; the WebView opens at the anchor.
  const pageUrl = getWebUrl(legalWebPath(doc ?? 'terms'));
  const sourceUrl = anchor ? `${pageUrl}#${anchor}` : pageUrl;
  const [loading, setLoading] = useState(true);
  // Bumping the key remounts the WebView, which is how "Try again" reloads it.
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 border-b border-separator px-4 py-3">
        <Pressable
          testID="legal-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color={colors.label} />
        </Pressable>
        <Text testID="legal-title" variant="title">
          {title}
        </Text>
      </View>
      {doc === null ? (
        <View testID="legal-not-found" className="flex-1 justify-center">
          <EmptyState
            title="We couldn’t find that page"
            description="The Terms of Service and the Privacy Policy are the documents that live here."
          />
          <View className="gap-2 px-6">
            <Button
              testID="legal-open-terms"
              variant="outline"
              onPress={() => router.replace('/legal/terms')}
            >
              Read the Terms of Service
            </Button>
            <Button
              testID="legal-open-privacy"
              variant="outline"
              onPress={() => router.replace('/legal/privacy')}
            >
              Read the Privacy Policy
            </Button>
          </View>
        </View>
      ) : failed ? (
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
            key={`${attempt}-${scheme}`}
            testID="legal-webview"
            source={{ uri: sourceUrl }}
            style={{ backgroundColor: colors.canvas }}
            injectedJavaScriptBeforeContentLoaded={
              scheme === 'dark' ? nightStyleScript(colors) : undefined
            }
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
              className="absolute inset-0 items-center justify-center bg-canvas"
            >
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
