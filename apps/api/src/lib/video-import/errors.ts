// ─── Video import errors ─────────────────────────────────────────────────────
// Every failure of the transcript pipeline becomes one VideoImportError with a
// code the service maps to a tRPC error, and a sentence a cook can act on. The
// raw yt-dlp / Whisper output goes to the log, never to the user.

export type VideoImportErrorCode =
  | 'UNSUPPORTED_SITE'
  | 'PRIVATE'
  | 'NOT_FOUND'
  | 'BLOCKED'
  | 'TOO_LONG'
  | 'TOO_LARGE'
  | 'NO_SPEECH'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'FAILED';

const PASTE_INSTEAD = 'You can paste the recipe text instead.';

export const VIDEO_ERROR_MESSAGES: Record<VideoImportErrorCode, string> = {
  UNSUPPORTED_SITE: 'Paste a YouTube, TikTok or Instagram video link.',
  PRIVATE: `That video is private or needs a login, so we can't read it. ${PASTE_INSTEAD}`,
  NOT_FOUND: "We couldn't find that video — check the link.",
  BLOCKED: `The video site refused to share that video with us right now. Try again later. ${PASTE_INSTEAD}`,
  TOO_LONG: `That video is too long — we read cooking videos up to 10 minutes. ${PASTE_INSTEAD}`,
  TOO_LARGE: `That video's audio is too large for us to read. ${PASTE_INSTEAD}`,
  NO_SPEECH: `We couldn't find a caption, subtitles or speech with a recipe in that video. ${PASTE_INSTEAD}`,
  TIMEOUT: `Reading that video took too long. Try again, or paste the recipe text instead.`,
  UNAVAILABLE: `Video import isn't available right now. ${PASTE_INSTEAD}`,
  FAILED: `We couldn't read that video. ${PASTE_INSTEAD}`,
};

export class VideoImportError extends Error {
  constructor(
    readonly code: VideoImportErrorCode,
    /** Log-only detail (stderr excerpt, status code). */
    readonly detail?: string,
    message: string = VIDEO_ERROR_MESSAGES[code],
  ) {
    super(message);
    this.name = 'VideoImportError';
  }
}

/** Duration cap in the user's words ("10 minutes", "90 seconds"). */
export function tooLongMessage(maxSeconds: number): string {
  const limit =
    maxSeconds % 60 === 0
      ? `${maxSeconds / 60} minute${maxSeconds === 60 ? '' : 's'}`
      : `${maxSeconds} seconds`;
  return `That video is too long — we read cooking videos up to ${limit}. ${PASTE_INSTEAD}`;
}

/**
 * Maps yt-dlp's stderr to a code. yt-dlp's wording drifts between releases, so
 * the patterns are loose, and anything unrecognised is FAILED (logged in full).
 */
export function classifyYtDlpError(stderr: string): VideoImportErrorCode {
  const text = stderr.toLowerCase();
  if (/unsupported url|no suitable extractor/.test(text)) return 'UNSUPPORTED_SITE';
  // YouTube's datacenter-IP bot check: not the user's fault, not a login wall.
  if (/confirm you.?re not a bot|sign in to confirm you/.test(text)) return 'BLOCKED';
  if (
    /private video|video is private|login required|log in|sign in to confirm your age|age-restricted|members-only|requested content is not available|cookies/.test(
      text,
    )
  ) {
    return 'PRIVATE';
  }
  if (
    /video unavailable|not available|removed|does not exist|http error 404|not found/.test(text)
  ) {
    return 'NOT_FOUND';
  }
  if (/max-filesize|larger than max/.test(text)) return 'TOO_LARGE';
  if (/http error 429|too many requests|rate.?limit/.test(text)) return 'BLOCKED';
  return 'FAILED';
}
