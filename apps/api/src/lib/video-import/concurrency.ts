import { VideoImportError } from './errors.js';
import type { IVideoTranscriber, VideoTranscript } from './transcript.js';

// ─── Video import concurrency gate (Phase 1 guardrails) ───────────────────────
// yt-dlp + ffmpeg are the heaviest thing the API runs (a download, a transcode,
// a child process each) and the production VM has 1 GB of RAM. At most `slots`
// imports run at once (VIDEO_IMPORT_CONCURRENCY, default 1); a request that
// finds every slot taken fails fast with BUSY ("try again in a minute") rather
// than queueing — a queued request would hold an HTTP connection open for the
// length of someone else's download. The import's daily quota reservation is
// refunded on any failure (RecipeImportService.previewVideo), BUSY included.

export class ConcurrencyLimitedTranscriber implements IVideoTranscriber {
  private active = 0;

  constructor(
    private readonly inner: IVideoTranscriber,
    private readonly slots: number,
  ) {}

  /** Imports running right now (tests, logs). */
  get running(): number {
    return this.active;
  }

  async transcribe(url: string): Promise<VideoTranscript> {
    if (this.active >= this.slots) {
      throw new VideoImportError('BUSY', `all ${this.slots} video import slot(s) in use`);
    }
    this.active += 1;
    try {
      return await this.inner.transcribe(url);
    } finally {
      this.active -= 1;
    }
  }
}
