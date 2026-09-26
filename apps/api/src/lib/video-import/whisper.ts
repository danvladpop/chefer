import { VideoImportError } from './errors.js';
import type { DownloadedAudio } from './ytdlp.js';

// ─── Speech-to-text (Groq Whisper) ───────────────────────────────────────────
// The last-resort transcript: used only when a video has neither a recipe in
// its caption nor subtitles. OpenAI-compatible `/audio/transcriptions` at
// AI_SECONDARY_BASE_URL (Groq by default), model WHISPER_MODEL
// (whisper-large-v3-turbo). Checked against console.groq.com/docs/speech-to-text
// on 2026-09-26: multipart `file` + `model`, `response_format=verbose_json`
// returns `segments[]` with `no_speech_prob`; 25 MB upload cap on the free
// tier; billed per audio second with a 10 s minimum.

export interface TranscriptSegment {
  text: string;
  /** Whisper's own estimate that the segment is not speech (music, silence). */
  noSpeechProb: number;
}

export interface SpeechTranscript {
  text: string;
  segments: TranscriptSegment[];
  language: string | null;
}

export interface ISpeechToText {
  transcribe(audio: DownloadedAudio, options?: { language?: string }): Promise<SpeechTranscript>;
}

const WHISPER_TIMEOUT_MS = 90_000;

interface VerboseJson {
  text?: string;
  language?: string;
  segments?: { text?: string; no_speech_prob?: number }[];
}

export class GroqWhisperClient implements ISpeechToText {
  constructor(
    private readonly config: { apiKey: string; baseUrl: string; model: string },
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async transcribe(
    audio: DownloadedAudio,
    options: { language?: string } = {},
  ): Promise<SpeechTranscript> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(audio.data)], { type: audio.mimeType }),
      audio.filename,
    );
    form.append('model', this.config.model);
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');
    // A 2-letter hint helps accuracy; anything else is left to auto-detect.
    if (options.language && /^[a-z]{2}$/.test(options.language)) {
      form.append('language', options.language);
    }

    let response: Response;
    try {
      response = await this.fetchFn(
        `${this.config.baseUrl.replace(/\/$/, '')}/audio/transcriptions`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(WHISPER_TIMEOUT_MS),
        },
      );
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new VideoImportError('TIMEOUT', 'whisper timed out');
      }
      throw new VideoImportError('FAILED', `whisper request failed: ${String(error)}`);
    }

    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 300);
      if (response.status === 413) throw new VideoImportError('TOO_LARGE', `whisper 413 ${body}`);
      if (response.status === 429 || response.status >= 500) {
        throw new VideoImportError('UNAVAILABLE', `whisper ${response.status} ${body}`);
      }
      throw new VideoImportError('FAILED', `whisper ${response.status} ${body}`);
    }

    const json = (await response.json()) as VerboseJson;
    return {
      text: json.text?.trim() ?? '',
      language: json.language ?? null,
      segments: (json.segments ?? []).map((s) => ({
        text: s.text?.trim() ?? '',
        noSpeechProb: typeof s.no_speech_prob === 'number' ? s.no_speech_prob : 0,
      })),
    };
  }
}
