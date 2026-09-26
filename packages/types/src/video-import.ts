// ─── Video-link recipe import (transcript pipeline) ──────────────────────────
// A cooking video (YouTube, YouTube Shorts, TikTok, Instagram reel) becomes a
// recipe DRAFT read from its words only — the caption, the subtitles, or a
// speech transcript — never from the video frames. The user reviews the draft
// in an editable form, fills what the video did not say, then saves it.
// Shared by the API, web and mobile so all three agree on the vocabulary.

export const VIDEO_PLATFORMS = ['youtube', 'tiktok', 'instagram'] as const;
export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];

/**
 * Where the recipe text came from, cheapest first:
 * - `caption`   — the creator's caption/description (it carried the recipe);
 * - `subtitles` — the platform's subtitles or auto-captions;
 * - `speech`    — the audio, transcribed by Whisper.
 */
export const VIDEO_TRANSCRIPT_SOURCES = ['caption', 'subtitles', 'speech'] as const;
export type VideoTranscriptSource = (typeof VIDEO_TRANSCRIPT_SOURCES)[number];

/** Draft fields the review form can flag as "not found in the video". */
export const VIDEO_DRAFT_FIELDS = [
  'name',
  'ingredients',
  'instructions',
  'servings',
  'time',
] as const;
export type VideoDraftField = (typeof VIDEO_DRAFT_FIELDS)[number];

/** Copy both review forms use, so web and mobile say exactly the same thing. */
export const VIDEO_IMPORT_COPY = {
  tabLabel: 'Video',
  urlPlaceholder: 'https://www.youtube.com/shorts/… or a TikTok / Instagram reel link',
  intro:
    'Paste a YouTube, TikTok or Instagram cooking video. We read its caption, subtitles or speech, and you check the recipe before saving.',
  unsupportedUrl: 'Paste a YouTube, TikTok or Instagram video link.',
  reading: 'Listening to the video…',
  checkTitle: 'Check the details',
  checkBody: {
    caption:
      "We read this from the video's caption. Correct anything that's off and fill the gaps.",
    subtitles:
      "We read this from the video's captions. Spoken amounts are often vague, so check every quantity.",
    speech:
      "We read this from what's said in the video. Speech-to-text can mishear amounts, so check every quantity.",
  } satisfies Record<VideoTranscriptSource, string>,
  notFound: 'Not found — please add',
  notStated: 'Not stated in the video — please check',
  quantityCheck: 'Amount not heard — please check',
  nutritionNote: 'Nutrition is an estimate from the ingredients.',
  privacyNote:
    'We only read the link you submit. The audio is deleted right after it is transcribed.',
} as const;
