import { env } from '../env.js';
import { MockVideoTranscriber } from './mock.js';
import { VideoTranscriber, type IVideoTranscriber } from './transcript.js';
import { GroqWhisperClient } from './whisper.js';
import { YtDlpVideoFetcher } from './ytdlp.js';

// The one place the transcript pipeline reads env (kept out of index.ts so the
// pure modules stay importable in tests without a full API env).

export function createVideoTranscriber(): IVideoTranscriber {
  if (env.AI_MOCK_ENABLED) return new MockVideoTranscriber();
  const speech = env.AI_SECONDARY_API_KEY
    ? new GroqWhisperClient({
        apiKey: env.AI_SECONDARY_API_KEY,
        baseUrl: env.AI_SECONDARY_BASE_URL,
        model: env.WHISPER_MODEL,
      })
    : null;
  return new VideoTranscriber(new YtDlpVideoFetcher(), speech, {
    maxSeconds: env.VIDEO_MAX_SECONDS,
    maxDownloadBytes: env.VIDEO_MAX_DOWNLOAD_MB * 1024 * 1024,
  });
}
