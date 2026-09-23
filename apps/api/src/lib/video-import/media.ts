import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// ─── Short-video media fetching (recipe dataset pipeline) ────────────────────
// Shells out to yt-dlp (metadata + download) and ffmpeg (downscale). Both are
// behind IMediaFetcher so the two-stage extractor is unit-testable without
// either binary — and so the service never grows a hard dependency on a
// subprocess it cannot stub.
//
// DEPLOYMENT: any container that runs the download path needs yt-dlp + ffmpeg
// on PATH (see infrastructure.md §12). The metadata path needs only yt-dlp.

/** Metadata + caption, fetched WITHOUT downloading the video itself. */
export interface VideoMetadata {
  /** The creator's caption/description. Often the whole ingredient list. */
  caption: string;
  /** Canonical post URL, stored as Recipe.sourceUrl provenance. */
  sourceUrl: string;
  creator: string | null;
  durationSecs: number | null;
}

export interface DownloadedVideo {
  base64: string;
  mimeType: string;
  /** Raw (pre-base64) byte length, for logging and cap decisions. */
  bytes: number;
  /** True when the clip had to be re-encoded to fit the inline cap. */
  downscaled: boolean;
}

export interface IMediaFetcher {
  fetchMetadata(url: string): Promise<VideoMetadata>;
  downloadVideo(url: string): Promise<DownloadedVideo>;
}

/**
 * Raw-bytes threshold above which a clip is re-encoded before upload.
 *
 * Gemini's inline-data ceiling applies to the *encoded* request, and base64
 * inflates by 4/3 — so 12 MB of mp4 becomes ~16 MB on the wire, leaving room
 * under the 20 MB limit for the caption and the prompt. A 15 s vertical reel
 * runs ~15 MB raw, so this trips more often than it looks like it should.
 */
const DOWNSCALE_THRESHOLD_BYTES = 12 * 1024 * 1024;

const YTDLP_TIMEOUT_MS = 120_000;
const FFMPEG_TIMEOUT_MS = 180_000;

/** yt-dlp writes progress to stdout; anything parsing stdout must not see it. */
const QUIET = ['--no-progress', '--no-warnings'] as const;

interface YtDlpInfo {
  description?: string;
  title?: string;
  uploader?: string;
  webpage_url?: string;
  duration?: number;
}

async function readInfoJson(dir: string): Promise<YtDlpInfo> {
  const name = (await readdir(dir)).find((f) => f.endsWith('.info.json'));
  if (!name) throw new Error('yt-dlp produced no metadata file');
  return JSON.parse(await readFile(join(dir, name), 'utf8')) as YtDlpInfo;
}

export class YtDlpMediaFetcher implements IMediaFetcher {
  /**
   * Stage-1 input: caption only, no media transfer. Cheap enough to run over
   * a whole batch as a pre-filter before spending bandwidth on the videos.
   */
  async fetchMetadata(url: string): Promise<VideoMetadata> {
    const dir = await mkdtemp(join(tmpdir(), 'chefer-meta-'));
    try {
      await run(
        'yt-dlp',
        [
          ...QUIET,
          '--skip-download',
          '--write-info-json',
          '--no-playlist',
          '-o',
          join(dir, 'm.%(ext)s'),
          // End-of-options: a URL can never be parsed as a yt-dlp flag.
          '--',
          url,
        ],
        { timeout: YTDLP_TIMEOUT_MS },
      );
      const info = await readInfoJson(dir);
      // Instagram puts the caption in `description`; some extractors only
      // populate `title`. Joining both costs a few tokens and avoids an
      // empty stage-1 read on platforms that differ.
      const caption = [info.description, info.title].filter(Boolean).join('\n\n').trim();
      return {
        caption,
        sourceUrl: info.webpage_url ?? url,
        creator: info.uploader ?? null,
        durationSecs: info.duration ?? null,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Stage-2 input: the clip itself, downscaled if it would blow the cap. */
  async downloadVideo(url: string): Promise<DownloadedVideo> {
    const dir = await mkdtemp(join(tmpdir(), 'chefer-video-'));
    try {
      await run(
        'yt-dlp',
        [
          ...QUIET,
          '--no-playlist',
          // Prefer one progressive mp4 so no ffmpeg merge step is needed.
          '-f',
          'best[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/best',
          '--merge-output-format',
          'mp4',
          '-o',
          join(dir, 'clip.%(ext)s'),
          '--',
          url,
        ],
        { timeout: YTDLP_TIMEOUT_MS },
      );

      const files = await readdir(dir);
      const name = files.find((f) => f.endsWith('.mp4') || f.endsWith('.webm'));
      if (!name) throw new Error(`yt-dlp produced no video file (got: ${files.join(', ')})`);

      let path = join(dir, name);
      let downscaled = false;
      if ((await stat(path)).size > DOWNSCALE_THRESHOLD_BYTES) {
        path = await this.downscale(path, dir);
        downscaled = true;
      }

      const bytes = await readFile(path);
      return {
        base64: bytes.toString('base64'),
        mimeType: 'video/mp4',
        bytes: bytes.length,
        downscaled,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Re-encodes to fit under the inline cap.
   *
   * Width — not height — is what is capped: these are vertical clips, and
   * scaling by height would leave a 1080x1920 reel at 270 px wide, too narrow
   * to read the on-screen text overlays that carry half the method. Gemini
   * samples video at ~1 fps regardless of source rate, so dropping fps costs
   * nothing in comprehension and buys a lot of file size.
   */
  private async downscale(src: string, dir: string): Promise<string> {
    const out = join(dir, 'downscaled.mp4');
    await run(
      'ffmpeg',
      [
        '-y',
        '-i',
        src,
        '-vf',
        "scale='min(480,iw)':-2",
        '-r',
        '12',
        '-b:v',
        '700k',
        '-b:a',
        '64k',
        '-movflags',
        '+faststart',
        out,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
    );
    return out;
  }
}
