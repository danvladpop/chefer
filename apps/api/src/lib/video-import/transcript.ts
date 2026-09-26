import type { VideoPlatform, VideoTranscriptSource } from '@chefer/types';
import { parseVideoUrl } from '@chefer/utils';
import { tooLongMessage, VideoImportError } from './errors.js';
import {
  captionCarriesRecipe,
  MIN_USABLE_CAPTION_CHARS,
  MIN_USABLE_TRANSCRIPT_CHARS,
  pickSubtitleTrack,
  speechToText,
  subtitlesToText,
} from './text.js';
import type { ISpeechToText } from './whisper.js';
import type { IVideoFetcher, VideoInfo } from './ytdlp.js';

// ─── Video → words (the transcript pipeline) ─────────────────────────────────
// Cheapest source first, stopping at the first that carries a recipe:
//   (a) the caption/description   — metadata only, no media;
//   (b) subtitles / auto-captions — a few KB of text;
//   (c) the audio, transcribed by Whisper — only when (a) and (b) came up
//       empty. Audio only (never the frames), capped in length and size, and
//       deleted as soon as it is transcribed.
// A caption that carries only part of the recipe (an ingredient list with no
// method) is still used: it rides along with (b)/(c), and when those fail it
// is returned on its own so the review form can ask for the rest.

export interface VideoTranscript {
  platform: VideoPlatform;
  sourceUrl: string;
  title: string;
  creator: string | null;
  caption: string;
  /** Subtitles or speech text; null when the caption alone was used. */
  transcript: string | null;
  source: VideoTranscriptSource;
  durationSecs: number | null;
  thumbnailUrl: string | null;
}

export interface IVideoTranscriber {
  transcribe(url: string): Promise<VideoTranscript>;
}

export interface TranscriberLimits {
  /** Longest video read, in seconds (VIDEO_MAX_SECONDS). */
  maxSeconds: number;
  /** Largest source download yt-dlp may start (VIDEO_MAX_DOWNLOAD_MB). */
  maxDownloadBytes: number;
}

type Log = (message: string) => void;

export class VideoTranscriber implements IVideoTranscriber {
  constructor(
    private readonly fetcher: IVideoFetcher,
    /** Null when no Whisper endpoint is configured: step (c) is skipped. */
    private readonly speech: ISpeechToText | null,
    private readonly limits: TranscriberLimits,
    private readonly log: Log = (m) => console.warn(`[video-import] ${m}`),
  ) {}

  async transcribe(rawUrl: string): Promise<VideoTranscript> {
    const parsed = parseVideoUrl(rawUrl);
    if (!parsed) throw new VideoImportError('UNSUPPORTED_SITE', rawUrl);
    const { url, platform } = parsed;

    const info = await this.fetcher.probe(url);
    if (info.isLive) throw new VideoImportError('UNSUPPORTED_SITE', 'live stream');
    if (info.durationSecs !== null && info.durationSecs > this.limits.maxSeconds) {
      throw this.tooLong(`${info.durationSecs}s`);
    }

    const caption = info.description;
    const base = {
      platform,
      sourceUrl: info.webpageUrl,
      title: info.title,
      creator: info.creator,
      caption,
      durationSecs: info.durationSecs,
      thumbnailUrl: info.thumbnailUrl,
    };

    // (a) The caption carries the whole recipe — nothing else is fetched.
    if (captionCarriesRecipe(caption)) {
      return { ...base, transcript: null, source: 'caption' };
    }

    // (b) Subtitles / auto-captions.
    const subtitles = await this.trySubtitles(url, info);
    if (subtitles) return { ...base, transcript: subtitles, source: 'subtitles' };

    // (c) Speech. Errors that are about THIS video (too long, too large)
    // still fall back to a partial caption before giving up.
    let speechError: VideoImportError | null = null;
    if (this.speech) {
      try {
        const speech = await this.trySpeech(url, info);
        if (speech) return { ...base, transcript: speech, source: 'speech' };
      } catch (error) {
        if (!(error instanceof VideoImportError)) throw error;
        this.log(`speech step failed (${error.code}): ${error.detail ?? error.message}`);
        speechError = error;
      }
    }

    if (caption.length >= MIN_USABLE_CAPTION_CHARS) {
      return { ...base, transcript: null, source: 'caption' };
    }
    if (speechError?.code === 'TOO_LONG') throw this.tooLong(speechError.detail);
    if (speechError && speechError.code !== 'NO_SPEECH') throw speechError;
    throw new VideoImportError('NO_SPEECH', 'no caption, subtitles or speech');
  }

  private async trySubtitles(url: string, info: VideoInfo): Promise<string | null> {
    const track = pickSubtitleTrack(info);
    if (!track) return null;
    try {
      const raw = await this.fetcher.fetchSubtitles(url, track);
      const text = raw ? subtitlesToText(raw) : '';
      return text.length >= MIN_USABLE_TRANSCRIPT_CHARS ? text : null;
    } catch (error) {
      // Subtitles are an optimisation: any failure moves on to speech.
      this.log(
        `subtitles (${track.lang}${track.auto ? ', auto' : ''}) failed: ${
          error instanceof VideoImportError ? (error.detail ?? error.code) : String(error)
        }`,
      );
      return null;
    }
  }

  private async trySpeech(url: string, info: VideoInfo): Promise<string | null> {
    if (!this.speech) return null;
    const audio = await this.fetcher.downloadAudio(url, this.limits);
    const language = info.language ? info.language.toLowerCase().slice(0, 2) : undefined;
    const result = await this.speech.transcribe(audio, language ? { language } : {});
    const text = speechToText(result);
    return text.length >= MIN_USABLE_TRANSCRIPT_CHARS ? text : null;
  }

  private tooLong(detail?: string): VideoImportError {
    return new VideoImportError('TOO_LONG', detail, tooLongMessage(this.limits.maxSeconds));
  }
}
