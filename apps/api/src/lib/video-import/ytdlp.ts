import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyYtDlpError, VideoImportError } from './errors.js';

// ─── yt-dlp + ffmpeg (the only code that shells out) ─────────────────────────
// Three operations, all behind IVideoFetcher so the transcript pipeline is
// unit-testable with neither binary installed:
//   probe          — metadata + the list of subtitle tracks, no media;
//   fetchSubtitles — one subtitle track as text;
//   downloadAudio  — the audio only, re-encoded by ffmpeg to 16 kHz mono
//                    32 kbps mp3 (what Whisper resamples to anyway), so a
//                    10-minute video is ~2.4 MB — far under Groq's 25 MB.
//
// Every temp directory is removed in a `finally`, success or not: the media is
// never stored. The video frames are never read by anything.
//
// DEPLOYMENT: yt-dlp and ffmpeg are baked into Dockerfile.api (pinned — see
// infrastructure.md §12 for bumping yt-dlp, which breaks whenever a platform
// changes its site). Locally: `brew install yt-dlp ffmpeg`.

export interface SubtitleTrackRef {
  lang: string;
  /** True for machine auto-captions (YouTube ASR), false for uploaded subtitles. */
  auto: boolean;
}

export interface VideoInfo {
  title: string;
  /** The creator's caption/description — often the whole ingredient list. */
  description: string;
  creator: string | null;
  /** Canonical post URL, stored as Recipe.sourceUrl provenance. */
  webpageUrl: string;
  durationSecs: number | null;
  thumbnailUrl: string | null;
  /** The video's spoken language when the platform reports it (ISO-639-ish). */
  language: string | null;
  isLive: boolean;
  /** Language codes with uploaded subtitles. */
  subtitleLangs: string[];
  /** Language codes with auto-captions (YouTube lists ~100 machine translations). */
  autoCaptionLangs: string[];
}

export interface DownloadedAudio {
  data: Buffer;
  filename: string;
  mimeType: string;
}

export interface IVideoFetcher {
  probe(url: string): Promise<VideoInfo>;
  fetchSubtitles(url: string, track: SubtitleTrackRef): Promise<string | null>;
  downloadAudio(
    url: string,
    limits: { maxSeconds: number; maxDownloadBytes: number },
  ): Promise<DownloadedAudio>;
}

export type ExecFn = (
  file: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync: ExecFn = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        // Callers classify failures by stderr (private, removed, bot check…).
        reject(
          Object.assign(error instanceof Error ? error : new Error(`${file} failed`), {
            stdout,
            stderr,
          }),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });

/** Only these extractors may run: a URL can never reach yt-dlp's generic extractor. */
const EXTRACTORS = 'youtube,YoutubeYtBe,TikTok,vm.tiktok,Instagram';

const BASE_ARGS = [
  '--ignore-config',
  '--no-cache-dir',
  '--no-progress',
  '--no-warnings',
  '--no-playlist',
  '--ies',
  EXTRACTORS,
  // YouTube needs a JS runtime for its player challenges; node is already in
  // the image (yt-dlp defaults to deno only).
  '--js-runtimes',
  'node',
  '--socket-timeout',
  '15',
] as const;

const PROBE_TIMEOUT_MS = 45_000;
const SUBTITLE_TIMEOUT_MS = 45_000;
const AUDIO_TIMEOUT_MS = 120_000;
const FFMPEG_TIMEOUT_MS = 90_000;
/** yt-dlp's -J output carries every format; YouTube's runs to a few MB. */
const JSON_MAX_BUFFER = 32 * 1024 * 1024;
/** Groq's free-tier upload limit (console.groq.com/docs/speech-to-text). */
export const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

interface RawInfo {
  _type?: string;
  title?: string;
  description?: string;
  uploader?: string;
  channel?: string;
  webpage_url?: string;
  duration?: number;
  thumbnail?: string;
  language?: string;
  is_live?: boolean;
  subtitles?: Record<string, unknown[]>;
  automatic_captions?: Record<string, unknown[]>;
}

function langsWithTracks(tracks: Record<string, unknown[]> | undefined): string[] {
  if (!tracks) return [];
  return Object.entries(tracks)
    .filter(([lang, list]) => lang !== 'live_chat' && Array.isArray(list) && list.length > 0)
    .map(([lang]) => lang);
}

/** Pure: yt-dlp's info JSON → VideoInfo. */
export function toVideoInfo(raw: RawInfo, requestedUrl: string): VideoInfo {
  return {
    title: raw.title?.trim() ?? '',
    description: raw.description?.trim() ?? '',
    creator: raw.uploader ?? raw.channel ?? null,
    webpageUrl: raw.webpage_url ?? requestedUrl,
    durationSecs: typeof raw.duration === 'number' ? Math.round(raw.duration) : null,
    thumbnailUrl: raw.thumbnail?.startsWith('https://') ? raw.thumbnail : null,
    language: raw.language ?? null,
    isLive: raw.is_live === true,
    subtitleLangs: langsWithTracks(raw.subtitles),
    autoCaptionLangs: langsWithTracks(raw.automatic_captions),
  };
}

export class YtDlpVideoFetcher implements IVideoFetcher {
  constructor(
    private readonly exec: ExecFn = execFileAsync,
    private readonly binaries: { ytDlp: string; ffmpeg: string } = {
      ytDlp: 'yt-dlp',
      ffmpeg: 'ffmpeg',
    },
  ) {}

  async probe(url: string): Promise<VideoInfo> {
    const { stdout } = await this.ytDlp(
      [...BASE_ARGS, '--skip-download', '--dump-single-json', '--', url],
      PROBE_TIMEOUT_MS,
      JSON_MAX_BUFFER,
    );
    let raw: RawInfo;
    try {
      raw = JSON.parse(stdout) as RawInfo;
    } catch {
      throw new VideoImportError('FAILED', 'yt-dlp printed no JSON');
    }
    // --no-playlist should prevent this; a playlist here would mean N videos.
    if (raw._type === 'playlist') throw new VideoImportError('UNSUPPORTED_SITE', 'playlist');
    return toVideoInfo(raw, url);
  }

  async fetchSubtitles(url: string, track: SubtitleTrackRef): Promise<string | null> {
    return this.withTempDir('chefer-subs-', async (dir) => {
      await this.ytDlp(
        [
          ...BASE_ARGS,
          '--skip-download',
          track.auto ? '--write-auto-subs' : '--write-subs',
          '--sub-langs',
          track.lang,
          '--sub-format',
          'vtt/srt/best',
          '-o',
          join(dir, 's.%(ext)s'),
          '--',
          url,
        ],
        SUBTITLE_TIMEOUT_MS,
      );
      const name = (await readdir(dir)).find((f) => /\.(vtt|srt)$/.test(f));
      return name ? readFile(join(dir, name), 'utf8') : null;
    });
  }

  async downloadAudio(
    url: string,
    limits: { maxSeconds: number; maxDownloadBytes: number },
  ): Promise<DownloadedAudio> {
    return this.withTempDir('chefer-audio-', async (dir) => {
      const { stdout, stderr } = await this.ytDlp(
        [
          ...BASE_ARGS,
          // Audio only when the platform offers it (YouTube); TikTok and
          // Instagram only serve muxed clips, which ffmpeg strips below.
          '-f',
          'bestaudio/best',
          '--max-filesize',
          String(limits.maxDownloadBytes),
          // "<=?" lets a video with no reported duration through; ffmpeg's
          // -t below still caps what gets transcribed.
          '--match-filter',
          `!is_live & duration <=? ${limits.maxSeconds}`,
          '-o',
          join(dir, 'source.%(ext)s'),
          '--',
          url,
        ],
        AUDIO_TIMEOUT_MS,
      );
      const source = (await readdir(dir)).find(
        (f) => f.startsWith('source.') && !f.endsWith('.part'),
      );
      if (!source) {
        // yt-dlp exits 0 when a size or filter check skips the download.
        const log = `${stdout}\n${stderr}`;
        if (/does not pass filter/i.test(log))
          throw new VideoImportError('TOO_LONG', 'match-filter');
        if (/max-filesize|larger than max/i.test(log)) {
          throw new VideoImportError('TOO_LARGE', 'max-filesize');
        }
        throw new VideoImportError('FAILED', `yt-dlp produced no audio: ${log.slice(0, 300)}`);
      }

      const out = join(dir, 'speech.mp3');
      try {
        await this.exec(
          this.binaries.ffmpeg,
          [
            '-nostdin',
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-i',
            join(dir, source),
            '-vn',
            '-ac',
            '1',
            '-ar',
            '16000',
            '-b:a',
            '32k',
            '-t',
            String(limits.maxSeconds),
            out,
          ],
          { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
        );
      } catch (error) {
        throw toProcessError(error, 'ffmpeg');
      }

      const { size } = await stat(out);
      if (size > WHISPER_MAX_BYTES) throw new VideoImportError('TOO_LARGE', `${size} bytes`);
      if (size === 0) throw new VideoImportError('NO_SPEECH', 'empty audio track');
      return { data: await readFile(out), filename: 'speech.mp3', mimeType: 'audio/mpeg' };
    });
  }

  private async ytDlp(
    args: readonly string[],
    timeout: number,
    maxBuffer = 4 * 1024 * 1024,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await this.exec(this.binaries.ytDlp, args, { timeout, maxBuffer });
    } catch (error) {
      throw toProcessError(error, 'yt-dlp');
    }
  }

  private async withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    try {
      return await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** A failed child process → the right VideoImportError. */
export function toProcessError(error: unknown, tool: 'yt-dlp' | 'ffmpeg'): VideoImportError {
  if (error instanceof VideoImportError) return error;
  const e = error as { code?: unknown; killed?: boolean; signal?: string; stderr?: string };
  if (e.code === 'ENOENT') return new VideoImportError('UNAVAILABLE', `${tool} is not installed`);
  if (e.killed || e.signal === 'SIGTERM')
    return new VideoImportError('TIMEOUT', `${tool} timed out`);
  const stderr = typeof e.stderr === 'string' ? e.stderr : '';
  const code = tool === 'yt-dlp' ? classifyYtDlpError(stderr) : 'FAILED';
  return new VideoImportError(code, `${tool}: ${stderr.trim().slice(0, 500)}`);
}
