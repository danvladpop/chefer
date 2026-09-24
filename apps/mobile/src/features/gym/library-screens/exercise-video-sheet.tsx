import { useState } from 'react';
import { Linking, View } from 'react-native';
import WebView from 'react-native-webview';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { useIsOnline } from './online-status';

// Technique-video sheet (gym_plan.md §5.5): a YouTube iframe over WebView,
// with baseUrl set to the API's public origin so YouTube gets a referrer
// (bare `about:blank`/no-origin embeds are rejected with error 153). The
// "Open in YouTube" fallback is ALWAYS visible under the player, and is the
// only option offline or once the embed errors.
const EMBED_ORIGIN = 'https://chefer.duckdns.org';

function embedHtml(videoId: string, startSec: number): string {
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?start=${startSec}&playsinline=1&rel=0`;
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<style>html,body{margin:0;padding:0;background:#000;height:100%;}iframe{width:100%;height:100%;border:0;}</style>
</head><body><iframe src="${src}" allow="autoplay; encrypted-media" allowfullscreen></iframe></body></html>`;
}

export interface ExerciseVideoSheetProps {
  visible: boolean;
  onClose: () => void;
  videoId: string;
  startSec: number;
  channel: string | null;
  testID?: string;
}

export function ExerciseVideoSheet({
  visible,
  onClose,
  videoId,
  startSec,
  channel,
  testID = 'exercise-video-sheet',
}: ExerciseVideoSheetProps) {
  const online = useIsOnline();
  const [webviewError, setWebviewError] = useState(false);
  const showPlayer = online && !webviewError;
  const youtubeUrl = `https://youtu.be/${videoId}?t=${startSec}`;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Watch technique"
      testID={testID}
      scrollable={false}
    >
      <View className="gap-3">
        {showPlayer ? (
          <View
            testID={`${testID}-player`}
            className="w-full overflow-hidden rounded-xl bg-black"
            style={{ aspectRatio: 16 / 9 }}
          >
            <WebView
              testID={`${testID}-webview`}
              source={{ html: embedHtml(videoId, startSec), baseUrl: EMBED_ORIGIN }}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              onError={() => setWebviewError(true)}
              onHttpError={() => setWebviewError(true)}
              style={{ flex: 1, backgroundColor: 'black' }}
            />
          </View>
        ) : (
          <View
            testID={`${testID}-fallback-panel`}
            className="w-full items-center justify-center rounded-xl bg-muted"
            style={{ aspectRatio: 16 / 9 }}
          >
            <Text variant="muted">
              {online ? 'Video unavailable right now.' : 'You’re offline.'}
            </Text>
          </View>
        )}
        <Button
          testID={`${testID}-open-youtube`}
          variant="outline"
          onPress={() => void Linking.openURL(youtubeUrl)}
        >
          Open in YouTube
        </Button>
        {channel ? (
          <Text variant="muted" testID={`${testID}-channel`}>
            Video: {channel}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
